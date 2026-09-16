import { getDatabase } from "@/db";
import { readBody, response } from "@/lib/request";
import { requireSession, fail, HttpError } from "@/lib/security/auth";
import { faceConfigured } from "@/lib/security/face";
export async function POST(req: Request) {
  try {
    const s = await requireSession(req, ["kiosk"], "face-challenge", 8); faceConfigured();
    const body = await readBody(req, 1000);
    if (!["enroll", "checkin"].includes(body.purpose) || body.consent !== true) throw new HttpError(400, "Explicit face-scan consent is required.");
    const id = crypto.randomUUID(), direction = crypto.getRandomValues(new Uint8Array(1))[0] % 2 ? "left" : "right";
    await getDatabase().prepare("INSERT INTO face_challenges (id, session_id, purpose, direction, expires_at) VALUES (?, ?, ?, ?, ?)").bind(id, s.id, body.purpose, direction, Date.now() + 120000).run();
    return response({ id, direction });
  } catch (e) { return fail(e); }
}
