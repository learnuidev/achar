import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type * as iam from 'aws-cdk-lib/aws-iam';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

import { TABLES } from '../generated/service.ts';

/**
 * The read and write grants, one policy statement per table.
 *
 * Two statements per table rather than one, and only for the tables that have
 * indexes. Querying a global secondary index is a `Query` against the *index*,
 * which IAM treats as a different resource from the table — so a grant naming
 * only the table is a table whose listings work and whose lookups do not, and the
 * failure arrives as an `AccessDeniedException` on one screen of an otherwise
 * working application. That is what `TableSpec.grantsIndexes` is for: a table
 * without an index does not get `${tableArn}/index/*` bolted onto its policy.
 *
 * `only` narrows the grant to a list of logical ids, which is how the webhook
 * stack's delivery function is given exactly the two tables it reads and writes
 * rather than the whole product. The default is every table, which is what the
 * API's shared role needs — a handler that resolves a membership reads the
 * membership table, the project table and the profile table before it has done
 * anything a person would recognise as its job.
 */
export function grantTables(
  tables: Record<string, dynamodb.ITable>,
  grantee: iam.IGrantable,
  only?: readonly string[],
): void {
  for (const spec of TABLES) {
    if (only && !only.includes(spec.id)) continue;

    const table = tables[spec.id];

    if (!table) {
      throw new Error(
        `No table named ${spec.id} was handed to this grant — the stack that built the ` +
          'tables is out of step with the service table.',
      );
    }

    table.grant(grantee, ...spec.actions);

    if (spec.grantsIndexes) {
      grantee.grantPrincipal.addToPrincipalPolicy(
        new PolicyStatement({
          actions: spec.actions,
          resources: [`${table.tableArn}/index/*`],
        }),
      );
    }
  }
}
