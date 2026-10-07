import type { Request } from "express";

export function readCookie(req: Request, name: string): string | undefined {
  const match = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!match) return undefined;
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return undefined;
  }
}
