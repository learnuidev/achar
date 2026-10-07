import type {
  TableDetailView,
  TableIndexView,
  TableItemsView,
  TableKeyView,
  TableSummaryList,
  TableSummaryView,
} from "@/lib/types";
import { plural } from "@/lib/format";
import { awsJson, describeStack, type AwsContext } from "./aws";
import { ownershipOf, readConfig } from "./environments";

/**
 * The environment's DynamoDB tables, read out of the account.
 *
 * ## Where the names come from, and why it is the data stack
 *
 * Achar's ten tables are named `achar-<stage>-<kebab-of-id>` —
 * `achar-dev-documents-table` — and every one of them is published by the Data
 * stack as a `<TableId>Name` output, which is also how the handlers are told
 * what to read. So the list is one `describe-stacks` on
 * `AcharDataStack-<stage>`: one call, and the answer is exactly the set of
 * tables this environment's own functions were deployed against.
 *
 * The other way is `aws dynamodb list-tables`, and it is worse for a reason
 * that is not taste. It has **no prefix option** — `s3api list-objects` and
 * `logs describe-log-groups` both do, and this one does not — so it answers with
 * every table in the account and leaves this process to work out which of them
 * are this stage's. `startsWith("achar-dev-")` looks like that work and is not:
 * it is a guess at a naming convention, and it is wrong about the case that
 * matters most, which is a stage that **imports** its tables
 * (`ownership.tables` false) and holds names that have nothing to do with the
 * stage reading them. The config could answer instead — and the config is a
 * file: a stage whose stack is deployed and whose file is stale would list
 * tables nobody can open. The stack's outputs are the account's own answer, and
 * there is no third thing to keep in step.
 *
 * ## Why the list is one call and the counts are another
 *
 * `ListTables` answers with names and nothing else, and there is no batch
 * `DescribeTable` — so a table's row count, size and key schema are one API call
 * *per table*. Drawing that on every page load would be ten calls to draw a
 * strip of tabs, which is the same arithmetic that made the Logs tab ask for one
 * function at a time. So the list is the list, and everything else is read when
 * a table is opened.
 *
 * ## A query is not a read
 *
 * A `Query` needs a partition key, and the tab knows which attributes those are
 * because `DescribeTable` says so — so asking about a key is one round trip that
 * reads what it returns. Anything else is a `Scan`, which reads the table and
 * throws away what does not match. The two cost different amounts of money and
 * the difference is invisible in the shape of the answer, which is why every
 * read here reports which one it was and what it counted.
 *
 * ## Read-only, on purpose
 *
 * Nothing in this module writes. `DescribeTable`, `Query` and `Scan` are reads;
 * there is no `PutItem` anywhere in the console, and there is no text box that
 * turns into one. A control room that can edit the product's rows is a control
 * room where a typo is data loss with no undo — and the console's own rule about
 * AWS, every call is a `describe`, a `list` or a `get`, is what this tab is held
 * to as well.
 */

/**
 * The two fields a read here is made with.
 *
 * The same pair as `AwsContext`, spelled again because this is the *resolved*
 * form: a caller handing one of these over has decided which account and region
 * it is asking about. Every function below takes `Partial<AwsContext>` instead,
 * so a page that has resolved nothing can pass nothing and let the CLI's ambient
 * profile answer.
 */
export interface AwsReadContext {
  profile: string;
  region: string;
}

/** How many rows a page of the browser asks for. */
const PAGE_SIZE = 25;

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

/**
 * The stack that owns the tables.
 *
 * Spelled out rather than picked out of `rootStackNames`, because this is the
 * only one of the five this module reads. The name comes from `STACK_WORDS` in
 * the CDK app, so a rename there is a rename here — and a lookup that returned
 * `undefined` out of a list would be a tab that reports a fully deployed
 * environment as having no tables at all.
 */
function dataStackName(stage: string): string {
  return `AcharDataStack-${stage}`;
}

