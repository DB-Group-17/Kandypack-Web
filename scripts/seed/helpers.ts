/**
 * @file scripts/seed/helpers.ts
 * @description Shared building blocks for the Kandypack seed stages.
 *
 * - `sql()` / `SqlExpression`: lets a seed row carry a server-side SQL expression
 *   (e.g. a date computed from `CURDATE()`) instead of a literal value.
 * - `insertMissing()`: the idempotent insert used by every baseline table.
 *
 * Why "insert only missing IDs" (Docs/06_seed-data-spec.md, Ground Rules):
 * - `DELETE` is blocked by the `trg_prevent_hard_delete_*` triggers and `TRUNCATE` by foreign keys.
 * - `INSERT IGNORE` downgrades CHECK/FK violations to warnings, silently skipping bad rows.
 * - `ON DUPLICATE KEY UPDATE` fires the UPDATE audit triggers on every re-run.
 *
 * Owner: Member 1 (Dineth)
 */

import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { QueryParam } from '../../lib/db';

/**
 * A fragment of SQL evaluated by the MySQL server at insert time, with its own
 * `?` placeholders and bound parameters. Used so relative dates run on the database
 * clock (the same clock `place_order` uses) rather than the local machine's clock.
 */
export class SqlExpression {
  /**
   * @param text   - SQL fragment, e.g. `DATE_ADD(CURDATE(), INTERVAL ? MONTH)`
   * @param params - Values bound to the `?` placeholders inside `text`, in order
   */
  constructor(
    public readonly text: string,
    public readonly params: QueryParam[] = []
  ) {}
}

/**
 * Creates a server-evaluated SQL expression for a seed column value.
 *
 * @param text   - SQL fragment containing zero or more `?` placeholders
 * @param params - Values for those placeholders
 * @returns A `SqlExpression` that `insertMissing` inlines instead of binding as a literal
 *
 * @example
 * { license_expiry: sql('DATE_ADD(CURDATE(), INTERVAL ? MONTH)', 18) }
 */
export function sql(text: string, ...params: QueryParam[]): SqlExpression {
  return new SqlExpression(text, params);
}

/** A column value in a seed row: a literal bound as a parameter, or a server-side expression. */
export type SeedValue = QueryParam | SqlExpression;

/** One row to insert, keyed by column name. Must include the table's primary-key column. */
export type SeedRow = Record<string, SeedValue>;

/**
 * Inserts only the seed rows whose primary key is not already present in the table.
 * Existing rows are never read for comparison or modified, so re-runs write nothing
 * (and therefore produce no audit noise), while genuine constraint errors still throw.
 *
 * Assumptions:
 * - `table` and `idCol` are trusted constants from seed code. Identifiers cannot be bound
 *   as `?` placeholders, so they are interpolated; never pass user input here.
 * - `conn` already has `@current_user_id` set and an open transaction (see master-data.ts),
 *   so audit triggers attribute the rows and a failure rolls everything back.
 * - Rows are inserted in array order, so parents must precede children within one table.
 *
 * @param conn  - Transactional connection with user context applied
 * @param table - Target table name
 * @param idCol - Primary-key column name (numeric or CHAR(36))
 * @param rows  - Seed rows with explicit primary-key values
 * @returns Number of rows actually inserted
 */
export async function insertMissing(
  conn: PoolConnection,
  table: string,
  idCol: string,
  rows: SeedRow[]
): Promise<number> {
  const [existing] = await conn.query<RowDataPacket[]>(`SELECT ${idCol} AS id FROM ${table}`);
  // Normalise to strings so BIGINT (returned as number) and CHAR(36) keys compare uniformly
  const existingIds = new Set(existing.map((row) => String(row.id)));

  let inserted = 0;
  for (const row of rows) {
    if (existingIds.has(String(row[idCol]))) continue; // already seeded — leave untouched

    const columns = Object.keys(row);
    const placeholders: string[] = [];
    const params: QueryParam[] = [];

    for (const column of columns) {
      const value = row[column];
      if (value instanceof SqlExpression) {
        // Inline the expression and append its own bound parameters in position
        placeholders.push(value.text);
        params.push(...value.params);
      } else {
        placeholders.push('?');
        params.push(value);
      }
    }

    // `query` (client-side escaping) rather than `execute` (prepared statement): the SQL text
    // differs per row, so preparing each statement would only add round trips.
    await conn.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
      params
    );
    inserted++;
  }

  logStage(table, inserted, rows.length - inserted);
  return inserted;
}

/**
 * Prints a uniform one-line progress summary for a seeded table.
 *
 * @param label    - Table or stage name
 * @param inserted - Rows written in this run
 * @param skipped  - Rows skipped because they already existed
 */
export function logStage(label: string, inserted: number, skipped: number): void {
  console.log(`   ${label.padEnd(22)} ${String(inserted).padStart(3)} inserted, ${skipped} already present`);
}
