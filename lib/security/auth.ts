import { env } from "cloudflare:workers";
import { getDatabase } from "@/db";
import { digest } from "./crypto";
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export type Session = { id: string; role: "staff" | "kiosk"; csrf: string; expires_at: number };
export function fail(error: unknown) {
  const status = error instanceof HttpError ? error.status : 503;
  return Response.json({ error: error instanceof HttpError ? error.message : "Service unavailable. Please try again or contact staff." }, {
    status, headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) },
  });
}
export function assertOrigin(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin) throw new HttpError(403, "Request origin rejected.");
}
export function cookieName(req: Request) {
  if (new URL(req.url).protocol === "https:") return "__Host-maker-session";
  if (env.ALLOW_LOCAL_HTTP === "true" && ["localhost", "127.0.0.1"].includes(new URL(req.url).hostname)) return "maker-local-session";
  throw new HttpError(403, "HTTPS is required.");
}
export function sessionCookie(req: Request, token: string, seconds: number) {
  return `${cookieName(req)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function rateLimit(key: string, limit: number, seconds = 60) {
  const now = Date.now(); const bucket = Math.floor(now / (seconds * 1000));
  const row = await getDatabase().prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count")
    .bind(`${await digest(key)}:${bucket}`, (bucket + 2) * seconds * 1000).first<{ count: number }>();
  if (!row || row.count > limit) throw new HttpError(429, "Too many requests. Please wait a minute.");
}
export async function requireSession(req: Request, roles: Session["role"][], scope: string, limit = 30) {
  const name = cookieName(req);
  const tokens = (req.headers.get("cookie") || "").split(";").map(x => x.trim()).filter(x => x.startsWith(name + "="));
  if (tokens.length !== 1) throw new HttpError(401, "Start a session to continue.");
  const token = tokens[0].slice(name.length + 1);
  if (!/^[\w-]{43}$/.test(token)) throw new HttpError(401, "Session invalid.");
  const session = await getDatabase().prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > ?").bind(await digest(token), Date.now()).first<Session>();
  if (!session) throw new HttpError(401, "Session expired. Touch to begin again.");
  if (!roles.includes(session.role)) throw new HttpError(403, "This action requires a staff session.");
  if (req.method !== "GET") {
    assertOrigin(req);
    if (req.headers.get("x-csrf-token") !== session.csrf) throw new HttpError(403, "Request token rejected. Reload the page.");
  }
  await rateLimit(`${session.id}:${scope}`, limit);
  await rateLimit(`all:${scope}`, Math.max(100, limit * 5));
  return session;
}
