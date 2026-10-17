import type { SqlRunner, SqlRow } from "./store";

// Runs SyncStore on Node's built-in SQLite in tests, standing in for a Durable Object's storage.

type Statement = { iterate(...bindings: unknown[]): Iterable<SqlRow>; run(...bindings: unknown[]): unknown; columns(): unknown[] };
type Database = { prepare(sql: string): Statement; exec(sql: string): void };

const sqliteModule = "node:sqlite";

export async function memorySql(): Promise<SqlRunner> {
  const { DatabaseSync } = (await import(/* @vite-ignore */ sqliteModule)) as { DatabaseSync: new (path: string) => Database };
  const db = new DatabaseSync(":memory:");
  return {
    query(sql, ...bindings) {
      const statement = db.prepare(sql);
      if (statement.columns().length === 0) {
        statement.run(...bindings);
        return [];
      }
      return statement.iterate(...bindings);
    },
    transaction(fn) {
      db.exec("BEGIN");
      try {
        const result = fn();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  };
}
