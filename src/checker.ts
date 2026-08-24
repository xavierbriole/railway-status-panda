import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";
import {
  consecutiveFailures,
  insertCheck,
  listMonitors,
  openIncident,
  resolveIncident,
  startIncident,
  type Monitor,
} from "./db.js";
import { bus, notify } from "./notify.js";
import { isHttpUrl, normalizeTarget, parseTcpTarget, SSL_WARN_DAYS } from "./targets.js";

const due = new Map<number, number>();
const inflight = new Set<number>();

export function startChecker(): void {
  tick();
  setInterval(tick, 5000);
}

async function tick(): Promise<void> {
  const now = Date.now();
  for (const monitor of listMonitors()) {
    if (!monitor.enabled) continue;
    if (inflight.has(monitor.id)) continue;
    const next = due.get(monitor.id) ?? 0;
    if (now < next) continue;
    due.set(monitor.id, now + monitor.interval_sec * 1000);
    inflight.add(monitor.id);
    void runCheck(monitor).finally(() => inflight.delete(monitor.id));
  }
}

async function runCheck(monitor: Monitor): Promise<void> {
  const started = Date.now();
  try {
    const result = await probe(monitor);
    const latency = Date.now() - started;
    insertCheck({
      monitor_id: monitor.id,
      ok: result.ok,
      status_code: result.status,
      latency_ms: latency,
      error: result.error,
    });
    await afterCheck(monitor, result.ok, result.error || statusLabel(monitor, result.status, latency, result.detail));
  } catch (err) {
    const latency = Date.now() - started;
    const error = err instanceof Error ? err.message : "Check failed";
    insertCheck({
      monitor_id: monitor.id,
      ok: false,
      status_code: null,
      latency_ms: latency,
      error,
    });
    await afterCheck(monitor, false, error);
  }
}

async function afterCheck(monitor: Monitor, ok: boolean, detail: string): Promise<void> {
  if (ok) {
    const closed = resolveIncident(monitor.id, { autoOnly: true });
    if (closed) await notify("recovered", monitor.name, detail);
  } else if (consecutiveFailures(monitor.id) >= 2) {
    const alreadyOpen = Boolean(openIncident(monitor.id));
    startIncident(monitor.id, `${monitor.name} is down`, detail);
    if (!alreadyOpen) await notify("down", monitor.name, detail);
  }
  bus.emit("update");
}

async function probe(
  monitor: Monitor
): Promise<{ ok: boolean; status: number | null; error: string | null; detail?: string }> {
  if (monitor.type === "tcp") return probeTcp(monitor);
  if (monitor.type === "dns") return probeDns(monitor);
  if (monitor.type === "ssl") return probeSsl(monitor);
  return probeHttp(monitor);
}

async function probeHttp(
  monitor: Monitor
): Promise<{ ok: boolean; status: number | null; error: string | null; detail?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), monitor.timeout_ms);
  try {
    const response = await fetch(normalizeTarget(monitor.type, monitor.url), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "StatusPanda/1.0 (+https://railway.com)",
        accept: "*/*",
      },
    });
    const status = response.status;
    if (status !== monitor.expected_status && !(monitor.expected_status === 200 && status >= 200 && status < 400)) {
      return { ok: false, status, error: `HTTP ${status}` };
    }
    if (monitor.type === "keyword") {
      const body = await response.text();
      if (!monitor.keyword || !body.includes(monitor.keyword)) {
        return { ok: false, status, error: "Keyword missing" };
      }
    }
    return { ok: true, status, error: null };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError" ? "Timed out" : err instanceof Error ? err.message : "Failed";
    return { ok: false, status: null, error: message };
  } finally {
    clearTimeout(timer);
  }
}

async function probeTcp(
  monitor: Monitor
): Promise<{ ok: boolean; status: number | null; error: string | null; detail?: string }> {
  const target = parseTcpTarget(monitor.url);
  if (!target) return { ok: false, status: null, error: "Invalid host:port" };

  return new Promise((resolve) => {
    const socket = net.connect({ host: target.host, port: target.port });
    let settled = false;

    const finish = (result: { ok: boolean; status: number | null; error: string | null; detail?: string }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => finish({ ok: false, status: null, error: "Timed out" }), monitor.timeout_ms);

    socket.once("connect", () => {
      clearTimeout(timer);
      finish({ ok: true, status: null, error: null, detail: `${target.host}:${target.port} open` });
    });

    socket.once("error", (err) => {
      clearTimeout(timer);
      finish({ ok: false, status: null, error: err.message || "Connection failed" });
    });
  });
}

async function probeDns(
  monitor: Monitor
): Promise<{ ok: boolean; status: number | null; error: string | null; detail?: string }> {
  const host = normalizeTarget("dns", monitor.url);
  if (!host) return { ok: false, status: null, error: "Invalid hostname" };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      dns.lookup(host, { all: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timed out")), monitor.timeout_ms);
      }),
    ]);
    if (!result.length) return { ok: false, status: null, error: "No records" };
    return {
      ok: true,
      status: null,
      error: null,
      detail: `${result.length} record${result.length === 1 ? "" : "s"}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed";
    return { ok: false, status: null, error: message };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probeSsl(
  monitor: Monitor
): Promise<{ ok: boolean; status: number | null; error: string | null; detail?: string }> {
  const raw = normalizeTarget("ssl", monitor.url);
  if (!isHttpUrl(raw, true)) return { ok: false, status: null, error: "HTTPS URL required" };

  let hostname = "";
  let port = 443;
  try {
    const url = new URL(raw);
    hostname = url.hostname;
    port = url.port ? Number(url.port) : 443;
  } catch {
    return { ok: false, status: null, error: "Invalid URL" };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { ok: boolean; status: number | null; error: string | null; detail?: string }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const socket = tls.connect({
      host: hostname,
      port,
      servername: hostname,
      rejectUnauthorized: true,
    });

    const timer = setTimeout(() => {
      socket.destroy();
      finish({ ok: false, status: null, error: "Timed out" });
    }, monitor.timeout_ms);

    socket.once("secureConnect", () => {
      clearTimeout(timer);
      const cert = socket.getPeerCertificate();
      socket.end();

      if (!cert || !cert.valid_to) {
        finish({ ok: false, status: null, error: "No certificate" });
        return;
      }

      const expiresAt = new Date(cert.valid_to).getTime();
      if (Number.isNaN(expiresAt)) {
        finish({ ok: false, status: null, error: "Bad certificate date" });
        return;
      }

      const daysLeft = Math.floor((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
      if (daysLeft < 0) {
        finish({ ok: false, status: null, error: "Certificate expired" });
        return;
      }
      if (daysLeft <= SSL_WARN_DAYS) {
        finish({
          ok: false,
          status: null,
          error: `Certificate expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        });
        return;
      }

      finish({
        ok: true,
        status: null,
        error: null,
        detail: `Valid for ${daysLeft} days`,
      });
    });

    socket.once("error", (err) => {
      clearTimeout(timer);
      finish({ ok: false, status: null, error: err.message || "TLS failed" });
    });
  });
}

function statusLabel(
  monitor: Monitor,
  status: number | null,
  latency: number,
  detail?: string
): string {
  if (detail) return `${detail} · ${latency}ms`;
  if (monitor.type === "tcp" || monitor.type === "dns" || monitor.type === "ssl") {
    return `${latency}ms`;
  }
  if (status == null) return `${latency}ms`;
  return `HTTP ${status} in ${latency}ms`;
}
