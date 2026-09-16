import { env } from "cloudflare:workers";
import { getDatabase } from "@/db";
import { readBody, response } from "@/lib/request";
import { constantEqual, digest, randomToken } from "@/lib/security/crypto";
import { assertOrigin, fail, HttpError, rateLimit, requireSession, sessionCookie } from "@/lib/security/auth";
export async function GET(req: Request) {
  try { const s = await requireSession(req, ["kiosk", "staff"], "session", 120); return response({ role: s.role, csrf: s.csrf, faceEnabled: env.FACE_ENABLED !== "false", expiresAt: s.expires_at }); }
  catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    // Global authentication limits cannot be bypassed by forged IP headers.
    await rateLimit("session-login-global", 20);
    const body = await readBody(req, 2000);
    const role = body.role;
    if (role === "staff") {
      if (!env.STAFF_ACCESS_KEY || env.STAFF_ACCESS_KEY.length < 32) throw new HttpError(503, "Staff access is not configured.");
      if (typeof body.key !== "string" || !(await constantEqual(body.key, env.STAFF_ACCESS_KEY))) throw new HttpError(401, "Invalid staff access key.");
    } else if (role !== "kiosk") throw new HttpError(400, "Invalid session type.");
    // Kiosk sessions start automatically. They identify a browser, not a
    // verified device or person. Staff privileges still require the staff key.
    const token = randomToken(), csrf = randomToken(), seconds = role === "staff" ? 1800 : 43200;
    await getDatabase().prepare("INSERT INTO sessions (id, role, csrf, expires_at) VALUES (?, ?, ?, ?)").bind(await digest(token), role, csrf, Date.now() + seconds * 1000).run();
    return Response.json({ role, csrf, faceEnabled: env.FACE_ENABLED !== "false", expiresAt: Date.now() + seconds * 1000 }, { headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie(req, token, seconds) } });
  } catch (e) { return fail(e); }
}
export async function DELETE(req: Request) {
  try { const s = await requireSession(req, ["staff", "kiosk"], "logout"); await getDatabase().prepare("DELETE FROM sessions WHERE id = ?").bind(s.id).run(); return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie(req, "", 0) } }); }
  catch (e) { return fail(e); }
}
