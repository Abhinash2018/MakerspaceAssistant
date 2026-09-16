import { getDatabase } from "@/db";
import { readBody, response } from "@/lib/request";
import { requireSession, fail, HttpError } from "@/lib/security/auth";
import { chooseMatch, similarity, FACE_MODEL, faceProof, gallery } from "@/lib/security/face";
import { DAY, VISIT_DAYS, purgeExpired } from "@/lib/security/retention";
export async function POST(req: Request) {
  try {
    const s = await requireSession(req, ["kiosk"], "face-checkin", 6), body = await readBody(req, 1800000), db = getDatabase();
    if (body.consent !== true || typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) throw new HttpError(400, "Face check-in consent is required.");
    const previous = await db.prepare("SELECT session_id FROM visits WHERE id = ?").bind(body.id).first<{ session_id: string }>();
    if (previous) { if (previous.session_id !== s.id) throw new HttpError(409, "Visit identifier already used."); return response({ ok: true }); }
    const vector = await faceProof(body, s.id, body.id, "checkin");
    const candidates = await gallery();
    const match = chooseMatch(candidates.filter(p => p.identity.model === FACE_MODEL).map(value => ({ value, score: similarity(vector, value.identity.vector) })));
    if (!match) throw new HttpError(422, "No confident match. Please check in with your name and NetID; no visit was recorded.");
    const now = Date.now();
    // A short cooldown suppresses accidental repeated scans across devices.
    const result = await db.prepare("INSERT INTO visits (id, full_name, net_id, photo_key, photo_consent, consent_version, created_at, expires_at, session_id, method, profile_id) SELECT ?, ?, ?, NULL, 0, 'returning-face-v1', ?, ?, ?, 'face-match', ? WHERE EXISTS (SELECT 1 FROM face_profiles WHERE id = ? AND expires_at > ?) AND NOT EXISTS (SELECT 1 FROM visits WHERE profile_id = ? AND created_at > ?) ON CONFLICT(id) DO NOTHING")
      .bind(body.id, match.identity.name, match.identity.netid, new Date(now).toISOString(), now + VISIT_DAYS * DAY, s.id, match.row.id, match.row.id, now, match.row.id, new Date(now - 120000).toISOString()).run();
    if (!result.meta.changes) {
      const recent = await db.prepare("SELECT id FROM visits WHERE profile_id = ? AND created_at > ?").bind(match.row.id, new Date(now - 120000).toISOString()).first();
      if (!recent) throw new HttpError(409, "Enrollment expired or was revoked. Please check in with your name and NetID.");
    }
    await purgeExpired().catch(() => {});
    // Never reveal other students, match scores, names or NetIDs through this API.
    return response({ ok: true });
  } catch (e) { return fail(e); }
}
