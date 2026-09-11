export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function layout(opts: {
  title: string;
  body: string;
  mood?: "up" | "watch" | "down";
  toast?: string;
  headExtra?: string;
}): string {
  const mood = opts.mood ?? "up";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
  <link rel="icon" href="/icon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script>
    (function () {
      try {
        var stored = localStorage.getItem("sp-theme");
        var dark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
        if (dark) document.documentElement.setAttribute("data-theme", "dark");
      } catch (e) {}
    })();
  </script>
  <style>${css}</style>
  ${opts.headExtra ?? ""}
</head>
<body class="mood-${mood}">
  ${opts.body}
  ${opts.toast ? `<div class="toast" role="status">${escapeHtml(opts.toast)}</div>` : ""}
  <script>${themeScript}</script>
</body>
</html>`;
}

export function ticks(values: Array<boolean | null>): string {
  const cells = values
    .map((value) => {
      const cls = value == null ? "unknown" : value ? "up" : "down";
      const label = value == null ? "No data" : value ? "Up" : "Down";
      return `<i class="tick ${cls}" title="${label}"></i>`;
    })
    .join("");
  return `<div class="ticks">${cells}</div>`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return "Waiting for the first check";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatAgo(iso: string | null): string {
  if (!iso) return "Waiting for the first check";
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec} ${sec === 1 ? "second" : "seconds"} ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} ${min === 1 ? "minute" : "minutes"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr} ${hr === 1 ? "hour" : "hours"} ago`;
  const day = Math.round(hr / 24);
  return `${day} ${day === 1 ? "day" : "days"} ago`;
}

export function pct(ratio: number | null): string {
  if (ratio == null) return "new";
  return `${(ratio * 100).toFixed(2)}%`;
}

export function wordmark(name = "StatusPanda"): string {
  return `<a class="brand" href="/">
    <img class="mark" src="/icon.svg" width="32" height="32" alt="" />
    <span class="word">${escapeHtml(name)}</span>
  </a>`;
}

type IconName =
  | "admin"
  | "enter"
  | "status"
  | "settings"
  | "logout"
  | "save"
  | "plus"
  | "cancel"
  | "edit"
  | "pause"
  | "play"
  | "trash"
  | "monitors";

const icons: Record<IconName, string> = {
  admin: `<path d="M12 3l7 3v5c0 4.5-2.8 7.8-7 9-4.2-1.2-7-4.5-7-9V6l7-3Z"/><path d="M9.5 12.2l1.8 1.8 3.4-3.6"/>`,
  enter: `<path d="M10 7l5 5-5 5"/><path d="M4 12h11"/><path d="M19 5v14"/>`,
  status: `<path d="M4 14v2M8 10v6M12 7v9M16 11v5M20 8v8"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M5.8 5.8l1.4 1.4M16.8 16.8l1.4 1.4M18.2 5.8l-1.4 1.4M7.2 16.8l-1.4 1.4"/>`,
  logout: `<path d="M10 7V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-2"/><path d="M4 12h10"/><path d="M7 9l-3 3 3 3"/>`,
  save: `<path d="M5 5h11l3 3v11H5V5Z"/><path d="M8 5v5h7V5"/><path d="M8 19v-6h8v6"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  cancel: `<path d="M7 7l10 10M17 7 7 17"/>`,
  edit: `<path d="M5 19h4l10-10-4-4L5 15v4Z"/><path d="M13 7l4 4"/>`,
  pause: `<path d="M8 6h2.5v12H8V6Zm5.5 0H16v12h-2.5V6Z"/>`,
  play: `<path d="M8 6.5v11l9-5.5-9-5.5Z"/>`,
  trash: `<path d="M5 8h14M9 8V6h6v2M8 8l1 12h6l1-12"/>`,
  monitors: `<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M8 20h8M12 16v4"/>`,
};

