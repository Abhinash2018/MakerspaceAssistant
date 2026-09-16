import { getDatabase, getPhotos } from "@/db";
import { readBody, response } from "@/lib/request";
import { requireSession, fail, HttpError } from "@/lib/security/auth";
import { FACE_CONSENT_VERSION, faceProof, gallery, similarity, MATCH_THRESHOLD, FACE_MODEL, jpeg } from "@/lib/security/face";
import { keyedHash, seal } from "@/lib/security/crypto";
import { DAY, FACE_DAYS, VISIT_DAYS, purgeExpired } from "@/lib/security/retention";
export async function POST(req: Request) {
  let uploaded: string | null = null;
  try {
    const s = await requireSession(req, ["kiosk"], "checkin", 8);
    const body = await readBody(req, 1800000), { id, photo, photoConsent, faceConsent } = body;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id) || typeof photoConsent !== "boolean" || typeof faceConsent !== "boolean") throw new HttpError(400, "Invalid check-in.");
    const db = getDatabase();
    const old = await db.prepare("SELECT session_id FROM visits WHERE id = ?").bind(id).first<{ session_id: string }>();
    if (old) { if (old.session_id !== s.id) throw new HttpError(409, "Visit identifier already used."); return response({ ok: true }); }
    if (typeof body.name !== "string" || typeof body.netid !== "string") throw new HttpError(400, "Enter your name and NetID.");
    const identity = { name: body.name.trim(), netid: body.netid.trim().toLowerCase(), identitySource: "self-reported" };
    if (identity.name.length < 2 || identity.name.length > 100 || /[\x00-\x1f]/.test(identity.name) || !/^[a-z][a-z0-9]{2,19}$/.test(identity.netid)) throw new HttpError(400, "Enter a full name and valid NetID.");
    if ((photo && !photoConsent) || (!photo && photoConsent) || (faceConsent && !photoConsent)) throw new HttpError(400, "Photo and face enrollment require separate consent.");
    const bytes = photo ? jpeg(photo) : null;
    if (faceConsent && (body.faceConsentVersion !== FACE_CONSENT_VERSION || !body.samples || body.model !== FACE_MODEL)) throw new HttpError(400, "Please review and accept face enrollment before scanning.");
    let profileId: string | null = null, profilePayload: string | null = null, netHash: string | null = null;
    if (faceConsent) {
      const vector = await faceProof(body, s.id, id, "enroll");
      netHash = await keyedHash(identity.netid);
      const existing = await gallery();
      if (existing.some(p => p.row.net_id_hash !== netHash && p.identity.model === FACE_MODEL && similarity(vector, p.identity.vector) >= MATCH_THRESHOLD)) throw new HttpError(409, "This face may already be enrolled. Use face check-in or continue without enrolling again.");
      // A typed NetID must never authorize replacing someone else's enrollment.
      if (existing.some(p => p.row.net_id_hash === netHash)) throw new HttpError(409, "Face check-in is already set up for this NetID. Use face check-in or continue without enrolling again.");
      profileId = crypto.randomUUID();
      profilePayload = await seal({ ...identity, vector, model: FACE_MODEL }, `face:${profileId}`);
    }
    const now = Date.now();
    if (bytes) { uploaded = `visits/${id}/${crypto.randomUUID()}.jpg`; await getPhotos().put(uploaded, bytes, { httpMetadata: { contentType: "image/jpeg", cacheControl: "no-store" } }); }
    // A D1 batch atomically saves enrollment and visit. Active enrollments cannot
    // be overwritten by someone typing the same NetID. Only expired slots renew.
    const statements = [];
    if (profileId && profilePayload && netHash) statements.push(db.prepare("INSERT INTO face_profiles (id, net_id_hash, payload, created_at, expires_at, consent_version) SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM visits WHERE id = ?) ON CONFLICT(net_id_hash) DO UPDATE SET id=excluded.id, payload=excluded.payload, created_at=excluded.created_at, expires_at=excluded.expires_at, consent_version=excluded.consent_version WHERE face_profiles.expires_at <= ?")
      .bind(profileId, netHash, profilePayload, now, now + FACE_DAYS * DAY, FACE_CONSENT_VERSION, id, now));
    statements.push(db.prepare("INSERT INTO visits (id, full_name, net_id, photo_key, photo_consent, consent_version, created_at, expires_at, session_id, method, profile_id) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'self-reported', ? WHERE ? IS NULL OR EXISTS (SELECT 1 FROM face_profiles WHERE id = ?) ON CONFLICT(id) DO NOTHING")
      .bind(id, identity.name, identity.netid, uploaded, photoConsent ? 1 : 0, faceConsent ? FACE_CONSENT_VERSION : "photo-consent-v2-30days", new Date(now).toISOString(), now + VISIT_DAYS * DAY, s.id, profileId, profileId, profileId));
    const result = await db.batch(statements);
    if (!result[result.length - 1].meta.changes) {
      if (uploaded) await getPhotos().delete(uploaded); uploaded = null;
      const saved = await db.prepare("SELECT id FROM visits WHERE id = ? AND session_id = ?").bind(id, s.id).first();
      if (!saved) throw new HttpError(409, "Enrollment changed. Continue without a photo or use face check-in.");
    }
    uploaded = null; // Committed photo is now owned by its database row.
    await purgeExpired().catch(() => {});
    return response({ ok: true, enrolled: faceConsent, enrollmentDays: faceConsent ? FACE_DAYS : undefined });
  } catch (e) { if (uploaded) await getPhotos().delete(uploaded).catch(() => {}); return fail(e); }
}
