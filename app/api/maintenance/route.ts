import { env } from "cloudflare:workers";
import { constantEqual } from "@/lib/security/crypto";
import { requireSession, HttpError, fail } from "@/lib/security/auth";
import { purgeExpired } from "@/lib/security/retention";
import { response } from "@/lib/request";
export async function POST(req: Request) {
  try {
    const bearer = req.headers.get("authorization");
    if (bearer) {
      if (!env.MAINTENANCE_KEY || env.MAINTENANCE_KEY.length < 32 || !(await constantEqual(bearer, `Bearer ${env.MAINTENANCE_KEY}`))) throw new HttpError(401, "Invalid maintenance credential.");
    } else await requireSession(req, ["staff", "kiosk"], "maintenance", 2);
    return response(await purgeExpired());
  } catch (e) { return fail(e); }
}