/**
 * The tables a data stack published: the logical id, and the name it holds.
 *
 * The output keys are `<TableId>Name` — `DocumentsTableName` — because the stack
 * emits one per table. Deliberately **not** matched against a list of the ten
 * ids kept here: a copy of that list is a copy that goes stale the day an
 * eleventh table is added, and the stack is already the authority on what it
 * holds. The suffix is the whole test, and the id is read back out of the key,
 * so the console learns the product's table names from the product.
 */
function tableEntries(outputs: Record<string, string>): Array<{ logical: string; name: string }> {
  return Object.entries(outputs)
    .filter(([key, value]) => key.endsWith("Name") && value !== "")
    .map(([key, name]) => ({ logical: key.slice(0, -"Name".length), name }))
    .sort((a, b) => a.logical.localeCompare(b.logical));
}

/**
 * Every table this stage reads, by physical name.
 *
 * Exported because the delete plan asks the same question, and it must get the
 * same answer: a table this tab lists and the plan does not account for is a
 * table left behind, and one the plan names and this tab never showed is worse.
 */
export async function stageTableNames(
  stage: string,
  ctx: Partial<AwsContext> = {},
): Promise<string[]> {
  const stack = await describeStack(dataStackName(stage), ctx);
  return tableEntries(stack?.outputs ?? {})
    .map((entry) => entry.name)
    .sort();
}

export async function backendTables(
  stage: string,
  ctx: Partial<AwsContext> = {},
): Promise<TableSummaryList> {
  const stack = await describeStack(dataStackName(stage), ctx);
  const entries = tableEntries(stack?.outputs ?? {});

  // Whether a deploy here may touch these tables is the config's answer, not the
  // stack's: a stage that creates its own names ten tables and owns them, and a
  // stage that imports names ten tables somebody else owns. The physical names
  // cannot tell the two apart — an imported table is called whatever the stage it
  // came from called it — so the one file that states ownership is read for it.
  // A stage with no config file owns everything by the same default the CDK app
  // applies, and has no stack to have listed anything in the first place.
  const imported = !ownershipOf(readConfig(stage)).tables;

  const tables: TableSummaryView[] = entries.map(({ logical, name }) => ({
    name,
    // The label is the logical id — `DocumentsTable` — because that is the word
    // the config, the CDK app and the handler's environment variable all use for
    // the same table, and the physical name is shown beside it because that is
    // the string somebody pastes into a CLI.
    key: logical,
    logical,
    imported,
  }));

  return {
    tables,
    note: tables.length
      ? null
      : `No tables for ${stage}. The names are published as outputs of ${dataStackName(stage)}, ` +
        `so either its data stack has not been deployed to this account and region, or it was ` +
        `deployed somewhere this CLI is not pointed at.`,
  };
}

/* ------------------------------------------------------------------ *
 * One table's shape
 * ------------------------------------------------------------------ */

interface RawKeySchema {
  AttributeName?: string;
  KeyType?: string;
}

interface RawTableDescription {
  TableName?: string;
  TableStatus?: string;
  ItemCount?: number;
  TableSizeBytes?: number;
  BillingModeSummary?: { BillingMode?: string };
  CreationDateTime?: string;
  KeySchema?: RawKeySchema[];
  AttributeDefinitions?: Array<{ AttributeName?: string; AttributeType?: string }>;
  GlobalSecondaryIndexes?: Array<{
    IndexName?: string;
    KeySchema?: RawKeySchema[];
    Projection?: { ProjectionType?: string };
  }>;
}

/**
 * A key a query can be answered from.
 *
 * The table's own partition key, and the partition key of each of its indexes.
 * A **query** needs one of these — a `KeyConditionExpression` has to name a
 * partition key — and anything else is a scan with a filter, which reads every
 * row to return a few. That is the whole reason this is discovered rather than
 * guessed: the difference between the two is not style, it is what the call
 * costs.
 */
export interface QueryTarget {
  /** Null for the table itself; an index name for one of its indexes. */
  indexName: string | null;
  /** What to show a person: `projectId`, or `typeKey via TypeIndex`. */
  label: string;
  hash: string;
  hashType: string;
  range: string | null;
  rangeType: string | null;
}