export function icon(name: IconName): string {
  return `<svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
}

export function themeToggle(): string {
  return `<button type="button" class="theme-toggle" id="theme-toggle" aria-label="Toggle color theme" title="Toggle theme">
    <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.2 8.2 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M18.4 5.6l-1.3 1.3M6.9 17.1l-1.3 1.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
  </button>`;
}

const themeScript = `
(function () {
  var root = document.documentElement;
  var btn = document.getElementById("theme-toggle");
  function isDark() { return root.getAttribute("data-theme") === "dark"; }
  function apply(dark) {
    if (dark) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    try { localStorage.setItem("sp-theme", dark ? "dark" : "light"); } catch (e) {}
    if (btn) btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  }
  if (btn) {
    btn.addEventListener("click", function () { apply(!isDark()); });
    btn.setAttribute("aria-label", isDark() ? "Switch to light theme" : "Switch to dark theme");
  }
})();
`;

const css = `
:root {
  --bg: #ffffff;
  --ink: #1a1a1a;
  --muted: #6b7280;
  --faint: #9ca3af;
  --line: #e5e7eb;
  --green: #22c55e;
  --green-text: #16a34a;
  --yellow: #d97706;
  --red: #ef4444;
  --soft-bg: #f9fafb;
  --surface: #ffffff;
  --btn-bg: #ffffff;
  --state-up-bg: #ecfdf5;
  --state-watch-bg: #fffbeb;
  --state-down-bg: #fef2f2;
  --focus: #94a3b8;
  --focus-ring: rgba(148,163,184,.25);
  color-scheme: light;
}
html[data-theme="dark"] {
  --bg: #0c0e12;
  --ink: #f2f3f5;
  --muted: #9ca3af;
  --faint: #6b7280;
  --line: #2a2e36;
  --green: #22c55e;
  --green-text: #4ade80;
  --yellow: #fbbf24;
  --red: #f87171;
  --soft-bg: #151821;
  --surface: #151821;
  --btn-bg: #151821;
  --state-up-bg: #0f2a1c;
  --state-watch-bg: #2a220c;
  --state-down-bg: #2a1214;
  --focus: #64748b;
  --focus-ring: rgba(100,116,139,.35);
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  background: var(--bg);
  color: var(--ink);
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  transition: background-color .2s ease, color .2s ease;
  overflow-x: clip;
}
a { color: inherit; text-decoration: none; }
.shell {
  width: min(920px, calc(100% - 48px));
  margin: 0 auto;
  padding: 28px 0 72px;
  max-width: 100%;
  overflow-x: clip;
}
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 56px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.brand .mark {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: block;
  flex-shrink: 0;
}
.word {
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -.02em;
}
.nav-links {
  display: flex;
  align-items: center;
  gap: 6px;
}
.nav-link {
  padding: 8px 10px;
  color: var(--muted);
  font-size: 14px;
  font-weight: 500;
}
.nav-link:hover { color: var(--ink); }
.btn, button.btn {
  appearance: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--btn-bg);
  color: var(--ink);
  font: inherit;
  font-size: 14px;
  font-weight: 550;
  line-height: 1;
  white-space: nowrap;
  vertical-align: middle;
}
.btn-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.btn:hover { background: var(--soft-bg); }
.btn.primary {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--bg);
}
.btn.danger { color: var(--red); }
.nav-links form,
.row form {
  display: inline-flex;
  margin: 0;
  align-items: center;
}
.theme-toggle {
  appearance: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--btn-bg);
  color: var(--ink);
  flex-shrink: 0;
}
.theme-toggle:hover { background: var(--soft-bg); }
.theme-toggle svg {
  width: 18px;
  height: 18px;
  display: block;
}
.theme-toggle .icon-sun { display: none; }
html[data-theme="dark"] .theme-toggle .icon-moon { display: none; }
html[data-theme="dark"] .theme-toggle .icon-sun { display: block; }

/* Better Stack style hero: flat, no banner, no cards */
.hero {
  margin: 0 0 48px;
}
.hero-status {
  display: flex;
  align-items: flex-start;
  gap: 18px;
}
.hero-mark {
  flex: 0 0 auto;
  width: 52px;
  height: 52px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: #fff;
}
.hero-mark svg { width: 26px; height: 26px; }
.hero-mark.up { background: var(--green); }
.hero-mark.watch { background: var(--yellow); }
.hero-mark.down { background: var(--red); }
.hero h1 {
  margin: 4px 0 0;
  max-width: none;
  font-size: clamp(1.75rem, 4vw, 2.35rem);
  font-weight: 700;
  letter-spacing: -.03em;
  line-height: 1.15;
  color: var(--ink);
}
.hero-sub {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 15px;
}
.hero-updated {
  margin: 10px 0 0;
  color: var(--faint);
  font-size: 14px;
}

