import type Database from "better-sqlite3";
import { DAY_MS, SLOT_MS } from "./time.js";

type Migration = {
  id: string;
  up: (db: Database.Database) => void;
};

const migrations: Migration[] = [
  {
    id: "2026-08-25_incidents_source",
    up: (db) => {
      const columns = db.prepare("PRAGMA table_info(incidents)").all() as { name: string }[];
      if (!columns.some((col) => col.name === "source")) {
        db.exec("ALTER TABLE incidents ADD COLUMN source TEXT NOT NULL DEFAULT 'auto'");
      }
    },
  },
  {
    id: "2026-10-07_uptime_slots",
    up: (db) => {
      const slotSeconds = SLOT_MS / 1000;
      const perDay = DAY_MS / SLOT_MS;
      const daily = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'daily_stats'").get();
      if (!daily) {
        db.exec(`
          INSERT OR IGNORE INTO uptime_slots (monitor_id, slot, total, ok)
          SELECT monitor_id, CAST(strftime('%s', checked_at) AS INTEGER) / ${slotSeconds}, COUNT(*), SUM(ok)
          FROM checks
          GROUP BY 1, 2
        `);
        return;
      }
      // Daily totals were kept per UTC day, so spread each day evenly over its slots.
      db.exec(`
        WITH RECURSIVE q(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM q WHERE i < ${perDay - 1})
        INSERT OR IGNORE INTO uptime_slots (monitor_id, slot, total, ok)
        SELECT monitor_id,
               CAST(strftime('%s', day) AS INTEGER) / ${slotSeconds} + i,
               total / ${perDay} + (i < total % ${perDay}),
               ok / ${perDay} + (i < ok % ${perDay})
        FROM daily_stats, q
        WHERE total / ${perDay} + (i < total % ${perDay}) > 0;
        DROP TABLE daily_stats;
      `);
    },
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
  );
  const applied = new Set(
    (db.prepare("SELECT id FROM _migrations").all() as { id: string }[]).map((row) => row.id)
  );
  const markApplied = db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)");

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    db.transaction(() => {
      migration.up(db);
      markApplied.run(migration.id, new Date().toISOString());
    })();
  }
}
