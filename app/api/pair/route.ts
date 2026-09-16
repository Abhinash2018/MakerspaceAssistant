import { getDatabase } from "@/db";
import { response } from "@/lib/request";
import { digest, randomToken } from "@/lib/security/crypto";
import { requireSession, fail } from "@/lib/security/auth";
export async function POST(req: Request) {
  try { await requireSession(req, ["staff"], "pair", 5); const code = randomToken(12); await getDatabase().prepare("INSERT INTO pairing_codes (hash, expires_at) VALUES (?, ?)").bind(await digest(code), Date.now() + 300000).run(); return response({ code, expiresIn: 300 }); }
  catch (e) { return fail(e); }
}
