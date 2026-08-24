import express from "express";
import {
  createMonitor,
  deleteIncident,
  deleteMonitor,
  getIncident,
  getMonitor,
  lastCheckedAt,
  latestCheck,
  listMonitors,
  resolveIncident,
  seedExampleMonitor,
  setSetting,
  startIncident,
  updateIncident,
  updateMonitor,
  type MonitorType,
} from "./db.js";
import { adminPassword, checkCredentials, clearSession, isAuthed, loginAllowed, recordLogin, requireAuth, setSession } from "./auth.js";
import { startChecker } from "./checker.js";
import { bus } from "./notify.js";
import { adminPage, loginPage, overallStatus, settingsPage, statusPage } from "./pages.js";
import {
  isDnsHostname,
  isHttpUrl,
  normalizeTarget,
  parseMonitorType,
  parseTcpTarget,
} from "./targets.js";

adminPassword();
seedExampleMonitor();
startChecker();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public", { maxAge: "7d" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "statuspanda" });
});

app.get("/api/status", (_req, res) => {
  const overall = overallStatus();
  res.json({
    overall,
    updated_at: lastCheckedAt(),
    monitors: listMonitors().map((monitor) => {
      const last = latestCheck(monitor.id);
      return {
        id: monitor.id,
        name: monitor.name,
        url: monitor.url,
        enabled: Boolean(monitor.enabled),
        ok: last ? Boolean(last.ok) : null,
        latency_ms: last?.latency_ms ?? null,
        checked_at: last?.checked_at ?? null,
      };
    }),
  });
});

app.get("/badge.svg", (_req, res) => {
  const overall = overallStatus();
  const label = overall === "calm" ? "operational" : overall === "down" ? "down" : "checking";
  const color = overall === "calm" ? "#34a853" : overall === "down" ? "#ea4335" : "#fbbc04";
  res.type("image/svg+xml").send(`<svg xmlns="http://www.w3.org/2000/svg" width="148" height="20">
    <rect width="148" height="20" rx="4" fill="#111"/>
    <rect x="78" width="70" height="20" rx="4" fill="${color}"/>
    <text x="8" y="14" fill="#f4efe6" font-size="11" font-family="Verdana">statuspanda</text>
    <text x="90" y="14" fill="#111" font-size="11" font-family="Verdana">${label}</text>
  </svg>`);
});

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const ping = () => res.write("event: ping\ndata: 1\n\n");
  const send = () => res.write("data: update\n\n");
  const timer = setInterval(ping, 25000);
  bus.on("update", send);
  req.on("close", () => {
    clearInterval(timer);
    bus.off("update", send);
  });
});

app.get("/", (req, res) => {
  res.type("html").send(statusPage({ isAdmin: isAuthed(req) }));
});

app.get("/login", (req, res) => {
  if (isAuthed(req)) {
    res.redirect("/admin");
    return;
  }
  res.type("html").send(loginPage());
});

app.post("/login", (req, res) => {
  const ip = req.ip || "local";
  if (!loginAllowed(ip)) {
    res.status(429).type("html").send(loginPage("Too many tries. Wait a few minutes."));
    return;
  }
  const user = String(req.body?.user || "");
  const password = String(req.body?.password || "");
  const ok = checkCredentials(user, password);
  recordLogin(ip, ok);
  if (!ok) {
    res.status(401).type("html").send(loginPage("That did not match. Check ADMIN_PASSWORD in Railway."));
    return;
  }
  setSession(res);
  res.redirect("/admin");
});

app.post("/logout", (req, res) => {
  clearSession(res);
  res.redirect("/login");
});

app.get("/admin", requireAuth, (req, res) => {
  const edit = Number(req.query.edit || 0) || undefined;
  const editIncident = Number(req.query.editIncident || 0) || undefined;
  const toast = toastFrom(req.query.toast);
  res.type("html").send(adminPage({ editId: edit, editIncidentId: editIncident, toast }));
});

app.get("/admin/settings", requireAuth, (req, res) => {
  res.type("html").send(settingsPage(toastFrom(req.query.toast)));
});

app.post("/admin/settings", requireAuth, (req, res) => {
  setSetting("page_title", String(req.body?.page_title || "StatusPanda").slice(0, 80));
  setSetting("page_subtitle", String(req.body?.page_subtitle || "").slice(0, 200));
  setSetting("logo_url", String(req.body?.logo_url || "").trim().slice(0, 500));
  setSetting("hide_admin_button", req.body?.hide_admin_button ? "1" : "0");
  setSetting("discord_webhook", String(req.body?.discord_webhook || "").trim());
  setSetting("slack_webhook", String(req.body?.slack_webhook || "").trim());
  setSetting("generic_webhook", String(req.body?.generic_webhook || "").trim());
  res.redirect("/admin/settings?toast=saved");
});

