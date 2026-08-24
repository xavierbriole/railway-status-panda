import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type MonitorType = "http" | "keyword" | "tcp" | "dns" | "ssl";

export type Monitor = {
  id: number;
  name: string;
  url: string;
  type: MonitorType;
  keyword: string;
  interval_sec: number;
  timeout_ms: number;
  expected_status: number;
  enabled: number;
  created_at: string;
};

export type CheckRow = {
  id: number;
  monitor_id: number;
  ok: number;
  status_code: number | null;
  latency_ms: number | null;
  error: string | null;
  checked_at: string;
};

export type IncidentSource = "auto" | "manual";

export type Incident = {
  id: number;
  monitor_id: number;
  started_at: string;
  ended_at: string | null;
  title: string;
  body: string;
  source: IncidentSource;
};

const MAX_CHECKS_PER_MONITOR = 2000;

function resolveDataDir(): string {
  const preferred = process.env.DATA_DIR || "/data";
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    const fallback = path.join(process.cwd(), "data");
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

export const dataDir = resolveDataDir();

export const db = new Database(path.join(dataDir, "statuspanda.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS monitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'http',
    keyword TEXT NOT NULL DEFAULT '',
    interval_sec INTEGER NOT NULL DEFAULT 60,
    timeout_ms INTEGER NOT NULL DEFAULT 10000,
    expected_status INTEGER NOT NULL DEFAULT 200,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id INTEGER NOT NULL,
    ok INTEGER NOT NULL,
    status_code INTEGER,
    latency_ms INTEGER,
    error TEXT,
    checked_at TEXT NOT NULL,
    FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'auto',
    FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_checks_monitor_time ON checks(monitor_id, checked_at);
  CREATE INDEX IF NOT EXISTS idx_incidents_open ON incidents(monitor_id, ended_at);
`);

function nowIso(): string {
  return new Date().toISOString();
}

export function getSetting(key: string, fallback = ""): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export function listMonitors(): Monitor[] {
  return db.prepare("SELECT * FROM monitors ORDER BY id ASC").all() as Monitor[];
}

export function getMonitor(id: number): Monitor | undefined {
  return db.prepare("SELECT * FROM monitors WHERE id = ?").get(id) as Monitor | undefined;
}

export function createMonitor(input: {
  name: string;
  url: string;
  type: MonitorType;
  keyword?: string;
  interval_sec?: number;
  timeout_ms?: number;
  expected_status?: number;
}): Monitor {
  const created_at = nowIso();
  const info = db
    .prepare(
      `INSERT INTO monitors (name, url, type, keyword, interval_sec, timeout_ms, expected_status, enabled, created_at)
       VALUES (@name, @url, @type, @keyword, @interval_sec, @timeout_ms, @expected_status, 1, @created_at)`
    )
    .run({
      name: input.name.trim(),
      url: input.url.trim(),
      type: input.type,
      keyword: input.keyword?.trim() ?? "",
      interval_sec: clamp(input.interval_sec ?? 60, 30, 3600),
      timeout_ms: clamp(input.timeout_ms ?? 10000, 2000, 30000),
      expected_status: input.expected_status ?? 200,
      created_at,
    });
  return getMonitor(Number(info.lastInsertRowid))!;
}

export function updateMonitor(
  id: number,
  input: {
    name: string;
    url: string;
    type: MonitorType;
    keyword?: string;
    interval_sec?: number;
    timeout_ms?: number;
    expected_status?: number;
    enabled?: number;
  }
): void {
  db.prepare(
    `UPDATE monitors SET
      name = @name,
      url = @url,
      type = @type,
      keyword = @keyword,
      interval_sec = @interval_sec,
      timeout_ms = @timeout_ms,
      expected_status = @expected_status,
      enabled = @enabled
     WHERE id = @id`
  ).run({
    id,
    name: input.name.trim(),
    url: input.url.trim(),
    type: input.type,
    keyword: input.keyword?.trim() ?? "",
    interval_sec: clamp(input.interval_sec ?? 60, 30, 3600),
    timeout_ms: clamp(input.timeout_ms ?? 10000, 2000, 30000),
    expected_status: input.expected_status ?? 200,
    enabled: input.enabled ?? 1,
  });
}

export function deleteMonitor(id: number): void {
  db.prepare("DELETE FROM monitors WHERE id = ?").run(id);
}

export function insertCheck(row: {
  monitor_id: number;
  ok: boolean;
  status_code: number | null;
  latency_ms: number | null;
  error: string | null;
}): CheckRow {
  const checked_at = nowIso();
  const info = db
    .prepare(
      `INSERT INTO checks (monitor_id, ok, status_code, latency_ms, error, checked_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(row.monitor_id, row.ok ? 1 : 0, row.status_code, row.latency_ms, row.error, checked_at);

  db.prepare(
    `DELETE FROM checks WHERE monitor_id = ? AND id NOT IN (
      SELECT id FROM checks WHERE monitor_id = ? ORDER BY id DESC LIMIT ?
    )`
  ).run(row.monitor_id, row.monitor_id, MAX_CHECKS_PER_MONITOR);

  return {
    id: Number(info.lastInsertRowid),
    monitor_id: row.monitor_id,
    ok: row.ok ? 1 : 0,
    status_code: row.status_code,
    latency_ms: row.latency_ms,
    error: row.error,
    checked_at,
  };
}

export function latestCheck(monitorId: number): CheckRow | undefined {
  return db
    .prepare("SELECT * FROM checks WHERE monitor_id = ? ORDER BY id DESC LIMIT 1")
    .get(monitorId) as CheckRow | undefined;
}

export function recentChecks(monitorId: number, limit = 40): CheckRow[] {
  const rows = db
    .prepare("SELECT * FROM checks WHERE monitor_id = ? ORDER BY id DESC LIMIT ?")
    .all(monitorId, limit) as CheckRow[];
  return rows.reverse();
}

export function consecutiveFailures(monitorId: number): number {
  const rows = db
    .prepare("SELECT ok FROM checks WHERE monitor_id = ? ORDER BY id DESC LIMIT 8")
    .all(monitorId) as { ok: number }[];
  let n = 0;
  for (const row of rows) {
    if (row.ok) break;
    n += 1;
  }
  return n;
}

export function uptimeRatio(monitorId: number): number | null {
  const row = db
    .prepare("SELECT COUNT(*) AS total, SUM(ok) AS ok FROM checks WHERE monitor_id = ?")
    .get(monitorId) as { total: number; ok: number | null };
  if (!row.total) return null;
  return (row.ok ?? 0) / row.total;
}

export function openIncident(monitorId: number): Incident | undefined {
  return db
    .prepare("SELECT * FROM incidents WHERE monitor_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1")
    .get(monitorId) as Incident | undefined;
}

export function getIncident(id: number): Incident | undefined {
  return db.prepare("SELECT * FROM incidents WHERE id = ?").get(id) as Incident | undefined;
}

export function updateIncident(id: number, input: { monitor_id: number; title: string; body: string }): void {
  db.prepare("UPDATE incidents SET monitor_id = ?, title = ?, body = ? WHERE id = ?").run(
    input.monitor_id,
    input.title,
    input.body,
    id
  );
}

export function deleteIncident(id: number): void {
  db.prepare("DELETE FROM incidents WHERE id = ?").run(id);
}

export function startIncident(monitorId: number, title: string, body: string, source: IncidentSource = "auto"): Incident {
  const existing = openIncident(monitorId);
  if (existing) return existing;
  const started_at = nowIso();
  const info = db
    .prepare(
      "INSERT INTO incidents (monitor_id, started_at, title, body, source) VALUES (?, ?, ?, ?, ?)"
    )
    .run(monitorId, started_at, title, body, source);
  return db.prepare("SELECT * FROM incidents WHERE id = ?").get(Number(info.lastInsertRowid)) as Incident;
}

export function resolveIncident(monitorId: number, opts?: { autoOnly?: boolean }): Incident | undefined {
  const open = openIncident(monitorId);
  if (!open) return undefined;
  if (opts?.autoOnly && open.source !== "auto") return undefined;
  const ended_at = nowIso();
  db.prepare("UPDATE incidents SET ended_at = ? WHERE id = ?").run(ended_at, open.id);
  return { ...open, ended_at };
}

export function listIncidents(limit = 20): Array<Incident & { monitor_name: string }> {
  return db
    .prepare(
      `SELECT incidents.*, monitors.name AS monitor_name
       FROM incidents
       JOIN monitors ON monitors.id = incidents.monitor_id
       ORDER BY incidents.started_at DESC
       LIMIT ?`
    )
    .all(limit) as Array<Incident & { monitor_name: string }>;
}

export function lastCheckedAt(): string | null {
  const row = db.prepare("SELECT checked_at FROM checks ORDER BY id DESC LIMIT 1").get() as
    | { checked_at: string }
    | undefined;
  return row?.checked_at ?? null;
}

export function seedExampleMonitor(): void {
  const examples = [
    { name: "Website", url: "https://railway.com" },
    { name: "API health", url: "https://www.githubstatus.com" },
    { name: "Docs", url: "https://docs.railway.com" },
  ];

  for (const example of examples) {
    const existing = db.prepare("SELECT id FROM monitors WHERE url = ?").get(example.url);
    if (existing) continue;
    createMonitor({
      name: example.name,
      url: example.url,
      type: "http",
      interval_sec: 60,
      expected_status: 200,
    });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
