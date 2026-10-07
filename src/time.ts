import type { Request } from "express";
import { readCookie } from "./cookies.js";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const SLOT_MS = 15 * 60 * 1000;
const TIME_ZONE_COOKIE = "tz";

export type Day = { key: string; start: number; end: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const id = `${timeZone}|${JSON.stringify(options)}`;
  let cached = formatters.get(id);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
    formatters.set(id, cached);
  }
  return cached;
}

function isTimeZone(value: string): boolean {
  try {
    formatter(value, {});
    return true;
  } catch {
    return false;
  }
}

export function visitorTimeZone(req: Request): string {
  const value = readCookie(req, TIME_ZONE_COOKIE);
  return value && value.length <= 64 && isTimeZone(value) ? value : "UTC";
}

function wallClock(ms: number, timeZone: string): number {
  const parts = formatter(timeZone, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(ms);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
}

function offsetMs(ms: number, timeZone: string): number {
  return wallClock(ms, timeZone) - Math.floor(ms / 60000) * 60000;
}

function dayKey(ms: number, timeZone: string): string {
  return new Date(wallClock(ms, timeZone)).toISOString().slice(0, 10);
}

function midnight(key: string, timeZone: string): number {
  const local = Date.parse(`${key}T00:00:00Z`);
  const guess = local - offsetMs(local, timeZone);
  const start = local - offsetMs(guess, timeZone);
  // When a clock change skips midnight, the day starts at the change instead.
  return dayKey(start, timeZone) === key ? start : guess;
}

// The last `count` calendar days in the visitor's timezone, oldest first, with the instants each one starts and ends.
export function lastDays(count: number, timeZone: string): Day[] {
  const today = Date.parse(`${dayKey(Date.now(), timeZone)}T00:00:00Z`);
  const keys = Array.from({ length: count + 1 }, (_, i) =>
    new Date(today - (count - 1 - i) * DAY_MS).toISOString().slice(0, 10)
  );
  const starts = keys.map((key) => midnight(key, timeZone));
  return keys.slice(0, count).map((key, i) => ({ key, start: starts[i], end: starts[i + 1] }));
}

export function dayIndex(days: Day[], ms: number): number {
  return days.findIndex((day) => ms >= day.start && ms < day.end);
}

export function formatDay(key: string): string {
  return formatter("UTC", { month: "short", day: "numeric", year: "numeric" }).format(Date.parse(`${key}T00:00:00Z`));
}

export function formatTime(iso: string | null, timeZone: string): string {
  if (!iso) return "Waiting for the first check";
  return formatter(timeZone, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export const timeZoneScript = `(function () {
  try {
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    var match = document.cookie.match(/(?:^|; )${TIME_ZONE_COOKIE}=([^;]*)/);
    if (!tz || (match && decodeURIComponent(match[1]) === tz)) return;
    document.cookie = "${TIME_ZONE_COOKIE}=" + encodeURIComponent(tz) + "; path=/; max-age=31536000; samesite=lax";
    if (document.cookie.indexOf("${TIME_ZONE_COOKIE}=") !== -1) location.reload();
  } catch (e) {}
})();`;
