import {
  getMonitor,
  getSetting,
  lastCheckedAt,
  latestCheck,
  listIncidents,
  listMonitors,
  recentChecks,
  uptimeRatio,
  type Monitor,
  type MonitorType,
} from "./db.js";
import { MONITOR_TYPES, SSL_WARN_DAYS, targetLabel, typeLabel } from "./targets.js";
import { escapeHtml, formatTime, icon, layout, pct, themeToggle, ticks, wordmark } from "./ui.js";

export type Overall = "calm" | "watch" | "down";

const TICK_COUNT = 90;

export function overallStatus(): Overall {
  const monitors = listMonitors().filter((m) => m.enabled);
  if (!monitors.length) return "watch";
  const states = monitors.map((m) => latestCheck(m.id));
  if (states.some((c) => c && !c.ok)) return "down";
  if (states.some((c) => !c)) return "watch";
  return "calm";
}

const headlines: Record<Overall, { title: string; mood: "up" | "watch" | "down" }> = {
  calm: { title: "All services are online", mood: "up" },
  watch: { title: "Collecting uptime data", mood: "watch" },
  down: { title: "Some services are down", mood: "down" },
};

function brandName(): string {
  return process.env.APP_NAME?.trim() || "StatusPanda";
}

function nav(brand: string, extra: string): string {
  return `<header class="nav">
    ${wordmark(brand)}
    <div class="nav-links">${extra}${themeToggle()}</div>
  </header>`;
}

export function statusPage(opts: { isAdmin?: boolean } = {}): string {
  const overall = overallStatus();
  const copy = headlines[overall];
  const monitors = listMonitors();
  const incidents = listIncidents(8);
  const brand = brandName();
  const title = getSetting("page_title", brand);
  const subtitle = getSetting("page_subtitle");
  const last = lastCheckedAt();
  const headline = title === brand ? copy.title : title;

  const body = `
    <div class="shell">
      ${nav(
        brand,
        `<a class="nav-link" href="#status">Status</a>
         <a class="nav-link" href="#incidents">Previous incidents</a>
         <a class="btn" href="/login">${icon("admin")}Admin</a>`
      )}

      <section class="hero" id="status">
        <div class="hero-status">
          <span class="hero-mark ${copy.mood}" aria-hidden="true">${statusGlyph(copy.mood)}</span>
          <div>
            <h1>${escapeHtml(headline)}</h1>
            ${subtitle ? `<p class="hero-sub">${escapeHtml(subtitle)}</p>` : ""}
            <p class="hero-updated">Last updated ${escapeHtml(formatUpdated(last))}</p>
          </div>
        </div>
      </section>

      ${monitors.length ? monitorList(monitors) : emptyPublic()}
      ${incidentList(incidents)}

      <footer class="footer">
        <span>Powered by StatusPanda</span>
      </footer>
    </div>
    <script>
      const src = new EventSource('/events');
      src.onmessage = () => { location.reload(); };
    </script>
  `;

  return layout({
    title: `${title} Status`,
    body,
    mood: copy.mood,
    headExtra: opts.isAdmin ? undefined : ga4Snippet(),
  });
}

function ga4Snippet(): string | undefined {
  const id = getSetting("ga4_id").trim();
  if (!/^G-[A-Z0-9]+$/i.test(id)) return;
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${id}');
  </script>`;
}

function statusGlyph(mood: "up" | "watch" | "down"): string {
  if (mood === "up") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12.5l3.2 3.2L17.5 8" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  if (mood === "down") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v7" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><circle cx="12" cy="17" r="1.5" fill="currentColor"/></svg>`;
}