app.post("/admin/monitors", requireAuth, (req, res) => {
  const parsed = parseMonitor(req.body);
  if (!parsed) {
    res.redirect("/admin?toast=url");
    return;
  }
  createMonitor(parsed);
  res.redirect("/admin?toast=added");
});

app.post("/admin/monitors/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!getMonitor(id)) {
    res.redirect("/admin");
    return;
  }
  const parsed = parseMonitor(req.body);
  if (!parsed) {
    res.redirect(`/admin?edit=${id}&toast=url`);
    return;
  }
  updateMonitor(id, { ...parsed, enabled: Number(req.body?.enabled ?? 1) });
  res.redirect("/admin?toast=saved");
});

app.post("/admin/monitors/:id/delete", requireAuth, (req, res) => {
  deleteMonitor(Number(req.params.id));
  res.redirect("/admin?toast=removed");
});

app.post("/admin/incidents", requireAuth, (req, res) => {
  const monitorId = Number(req.body?.monitor_id);
  const title = String(req.body?.title || "").trim();
  const body = String(req.body?.body || "").trim();
  if (!getMonitor(monitorId) || !title) {
    res.redirect("/admin?toast=incident_invalid");
    return;
  }
  startIncident(monitorId, title, body, "manual");
  res.redirect("/admin?toast=incident_added");
});

app.post("/admin/incidents/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!getIncident(id)) {
    res.redirect("/admin");
    return;
  }
  const monitorId = Number(req.body?.monitor_id);
  const title = String(req.body?.title || "").trim();
  const body = String(req.body?.body || "").trim();
  if (!getMonitor(monitorId) || !title) {
    res.redirect(`/admin?editIncident=${id}&toast=incident_invalid`);
    return;
  }
  updateIncident(id, { monitor_id: monitorId, title, body });
  res.redirect("/admin?toast=incident_saved");
});

app.post("/admin/incidents/:id/delete", requireAuth, (req, res) => {
  deleteIncident(Number(req.params.id));
  res.redirect("/admin?toast=incident_removed");
});

app.post("/admin/incidents/:monitorId/resolve", requireAuth, (req, res) => {
  resolveIncident(Number(req.params.monitorId));
  res.redirect("/admin?toast=incident_resolved");
});

app.post("/admin/monitors/:id/pause", requireAuth, (req, res) => {
  const monitor = getMonitor(Number(req.params.id));
  if (monitor) {
    updateMonitor(monitor.id, {
      name: monitor.name,
      url: monitor.url,
      type: monitor.type,
      keyword: monitor.keyword,
      interval_sec: monitor.interval_sec,
      timeout_ms: monitor.timeout_ms,
      expected_status: monitor.expected_status,
      enabled: monitor.enabled ? 0 : 1,
    });
  }
  res.redirect("/admin?toast=updated");
});

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => {
  console.log(`StatusPanda listening on ${port}`);
});

function parseMonitor(body: unknown): {
  name: string;
  url: string;
  type: MonitorType;
  keyword?: string;
  interval_sec?: number;
  timeout_ms?: number;
  expected_status?: number;
} | null {
  const data = (body ?? {}) as Record<string, string>;
  const name = String(data.name || "").trim();
  const type = parseMonitorType(data.type);
  const url = normalizeTarget(type, String(data.url || ""));
  if (!name || !url) return null;

  if (type === "tcp" && !parseTcpTarget(url)) return null;
  if (type === "dns" && !isDnsHostname(url)) return null;
  if (type === "ssl" && !isHttpUrl(url, true)) return null;
  if ((type === "http" || type === "keyword") && !isHttpUrl(url)) return null;
  if (type === "keyword" && !String(data.keyword || "").trim()) return null;

  return {
    name,
    url,
    type,
    keyword: String(data.keyword || ""),
    interval_sec: Number(data.interval_sec || 60),
    timeout_ms: Number(data.timeout_ms || 10000),
    expected_status: Number(data.expected_status || 200),
  };
}

function toastFrom(value: unknown): string | undefined {
  const key = String(value || "");
  const map: Record<string, string> = {
    added: "Monitor is live. First check is on the way.",
    saved: "Saved.",
    removed: "Monitor removed.",
    updated: "Monitor updated.",
    url: "That target did not look right.",
    incident_added: "Incident reported.",
    incident_resolved: "Incident resolved.",
    incident_invalid: "Pick a monitor and add a title.",
    incident_saved: "Incident updated.",
    incident_removed: "Incident removed.",
  };
  return map[key];
}