/**
 * What a table *is*, in the form a read is built from.
 *
 * The detail view is the same facts written for a person — labels, a row count,
 * a status — and this is the half a `Query` needs: which attributes are keys,
 * which of them is a hash, and which index each one belongs to.
 */
export interface TableShape {
  keys: TableKeyView[];
  indexes: TableIndexView[];
  targets: QueryTarget[];
}

/** The keys a read can start from, out of a table's own schema and its indexes. */
function targetsOf(keys: TableKeyView[], indexes: TableIndexView[]): QueryTarget[] {
  const hash = keys.find((key) => key.kind === "HASH") ?? null;
  const range = keys.find((key) => key.kind === "RANGE") ?? null;

  if (!hash) return [];

  return [
    {
      indexName: null,
      label: hash.name,
      hash: hash.name,
      hashType: hash.type,
      range: range?.name ?? null,
      rangeType: range?.type ?? null,
    },
    ...indexes.flatMap((index) => {
      const indexHash = index.keys.find((key) => key.kind === "HASH");
      const indexRange = index.keys.find((key) => key.kind === "RANGE");
      if (!indexHash) return [];
      return [
        {
          indexName: index.name,
          // The index is in the label rather than in a column of its own,
          // because the two attributes are what a person is choosing between:
          // `typeKey` alone does not say which read it makes cheap.
          label: `${indexHash.name} via ${index.name}`,
          hash: indexHash.name,
          hashType: indexHash.type,
          range: indexRange?.name ?? null,
          rangeType: indexRange?.type ?? null,
        },
      ];
    }),
  ];
}

/**
 * One table, as `DescribeTable` answers it.
 *
 * **Null rather than a throw when the table is not there.** A table can be
 * deleted — by hand, or by a stage somebody deleted this morning — between the
 * list this tab was drawn from and the click that opened it, and the honest
 * answer to that is a sentence on the page rather than a 500 from a route. The
 * shape here is a description of the account, and "it is not in the account any
 * more" is one of the answers a description can have.
 */
export async function describeTable(
  name: string,
  ctx: Partial<AwsContext> = {},
): Promise<TableDetailView | null> {
  const body = await awsJson<{ Table?: RawTableDescription }>(
    ["dynamodb", "describe-table", "--table-name", name],
    { ...ctx, optional: true },
  );

  const table = body?.Table;
  if (!table) return null;

  // The key schema names attributes and the attribute definitions give their
  // types, and a key schema that names something the definitions do not declare
  // is a table DynamoDB would not have accepted — so the lookup cannot miss, and
  // `S` is the fallback rather than a second guess.
  const types = new Map(
    (table.AttributeDefinitions ?? []).map((attribute) => [
      attribute.AttributeName ?? "",
      attribute.AttributeType ?? "S",
    ]),
  );
  const keysOf = (schema: RawKeySchema[] | undefined): TableKeyView[] =>
    (schema ?? [])
      .filter((key) => key.AttributeName)
      .map((key) => ({
        name: key.AttributeName as string,
        type: types.get(key.AttributeName as string) ?? "S",
        kind: key.KeyType === "RANGE" ? "RANGE" : "HASH",
      }));

  const keys = keysOf(table.KeySchema);
  const indexes: TableIndexView[] = (table.GlobalSecondaryIndexes ?? [])
    .filter((index) => index.IndexName)
    .map((index) => ({
      name: index.IndexName as string,
      keys: keysOf(index.KeySchema),
      projection: index.Projection?.ProjectionType ?? "ALL",
    }));

  return {
    name: table.TableName ?? name,
    status: table.TableStatus ?? "UNKNOWN",
    itemCount: table.ItemCount ?? 0,
    sizeBytes: table.TableSizeBytes ?? 0,
    billingMode: table.BillingModeSummary?.BillingMode ?? null,
    created: table.CreationDateTime ? Date.parse(table.CreationDateTime) : null,
    keys,
    indexes,
    // Labels, not the targets themselves: this half crosses a `fetch` to the
    // browser, which draws them as the buttons that fill the form in.
    targets: targetsOf(keys, indexes).map((target) => target.label),
  };
}