/* Flat service list: no outer panel, no nested cards */
.services {
  display: grid;
  gap: 0;
}
.monitor {
  padding: 28px 0;
  border-top: 1px solid var(--line);
}
.monitor:last-child { border-bottom: 1px solid var(--line); }
.monitor-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.monitor h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -.02em;
}
.monitor-desc {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.status-text {
  flex: 0 0 auto;
  font-size: 14px;
  font-weight: 600;
}
.status-text.up { color: var(--green-text); }
.status-text.watch { color: var(--yellow); }
.status-text.down { color: var(--red); }
.monitor-bars {
  display: flex;
  align-items: center;
  gap: 14px;
}
.ticks {
  display: flex;
  flex: 1;
  gap: 2px;
  height: 34px;
  min-width: 0;
}
.tick {
  flex: 1;
  min-width: 2px;
  border-radius: 2px;
  background: var(--line);
}
.tick.up { background: var(--green); }
.tick.down { background: var(--red); }
.tick.unknown { background: var(--line); }
.tick:hover { filter: brightness(.92); }
html[data-theme="dark"] .tick:hover { filter: brightness(1.15); }
.uptime-pct {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}
.range-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  padding-right: 96px;
  color: var(--faint);
  font-size: 12px;
}
.empty {
  padding: 40px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.empty h2 {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 650;
}
.empty p {
  margin: 0;
  color: var(--muted);
}

.incidents {
  margin-top: 56px;
}
.incidents h2 {
  margin: 0 0 20px;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -.02em;
}
.incident {
  padding: 18px 0;
  border-top: 1px solid var(--line);
}
.incident:last-child { border-bottom: 1px solid var(--line); }
.incident-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.incident h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
}
.incident-meta {
  margin: 6px 0 0;
  color: var(--faint);
  font-size: 13px;
}
.incident-body {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 14px;
}
.incident-empty {
  margin: 0;
  padding: 18px 0;
  border-top: 1px solid var(--line);
  color: var(--muted);
}
.footer {
  margin-top: 48px;
  color: var(--faint);
  font-size: 13px;
}

/* Admin / forms only: light bordered panels (not public status) */
.service {
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}
.service-top {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: start;
  margin-bottom: 16px;
}
.service h3 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 650;
}
.service .meta {
  color: var(--muted);
  font-size: 13px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.service-top > div {
  min-width: 0;
}
.service .meta span + span::before {
  content: "·";
  margin-right: 8px;
  color: var(--faint);
}
.state {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
}
.state.up { background: var(--state-up-bg); color: var(--green-text); }
.state.watch { background: var(--state-watch-bg); color: var(--yellow); }
.state.down { background: var(--state-down-bg); color: var(--red); }
.field-label {
  display: block;
  margin: 14px 0 8px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
}
.field-hint {
  margin: 6px 0 0;
  color: var(--faint);
  font-size: 13px;
  line-height: 1.4;
}
.monitor-form {
  position: relative;
  isolation: isolate;
  width: 100%;
  margin-bottom: 28px;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--green) 18%, var(--line));
  background:
    radial-gradient(900px 280px at 0% 0%, rgba(34, 197, 94, 0.14), transparent 58%),
    radial-gradient(720px 260px at 100% 10%, rgba(15, 118, 110, 0.10), transparent 55%),
    radial-gradient(520px 220px at 70% 120%, rgba(56, 189, 248, 0.08), transparent 60%),
    linear-gradient(160deg, #f7fbf8 0%, #ffffff 48%, #f4f8fb 100%);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.7) inset,
    0 18px 40px -28px rgba(15, 23, 42, 0.18);
}
.monitor-form::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.55;
  background-image:
    radial-gradient(circle at 18% 28%, rgba(34, 197, 94, 0.22) 0 1.5px, transparent 2px),
    radial-gradient(circle at 42% 64%, rgba(15, 118, 110, 0.18) 0 1.5px, transparent 2px),
    radial-gradient(circle at 78% 22%, rgba(14, 165, 233, 0.18) 0 1.5px, transparent 2px),
    radial-gradient(circle at 88% 72%, rgba(34, 197, 94, 0.16) 0 1px, transparent 1.5px),
    radial-gradient(circle at 12% 82%, rgba(14, 165, 233, 0.14) 0 1px, transparent 1.5px);
  background-size: 180px 140px, 220px 160px, 160px 120px, 140px 140px, 200px 150px;
  background-position: 0 0, 40px 20px, 10px 60px, 80px 10px, 30px 40px;
  mask-image: linear-gradient(180deg, rgba(0,0,0,.9), rgba(0,0,0,.25));
}
.monitor-form::after {
  content: "";
  position: absolute;
  right: -40px;
  top: -50px;
  z-index: 0;
  width: 220px;
  height: 220px;
  pointer-events: none;
  border-radius: 50%;
  background:
    conic-gradient(from 210deg, rgba(34, 197, 94, 0.16), transparent 38%, rgba(14, 165, 233, 0.12), transparent 72%, rgba(34, 197, 94, 0.1));
  filter: blur(2px);
  opacity: 0.9;
}
html[data-theme="dark"] .monitor-form {
  border-color: color-mix(in srgb, var(--green) 28%, var(--line));
  background:
    radial-gradient(900px 280px at 0% 0%, rgba(34, 197, 94, 0.16), transparent 58%),
    radial-gradient(720px 260px at 100% 10%, rgba(45, 212, 191, 0.08), transparent 55%),
    radial-gradient(520px 220px at 70% 120%, rgba(56, 189, 248, 0.08), transparent 60%),
    linear-gradient(160deg, #12181a 0%, #151821 48%, #12161d 100%);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.04) inset,
    0 18px 40px -24px rgba(0, 0, 0, 0.55);
}
html[data-theme="dark"] .monitor-form::before {
  opacity: 0.4;
}
html[data-theme="dark"] .monitor-form::after {
  opacity: 0.7;
}
.monitor-form > * {
  position: relative;
  z-index: 1;
}
.monitor-form-head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
}
.monitor-form .tab-group {
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  border-color: color-mix(in srgb, var(--line) 80%, transparent);
  backdrop-filter: blur(8px);
}
.monitor-form input,
.monitor-form select {
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(6px);
}
.monitor-form-body {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}
.form-grid #keyword-field[hidden],
.form-grid #status-field[hidden] {
  display: none !important;
}
.tab-group {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  max-width: 100%;
  margin-top: 16px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--soft-bg);
  gap: 4px;
  box-sizing: border-box;
}
.tab-btn {
  position: relative;
  flex: 1 1 0;
  margin: 0;
  cursor: pointer;
  min-width: 0;
}
.tab-btn input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  pointer-events: none;
}
.tab-btn span {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border-radius: 7px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 650;
  transition: background-color .15s ease, color .15s ease, box-shadow .15s ease;
}
.tab-btn:hover span {
  color: var(--ink);
}
.tab-btn input:checked + span {
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 1px 2px rgba(0,0,0,.06);
}
html[data-theme="dark"] .tab-btn input:checked + span {
  box-shadow: 0 1px 2px rgba(0,0,0,.35);
}
.monitor-form-actions {
  margin-top: 4px;
}
.monitor-list {
  width: 100%;
}
.monitor-list-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.monitor-list-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}
.monitor-count {
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
}
.login-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--soft-bg);
  position: relative;
}
.login-shell .theme-toggle {
  position: absolute;
  top: 20px;
  right: 20px;
}
.login-card {
  width: min(400px, 100%);
  padding: 32px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}
