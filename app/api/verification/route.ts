import { getDatabase } from "@/db";
import { readBody, response } from "@/lib/request";
import { digest, randomToken, seal, unseal } from "@/lib/security/crypto";
import { requireSession, fail, HttpError } from "@/lib/security/auth";
export type Identity = { name: string; netid: string; verifiedBy: string; verifiedAt: number };
export async function POST(req: Request) {
  try {
    const s = await requireSession(req, ["staff", "kiosk"], "verify", 10), body = await readBody(req, 4000), db = getDatabase();
    if (s.role === "staff") {
      if (body.attested !== true || typeof body.name !== "string" || body.name.trim().length < 2 || body.name.length > 100 || /[\u0000-\u001f]/.test(body.name) || typeof body.netid !== "string" || !/^[a-z][a-z0-9]{2,19}$/.test(body.netid)) throw new HttpError(400, "Verify the student's name and NetID against their TXST ID and an authorized university source.");
      const id = crypto.randomUUID(), code = randomToken(12);
      const payload = await seal({ name: body.name.trim(), netid: body.netid, verifiedBy: s.id, verifiedAt: Date.now() }, `grant:${id}`);
      await db.prepare("INSERT INTO verification_grants (id, code_hash, payload, expires_at) VALUES (?, ?, ?, ?)").bind(id, await digest(code), payload, Date.now() + 600000).run();
      return response({ code, expiresIn: 600 });
    }
    if (typeof body.code !== "string" || body.code.length > 100) throw new HttpError(400, "Verification code required.");
    const row = await db.prepare("UPDATE verification_grants SET session_id = ? WHERE code_hash = ? AND expires_at > ? AND consumed_by IS NULL AND (session_id IS NULL OR session_id = ?) RETURNING id, payload")
      .bind(s.id, await digest(body.code.trim()), Date.now(), s.id).first<{ id: string; payload: string }>();
    if (!row) throw new HttpError(400, "Code expired, already used, or invalid. Ask staff for a new code.");
    const identity = await unseal<Identity>(row.payload, `grant:${row.id}`);
    return response({ grantId: row.id, name: identity.name, netid: identity.netid });
  } catch (e) { return fail(e); }
}