/** The same table, in the form `readTableItems` builds a read from. */
async function shapeOf(
  name: string,
  ctx: Partial<AwsContext>,
): Promise<TableShape | null> {
  const detail = await describeTable(name, ctx);
  if (!detail) return null;

  return {
    keys: detail.keys,
    indexes: detail.indexes,
    targets: targetsOf(detail.keys, detail.indexes),
  };
}

/**
 * The type to offer for an attribute, from whatever the table says it is.
 *
 * DynamoDB declares a type for its **key** attributes and for nothing else, so
 * this answers with confidence for the attributes a query can be aimed at and
 * with `S` for the rest. That is not a gap being papered over: an attribute that
 * is not a key genuinely has no declared type, and the form says `auto` so
 * somebody who knows better can overrule it.
 */
export function typeFor(shape: TableShape, attribute: string): string {
  for (const target of shape.targets) {
    if (target.hash === attribute) return target.hashType;
    if (target.range === attribute) return target.rangeType ?? "S";
  }
  const key = shape.keys.find((candidate) => candidate.name === attribute);
  return key?.type ?? "S";
}

/* ------------------------------------------------------------------ *
 * A page of the data
 * ------------------------------------------------------------------ */

export interface TableQuery {
  /** The physical table to read — the name from the list, not the label. */
  table: string;
  /** The attribute to look at. Absent means "whatever order the table is in". */
  attribute?: string;
  /** `=`, `begins_with`, `contains`, `>` or `<`. Defaults to `=`. */
  operator?: string;
  value?: string;
  /** How the value is typed in the expression: `S`, `N` or `BOOL`. */
  type?: string;
  /**
   * The index the attribute is a key of, when the form named one.
   *
   * A hint rather than an instruction: a `Query` is only possible when the
   * attribute is the hash key of whatever it reads, so `targetFor` checks it
   * against the schema and falls back to a scan when it does not hold.
   */
  index?: string;
  /**
   * DynamoDB's own cursor for the next page: `LastEvaluatedKey`, as the CLI
   * printed it. Opaque here, and handed straight back.
   */
  exclusiveStartKey?: string;
  limit?: number;
}

interface RawPage {
  Items?: Array<Record<string, unknown>>;
  Count?: number;
  ScannedCount?: number;
  LastEvaluatedKey?: Record<string, unknown>;
}

/** The operators a filter may use, and how each becomes an expression. */
const OPERATORS = ["=", "begins_with", "contains", ">", "<"] as const;

