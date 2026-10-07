import { CfnOutput, RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

import type { AcharConfig } from '../config.ts';
import { importedResources, ownershipOf } from '../config.ts';
import { TABLES } from '../generated/service.ts';
import { tableName as physicalTableName } from '../naming.ts';
import type { TableSpec } from '../types.ts';
import { grantTables } from './grants.ts';

export interface AcharDataStackProps extends StackProps {
  config: AcharConfig;
}

/**
 * The tables, and nothing else.
 *
 * This stack is deployed rarely — its whole point is that it is the one stack a
 * content change never touches — so it is also the one that holds everything the
 * product cannot recreate. Every table is `RemovalPolicy.RETAIN`: `cdk destroy`
 * on this stack stops at the tables and leaves them, which is why deleting an
 * environment is a plan with a checkbox rather than a `destroy` behind a button.
 * A table that CloudFormation felt free to delete is a table it would also feel
 * free to *replace*, and a replaced table is an empty one.
 *
 * The tables are **imported instead of created** when `ownership.tables` is
 * false, which is what a stage that predates this CDK app needs: an imported
 * resource is unmanaged, so a deploy neither changes it nor deletes it.
 */
export class AcharDataStack extends Stack {
  /** The tables, by logical id. Every other stack reads this. */
  readonly tables: Record<string, dynamodb.ITable>;

  constructor(scope: Construct, id: string, props: AcharDataStackProps) {
    super(scope, id, props);

    const { config } = props;
    const own = ownershipOf(config).tables;
    const tables: Record<string, dynamodb.ITable> = {};

    for (const spec of TABLES) {
      tables[spec.id] = own ? this.createTable(spec, config) : this.importTable(spec, config);

      // Published so a person — and the console's DynamoDB tab — can find a
      // table by what it is for rather than by guessing at a physical name.
      new CfnOutput(this, `${spec.id}Name`, {
        value: tables[spec.id].tableName,
        description: `${spec.id}, as the handlers read it from ${spec.envVar}`,
      });
    }

    this.tables = tables;
  }

  /**
   * One table, from its declared key schema.
   *
   * The attribute *types* come from `spec.attributeDefinitions` rather than from
   * the key schema, because DynamoDB needs a type for every key attribute and a
   * key schema only names them. Looking the type up is also what catches a spec
   * that names a key it never defined — which would otherwise be a table CDK
   * silently creates with an attribute nobody can query by.
   */
  private createTable(spec: TableSpec, config: AcharConfig): dynamodb.ITable {
    const hash = spec.keySchema.find((entry) => entry.keyType === 'HASH');
    const range = spec.keySchema.find((entry) => entry.keyType === 'RANGE');

    if (!hash) {
      throw new Error(`Table ${spec.id} declares no HASH key, which DynamoDB requires`);
    }

    const table = new dynamodb.Table(this, spec.id, {
      tableName: physicalTableName(config.stage, spec.id),
      partitionKey: { name: hash.name, type: attributeType(spec, hash.name) },
      sortKey: range ? { name: range.name, type: attributeType(spec, range.name) } : undefined,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      // Content is the product. Point-in-time recovery is the difference between
      // a bad write being an incident and being a loss.
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: spec.ttlAttribute,
    });

    for (const index of spec.globalSecondaryIndexes) {
      const indexHash = index.keySchema.find((entry) => entry.keyType === 'HASH');
      const indexRange = index.keySchema.find((entry) => entry.keyType === 'RANGE');

      if (!indexHash) {
        throw new Error(`Index ${spec.id}.${index.name} declares no HASH key`);
      }

      table.addGlobalSecondaryIndex({
        indexName: index.name,
        partitionKey: { name: indexHash.name, type: attributeType(spec, indexHash.name) },
        sortKey: indexRange
          ? { name: indexRange.name, type: attributeType(spec, indexRange.name) }
          : undefined,
        projectionType: index.projectAll
          ? dynamodb.ProjectionType.ALL
          : dynamodb.ProjectionType.KEYS_ONLY,
      });
    }

    return table;
  }

  /** A table this environment does not own. Named, never touched. */
  private importTable(spec: TableSpec, config: AcharConfig): dynamodb.ITable {
    const name = importedResources(config).tables[spec.id];

    if (!name) {
      throw new Error(
        `ownership.tables is false, so ${spec.id} is imported — but ` +
          `existing.tables has no '${spec.id}'. A config that imports has to name what it imports.`,
      );
    }

    return dynamodb.Table.fromTableName(this, spec.id, name);
  }

  /**
   * The read and write grants for this environment's tables.
   *
   * The logic lives in `grants.ts` because the webhook stack needs the same
   * thing for two tables, and a rule about index ARNs written twice is a rule
   * that will be right once.
   */
  grantTables(grantee: iam.IGrantable, only?: readonly string[]): void {
    grantTables(this.tables, grantee, only);
  }
}

/** A key attribute's type, looked up rather than assumed. */
function attributeType(spec: TableSpec, attribute: string): dynamodb.AttributeType {
  const definition = spec.attributeDefinitions.find((entry) => entry.name === attribute);

  if (!definition) {
    throw new Error(
      `Table ${spec.id} names key attribute '${attribute}' but declares no type for it in ` +
        'attributeDefinitions, so the table would be created with a key nobody can query by.',
    );
  }

  switch (definition.type) {
    case 'N':
      return dynamodb.AttributeType.NUMBER;
    case 'B':
      return dynamodb.AttributeType.BINARY;
    default:
      return dynamodb.AttributeType.STRING;
  }
}
