import { getDatabase } from "@/db";
import { readBody, response } from "@/lib/request";
import { requireSession, fail, HttpError } from "@/lib/security/auth";
import { keyedHash } from "@/lib/security/crypto";
export async function POST(req: Request) {
  try {
    await requireSession(req, ["staff"], "revoke", 10); const body = await readBody(req, 1000);
    if (typeof body.netid !== "string" || !/^[a-z][a-z0-9]{2,19}$/.test(body.netid) || body.attested !== true) throw new HttpError(400, "Staff must verify the student's request before revocation.");
    await getDatabase().prepare("DELETE FROM face_profiles WHERE net_id_hash = ?").bind(await keyedHash(body.netid)).run();
    return response({ ok: true });
  } catch (e) { return fail(e); }
}
