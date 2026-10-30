import { pool } from "./db";

// One-off schema/data changes for databases that already exist. Deploys don't run
// db:push, so each migration runs once at startup and is recorded in app_migrations.
// Keep shared/schema.ts in step, so a later db:push finds nothing to change.
const MIGRATIONS: Array<{ id: string; sql: string }> = [
  {
    // Renny: check UTM tags for every client. Before this, no screen could turn it on.
    id: "2026-10-30-utm-check-on",
    sql: `ALTER TABLE clients ALTER COLUMN required_utm SET DEFAULT true;
          UPDATE clients SET required_utm = true;`,
  },
];

export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "app_migrations" (
      "id" varchar PRIMARY KEY NOT NULL,
      "applied_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  for (const migration of MIGRATIONS) {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      // Inserting first claims the migration, so two instances starting together can't both run it.
      const claimed = await db.query(
        `INSERT INTO app_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [migration.id],
      );
      if (claimed.rowCount) await db.query(migration.sql);
      await db.query("COMMIT");
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    } finally {
      db.release();
    }
  }
}