function formatUpdated(iso: string | null): string {
  if (!iso) return "Waiting for the first check";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function emptyPublic(): string {
  return `<section class="services" id="services">
    <div class="empty">
      <h2>No services yet</h2>
      <p>Open Admin and add the first endpoint to start publishing uptime.</p>
    </div>
  </section>`;
}

function monitorList(monitors: Monitor[]): string {
  const rows = monitors
    .map((monitor) => {
      const last = latestCheck(monitor.id);
      const ok = last ? Boolean(last.ok) : null;
      const state = ok == null ? "watch" : ok ? "up" : "down";
      const label = ok == null ? "Checking" : ok ? "Operational" : "Down";
      const history = padTicks(recentChecks(monitor.id, TICK_COUNT).map((c) => Boolean(c.ok)));
      const up = pct(uptimeRatio(monitor.id));
      const upLabel = up === "new" ? "No data yet" : `${up} uptime`;
      return `<article class="monitor">
        <div class="monitor-head">
          <div>
            <h3>${escapeHtml(monitor.name)}</h3>
            <p class="monitor-desc">${escapeHtml(targetLabel(monitor.type, monitor.url))}</p>
          </div>
          <span class="status-text ${state}">${label}</span>
        </div>
        <div class="monitor-bars">
          ${ticks(history)}
          <span class="uptime-pct">${escapeHtml(upLabel)}</span>
        </div>
        <div class="range-labels">
          <span>90 checks ago</span>
          <span>60</span>
          <span>30</span>
          <span>Today</span>
        </div>
      </article>`;
    })
    .join("");
  return `<section class="services" id="services">${rows}</section>`;
}

function incidentList(
  incidents: Array<{ title: string; started_at: string; ended_at: string | null; monitor_name: string; body: string }>
): string {
  const items = incidents.length
    ? incidents
        .map((item) => {
          const open = !item.ended_at;
          return `<article class="incident ${open ? "open" : ""}">
            <div class="incident-head">
              <h3>${escapeHtml(item.title)}</h3>
              <span class="status-text ${open ? "down" : "up"}">${open ? "Ongoing" : "Resolved"}</span>
            </div>
            <p class="incident-meta">${escapeHtml(item.monitor_name)} · ${escapeHtml(formatTime(item.started_at))}${
              open ? "" : ` · Resolved ${escapeHtml(formatTime(item.ended_at))}`
            }</p>
            <p class="incident-body">${escapeHtml(item.body)}</p>
          </article>`;
        })
        .join("")
    : `<p class="incident-empty">No incidents reported.</p>`;
  return `<section class="incidents" id="incidents">
    <h2>Previous incidents</h2>
    ${items}
  </section>`;
}

export function loginPage(error?: string): string {
  const body = `
    <div class="login-shell">
      ${themeToggle()}
      <div class="login-card">
        ${wordmark(brandName())}
        <h1>Welcome in.</h1>
        <p class="hint">Username defaults to admin. Password is ADMIN_PASSWORD in your Railway variables.</p>
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
        <form method="post" action="/login">
          <label for="user">Username</label>
          <input id="user" name="user" autocomplete="username" value="admin" />
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required />
          <div class="row" style="margin-top:28px">
            <button class="btn primary" type="submit">${icon("enter")}Enter</button>
            <a class="btn" href="/">${icon("status")}Status page</a>
          </div>
        </form>
      </div>
    </div>
  `;
  return layout({ title: "Admin", body, mood: "up" });
}

export function adminPage(opts: { toast?: string; editId?: number }): string {
  const monitors = listMonitors();
  const edit = opts.editId ? getMonitor(opts.editId) : undefined;
  const brand = brandName();
  const selectedType: MonitorType = edit?.type ?? "http";
  const typeMeta = MONITOR_TYPES.find((item) => item.value === selectedType) ?? MONITOR_TYPES[0];
  const body = `
    <div class="shell">
      ${nav(
        brand,
        `<a class="btn" href="/">${icon("status")}Status</a>
         <a class="btn" href="/admin/settings">${icon("settings")}Settings</a>
         <form method="post" action="/logout"><button class="btn" type="submit">${icon("logout")}Sign out</button></form>`
      )}
      <p class="page-kicker">Admin</p>
      <h1 style="font-size:clamp(2.6rem,6vw,4.2rem);max-width:12ch;margin-bottom:28px">What should we watch?</h1>

      <form class="service monitor-form" method="post" action="${edit ? `/admin/monitors/${edit.id}` : "/admin/monitors"}" id="monitor-form">
        <div class="monitor-form-head">
          <div>
            <h3>${edit ? "Edit monitor" : "Add a monitor"}</h3>
            <p class="field-hint" id="type-hint">${escapeHtml(typeMeta.hint)}${
              selectedType === "ssl" ? ` Fails within ${SSL_WARN_DAYS} days of expiry.` : ""
            }</p>
          </div>
        </div>

        <div class="tab-group" role="tablist" aria-label="Check type">
          ${MONITOR_TYPES.map(
            (item) => `<label class="tab-btn">
              <input type="radio" name="type" value="${item.value}" ${selectedType === item.value ? "checked" : ""} />
              <span>${item.label}</span>
            </label>`
          ).join("")}
        </div>

        <div class="monitor-form-body">
          <div class="form-grid">
            <div>
              <label for="name">Name</label>
              <input id="name" name="name" required placeholder="Marketing site" value="${escapeHtml(edit?.name ?? "")}" />
            </div>
            <div>
              <label for="url" id="target-label">${escapeHtml(typeMeta.targetLabel)}</label>
              <input id="url" name="url" required placeholder="${escapeHtml(typeMeta.placeholder)}" value="${escapeHtml(edit?.url ?? "")}" />
            </div>
            <div id="keyword-field" ${selectedType === "keyword" ? "" : "hidden"}>
              <label for="keyword">Keyword</label>
              <input id="keyword" name="keyword" placeholder="ok" value="${escapeHtml(edit?.keyword ?? "")}" ${
                selectedType === "keyword" ? "required" : ""
              } />
            </div>
            <div>
              <label for="interval_sec">Interval</label>
              <select id="interval_sec" name="interval_sec">
                ${intervalOptions(edit?.interval_sec ?? 60)}
              </select>
            </div>
            <div id="status-field" ${selectedType === "http" || selectedType === "keyword" ? "" : "hidden"}>
              <label for="expected_status">Expected status</label>
              <input id="expected_status" name="expected_status" type="number" min="100" max="599" value="${edit?.expected_status ?? 200}" />
            </div>
            <div>
              <label for="timeout_ms">Timeout ms</label>
              <input id="timeout_ms" name="timeout_ms" type="number" min="2000" max="30000" value="${edit?.timeout_ms ?? 10000}" />
            </div>
          </div>

          ${edit ? `<input type="hidden" name="enabled" value="${edit.enabled}" />` : ""}
          <div class="row monitor-form-actions">
            <button class="btn primary" type="submit">${edit ? `${icon("save")}Save` : `${icon("plus")}Add monitor`}</button>
            ${edit ? `<a class="btn" href="/admin">${icon("cancel")}Cancel</a>` : ""}
          </div>
        </div>
      </form>

      <section class="monitor-list">
        <div class="monitor-list-head">
          <h2>Your monitors</h2>
          <span class="monitor-count">${monitors.length}</span>
        </div>
        <div class="stack">
          ${
            monitors.length
              ? monitors.map((m) => adminCard(m, opts.editId)).join("")
              : `<div class="empty service"><h2>No monitors yet</h2><p>Pick a check type above, paste a target, and you are watching.</p></div>`
          }
        </div>
      </section>
    </div>
    <script>
      (function () {
        var meta = ${JSON.stringify(
          Object.fromEntries(
            MONITOR_TYPES.map((item) => [
              item.value,
              {
                targetLabel: item.targetLabel,
                placeholder: item.placeholder,
                hint: item.hint + (item.value === "ssl" ? " Fails within " + SSL_WARN_DAYS + " days of expiry." : ""),
              },
            ])
          )
        )};
        var form = document.getElementById("monitor-form");
        if (!form) return;
        var label = document.getElementById("target-label");
        var url = document.getElementById("url");
        var hint = document.getElementById("type-hint");
        var keywordField = document.getElementById("keyword-field");
        var keyword = document.getElementById("keyword");
        var statusField = document.getElementById("status-field");
        function sync() {
          var checked = form.querySelector('input[name="type"]:checked');
          var type = checked ? checked.value : "http";
          var info = meta[type] || meta.http;
          if (label) label.textContent = info.targetLabel;
          if (url) url.setAttribute("placeholder", info.placeholder);
          if (hint) hint.textContent = info.hint;
          var isKeyword = type === "keyword";
          var isHttp = type === "http" || type === "keyword";
          if (keywordField) keywordField.hidden = !isKeyword;
          if (keyword) {
            if (isKeyword) keyword.setAttribute("required", "required");
            else keyword.removeAttribute("required");
          }
          if (statusField) statusField.hidden = !isHttp;
        }
        form.querySelectorAll('input[name="type"]').forEach(function (input) {
          input.addEventListener("change", sync);
        });
        sync();
      })();
    </script>
  `;
  return layout({ title: "Monitors", body, mood: overallStatus() === "down" ? "down" : "up", toast: opts.toast });
}

function adminCard(monitor: Monitor, editId?: number): string {
  const last = latestCheck(monitor.id);
  const ok = last ? Boolean(last.ok) : null;
  const state = ok == null ? "watch" : ok ? "up" : "down";
  const label = ok == null ? "Checking" : ok ? "Up" : "Down";
  const history = padTicks(recentChecks(monitor.id, TICK_COUNT).map((c) => Boolean(c.ok)));
  return `<article class="service">
    <div class="service-top">
      <div>
        <h3>${escapeHtml(monitor.name)}</h3>
        <div class="meta"><span>${escapeHtml(typeLabel(monitor.type))}</span><span>${escapeHtml(targetLabel(monitor.type, monitor.url))}</span></div>
      </div>
      <span class="state ${state}">${label}</span>
    </div>
    ${ticks(history)}
    <div class="row" style="margin-top:16px">
      <a class="btn" href="/admin?edit=${monitor.id}">${icon("edit")}${editId === monitor.id ? "Editing" : "Edit"}</a>
      <form method="post" action="/admin/monitors/${monitor.id}/pause">
        <button class="btn" type="submit">${monitor.enabled ? `${icon("pause")}Pause` : `${icon("play")}Resume`}</button>
      </form>
      <form method="post" action="/admin/monitors/${monitor.id}/delete">
        <button class="btn danger" type="submit">${icon("trash")}Remove</button>
      </form>
    </div>
  </article>`;
}

export function settingsPage(toast?: string): string {
  const brand = brandName();
  const body = `
    <div class="shell">
      ${nav(brand, `<a class="btn" href="/admin">${icon("monitors")}Monitors</a><a class="btn" href="/">${icon("status")}Status</a>`)}
      <p class="page-kicker">Settings</p>
      <h1 style="font-size:clamp(2.6rem,6vw,4.2rem);max-width:10ch;margin-bottom:36px">Page and alerts</h1>
      <form method="post" action="/admin/settings" class="service stack">
        <div>
          <label for="page_title">Public title</label>
          <input id="page_title" name="page_title" value="${escapeHtml(getSetting("page_title", brand))}" />
        </div>
        <div>
          <label for="page_subtitle">Public subtitle</label>
          <input id="page_subtitle" name="page_subtitle" value="${escapeHtml(getSetting("page_subtitle", ""))}" placeholder="Leave blank to use the live headline" />
        </div>
        <div>
          <label for="discord_webhook">Discord webhook</label>
          <input id="discord_webhook" name="discord_webhook" value="${escapeHtml(getSetting("discord_webhook"))}" placeholder="https://discord.com/api/webhooks/..." />
        </div>
        <div>
          <label for="slack_webhook">Slack webhook</label>
          <input id="slack_webhook" name="slack_webhook" value="${escapeHtml(getSetting("slack_webhook"))}" placeholder="https://hooks.slack.com/services/..." />
        </div>
        <div>
          <label for="generic_webhook">Generic JSON webhook</label>
          <input id="generic_webhook" name="generic_webhook" value="${escapeHtml(getSetting("generic_webhook"))}" placeholder="https://example.com/hooks/status" />
        </div>
        <div>
          <label for="ga4_id">Google Analytics 4 measurement ID</label>
          <input id="ga4_id" name="ga4_id" value="${escapeHtml(getSetting("ga4_id"))}" placeholder="G-XXXXXXXXXX" />
          <p class="field-hint">Only tracks visitors on the public status page, never signed-in admins.</p>
        </div>
        <button class="btn primary" type="submit">${icon("save")}Save</button>
      </form>
    </div>
  `;
  return layout({ title: "Settings", body, mood: "up", toast });
}

function intervalOptions(selected: number): string {
  const opts = [
    [30, "Every 30 seconds"],
    [60, "Every minute"],
    [120, "Every 2 minutes"],
    [300, "Every 5 minutes"],
    [600, "Every 10 minutes"],
  ] as const;
  return opts
    .map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`)
    .join("");
}

function padTicks(values: boolean[]): Array<boolean | null> {
  const missing = Math.max(0, TICK_COUNT - values.length);
  return [...Array(missing).fill(null), ...values];
}
