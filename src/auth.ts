import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { readCookie } from "./cookies.js";

const COOKIE = "panda_session";
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRIES = 8;
const tries = new Map<string, { count: number; resetAt: number }>();

export function adminUser(): string {
  return (process.env.ADMIN_USER || "admin").trim() || "admin";
}

export function adminPassword(): string {
  if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim()) {
    return process.env.ADMIN_PASSWORD.trim();
  }
  const generated = crypto.randomBytes(12).toString("base64url");
  process.env.ADMIN_PASSWORD = generated;
  console.log(`ADMIN_PASSWORD was not set. Generated: ${generated}`);
  return generated;
}

function secret(): string {
  return adminPassword();
}

function token(): string {
  return crypto.createHmac("sha256", secret()).update("statuspanda-session").digest("hex");
}

export function setSession(res: Response): void {
  res.cookie(COOKIE, token(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 14,
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(COOKIE, { path: "/" });
}

export function isAuthed(req: Request): boolean {
  const value = readCookie(req, COOKIE);
  if (!value) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(token()));
  } catch {
    return false;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isAuthed(req)) {
    next();
    return;
  }
  res.redirect("/login");
}

export function loginAllowed(ip: string): boolean {
  const row = tries.get(ip);
  if (!row) return true;
  if (Date.now() > row.resetAt) {
    tries.delete(ip);
    return true;
  }
  return row.count < MAX_TRIES;
}

export function recordLogin(ip: string, ok: boolean): void {
  const row = tries.get(ip) ?? { count: 0, resetAt: Date.now() + WINDOW_MS };
  if (Date.now() > row.resetAt) {
    row.count = 0;
    row.resetAt = Date.now() + WINDOW_MS;
  }
  row.count = ok ? 0 : row.count + 1;
  tries.set(ip, row);
}

export function checkCredentials(user: string, password: string): boolean {
  const userOk = timingEqual(user.trim(), adminUser());
  const passOk = timingEqual(password, adminPassword());
  return userOk && passOk;
}

function timingEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left.length ? left : Buffer.from("x"), left.length ? left : Buffer.from("x"));
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}
