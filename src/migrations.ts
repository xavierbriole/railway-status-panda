import type Database from "better-sqlite3";

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