.login-card h1 {
  margin: 20px 0 8px;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -.03em;
  max-width: none;
}
.hint {
  margin: 0 0 22px;
  color: var(--muted);
  font-size: 14px;
}
label {
  display: block;
  margin: 14px 0 6px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
}
input, select, textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  outline: none;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--focus);
  box-shadow: 0 0 0 3px var(--focus-ring);
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.stack { display: grid; gap: 12px; }
.row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.page-kicker {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
}
h1 {
  margin: 0;
  color: var(--ink);
  font-size: clamp(1.8rem, 4vw, 2.4rem);
  font-weight: 700;
  letter-spacing: -.03em;
  line-height: 1.15;
}
.toast {
  position: fixed;
  z-index: 20;
  right: 20px;
  bottom: 20px;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--ink);
  color: var(--bg);
  font-size: 14px;
  font-weight: 600;
}
.error {
  margin: 0 0 12px;
  color: var(--red);
  font-size: 14px;
}
@media (max-width: 720px) {
  .shell { width: min(920px, calc(100% - 28px)); padding-top: 20px; }
  .nav { margin-bottom: 36px; }
  .nav-link { display: none; }
  .hero { margin-bottom: 32px; }
  .hero-status { gap: 14px; }
  .hero-mark { width: 44px; height: 44px; }
  .monitor-bars { flex-wrap: wrap; }
  .uptime-pct { width: 100%; }
  .range-labels { padding-right: 0; }
  .grid-2, .form-grid { grid-template-columns: 1fr; }
  .tab-group {
    display: flex;
    max-width: 100%;
    overflow-x: auto;
    flex-wrap: nowrap;
  }
  .tab-btn { flex: 1 0 auto; }
  .tab-btn span { padding: 0 14px; }
  .ticks { height: 28px; }
}
`;