export async function readTableItems(
  query: TableQuery,
  ctx: Partial<AwsContext> = {},
): Promise<TableItemsView> {
  const limit = Math.min(Math.max(query.limit ?? PAGE_SIZE, 1), 100);
  const attribute = query.attribute?.trim() ?? "";
  const raw = query.value ?? "";
  const operator = (query.operator ?? "=").trim();

  // A value with no attribute is a filter nobody can read, and an attribute with
  // no value is one that matches nothing. Both are refused here rather than sent
  // to DynamoDB, whose own complaint about either is a syntax error rather than a
  // sentence about the form.
  if (raw !== "" && !attribute) {
    throw new Error("Name the attribute to match, or clear the value to read the table as it is.");
  }
  if (attribute && raw === "") {
    throw new Error(`"${attribute}" needs a value to match against.`);
  }
  if (attribute && !OPERATORS.includes(operator as (typeof OPERATORS)[number])) {
    throw new Error(`"${operator}" is not one of ${OPERATORS.join(", ")}.`);
  }

  // The schema is described here rather than handed in from the route, and
  // **only when a value is being compared**: an unfiltered page is a scan of a
  // named table, which needs no schema at all, and opening a table is the common
  // case. It is what decides both the type a value is compared as and whether
  // the read can be a query, and neither question is answerable from a name.
  const shape = attribute ? await shapeOf(query.table, ctx) : null;
  if (attribute && !shape) {
    throw new Error(`${query.table} is not in this account, so there is nothing to compare against.`);
  }

  const target = attribute && shape ? targetFor(shape, query.index, attribute) : null;
  const resolvedType = attribute && shape ? query.type?.trim() || typeFor(shape, attribute) : null;
  const typed = resolvedType === null ? null : typedValue(raw, resolvedType);

  // One expression-attribute name is enough: the form asks about one attribute,
  // and aliasing it as `#a` is also what keeps a reserved word from being a
  // syntax error — `status`, `size`, `name` and `type` are all DynamoDB's words
  // before they are a project's, and `typeKey` is one keystroke from one.
  const names = attribute ? { "#a": attribute } : undefined;
  const values = typed ? { ":v": typed } : undefined;

  const via: "query" | "scan" = target && operator === "=" ? "query" : "scan";
  const expression = !attribute ? null : via === "query" ? "#a = :v" : filterOf(operator);

  const argv =
    via === "query"
      ? [
          "dynamodb",
          "query",
          "--table-name",
          query.table,
          ...(target?.indexName ? ["--index-name", target.indexName] : []),
          "--key-condition-expression",
          expression as string,
          ...(names ? ["--expression-attribute-names", JSON.stringify(names)] : []),
          ...(values ? ["--expression-attribute-values", JSON.stringify(values)] : []),
        ]
      : [
          "dynamodb",
          "scan",
          "--table-name",
          query.table,
          ...(expression
            ? [
                "--filter-expression",
                expression,
                "--expression-attribute-names",
                JSON.stringify(names),
                "--expression-attribute-values",
                JSON.stringify(values),
              ]
            : []),
        ];

  // `--limit` with `--exclusive-start-key` rather than the CLI's own
  // `--starting-token`, and the difference is not cosmetic: `--starting-token`
  // makes the CLI its own paginator, so `--max-items 25` is however many
  // requests it takes to collect twenty-five and the tab can no longer say what
  // a page cost. DynamoDB's cursor is one request per page, and
  // `LastEvaluatedKey` is exactly where the next one starts.
  argv.push("--limit", String(limit));
  if (query.exclusiveStartKey) argv.push("--exclusive-start-key", query.exclusiveStartKey);

  const page = await awsJson<RawPage>(argv, ctx);
  const items = page?.Items ?? [];
  const matched = page?.Count ?? items.length;
  const scanned = page?.ScannedCount ?? matched;

  return {
    via,
    expression: attribute
      ? describeQuery(via, expression as string, attribute, operator, raw, resolvedType ?? "S")
      : null,
    valueType: resolvedType,
    indexName: via === "query" ? (target?.indexName ?? null) : null,
    // The rows are sent **exactly as DynamoDB answered** — `{ documentKey: { S: "…" } }`
    // — and rendered in the browser by `lib/dynamo`. One read, two renderings (a
    // table and JSON), and a mapping here would be a second answer to "what does
    // this row say" that only one of the two would be drawn from.
    rows: items,
    matched,
    scanned,
    token: page?.LastEvaluatedKey ? JSON.stringify(page.LastEvaluatedKey) : null,
    note: noteFor({
      via,
      attribute,
      value: raw,
      type: resolvedType,
      matched,
      scanned,
      items,
    }),
  };
}

/**
 * Where a read can start, for the attribute the form named.
 *
 * An explicit `index` wins when the form sent one, because the tab offers the
 * keys as buttons and knows which index each button came from. When it did not,
 * the attribute is looked up across the table and every index: somebody who
 * typed `typeKey` by hand has named a key just as surely as a click on the key
 * button did.
 *
 * Either way the attribute has to be a *hash* key — a `KeyConditionExpression`
 * cannot be answered from a sort key alone — so a range key, or an attribute
 * that is no key at all, comes back null and the read becomes a scan.
 */
function targetFor(shape: TableShape, index: string | undefined, attribute: string): QueryTarget | null {
  const named = index ? shape.targets.find((target) => target.indexName === index) : undefined;
  if (named && named.hash === attribute) return named;

  return shape.targets.find((target) => target.hash === attribute) ?? null;
}

/**
 * The value as DynamoDB's wire format wants it.
 *
 * Typed from the form rather than guessed from the text, and that is the one
 * place this tab refuses to be clever: `42` compared against a **number** and
 * `"42"` compared against a **string** are different reads, and a value that
 * guessed would return nothing with no way to tell why. The form defaults the
 * type from the key schema when the attribute is a key, so the common case needs
 * no decision — and shows what it picked.
 */
function typedValue(raw: string, type: string): Record<string, unknown> {
  const value = raw.trim();

  if (type === "N") {
    if (!/^-?\d+(\.\d+)?$/.test(value)) {
      throw new Error(
        `"${raw}" is not a number, and the attribute is one — DynamoDB stores them separately.`,
      );
    }
    return { N: value };
  }
  if (type === "BOOL") {
    if (value !== "true" && value !== "false") {
      throw new Error(`A boolean is "true" or "false", not "${raw}".`);
    }
    return { BOOL: value === "true" };
  }
  return { S: raw };
}

/** The operator as the expression syntax spells it. */
function filterOf(operator: string): string {
  if (operator === "begins_with") return "begins_with(#a, :v)";
  if (operator === "contains") return "contains(#a, :v)";
  return `#a ${operator} :v`;
}

/**
 * What the read was, in a sentence.
 *
 * The tab says which call it made, because the two are not the same read: a
 * `Query` on a key costs one round trip and a few rows, and a `Scan` with a
 * filter reads the whole table to return the ones that match. A console that hid
 * that would teach somebody to filter a big table on a non-key attribute without
 * noticing what it cost — so the sentence names the call, and the row underneath
 * counts what it read.
 *
 * **The type is always in it**, in words rather than as `S` or `N`. It is the
 * half of a comparison nobody can see in what they typed, and it is the answer
 * to the commonest empty result there is: a timestamp or a count somebody read
 * off a screen as a string, compared against the number or the ISO text the row
 * actually holds.
 */
function describeQuery(
  via: "query" | "scan",
  expression: string,
  attribute: string,
  operator: string,
  value: string,
  type: string,
): string {
  const spelled = expression.replace("#a", attribute).replace(":v", JSON.stringify(value));
  const read =
    via === "query"
      ? `Query on the key: ${spelled}`
      : `Scan with a filter (${operator}): ${spelled}`;
  return `${read} · ${typeWord(type)}`;
}

/** `S` → `string`. The wire type is not what a person is being asked about. */
function typeWord(type: string): string {
  switch (type) {
    case "S":
      return "string";
    case "N":
      return "number";
    case "BOOL":
      return "boolean";
    default:
      return type;
  }
}

function noteFor(input: {
  via: "query" | "scan";
  attribute: string;
  value: string;
  type: string | null;
  matched: number;
  scanned: number;
  items: Array<Record<string, unknown>>;
}): string | null {
  if (input.items.length === 0) {
    if (!input.attribute) {
      return "This table is empty.";
    }

    // The one empty result worth explaining rather than merely reporting. A
    // value of digits compared as a string is the mistake this form makes easy —
    // `42` and `"42"` read identically and are different attributes as far as
    // DynamoDB is concerned — and saying so saves the next ten minutes.
    const looksNumeric = input.type === "S" && /^-?\d+(\.\d+)?$/.test(input.value.trim());
    const typed = looksNumeric
      ? ` "${input.value}" looks like a number: if the attribute is stored as one, set As to number — DynamoDB keeps a number and the string that reads the same apart.`
      : "";

    if (input.via === "query") {
      // Worth naming here because it is the shape of this product's own keys: a
      // document's key is `{projectId}#{dataset}#{id}`, so an `=` on a prefix
      // that somebody expected to match a dataset matches nothing at all.
      return `Nothing matched that key.${typed} A composed key is matched whole: an "=" on part of it returns nothing, and "begins with" is the read for a prefix.`;
    }
    return `Nothing matched. The scan looked at ${plural(input.scanned, "row")} before stopping — a filter is applied after the read, so a page of matches is not the same as a page of rows.${typed}`;
  }
  if (input.via === "scan" && input.scanned > input.matched) {
    return `${input.scanned} rows read to return ${input.matched} — a filter is applied after the read.`;
  }
  return null;
}
