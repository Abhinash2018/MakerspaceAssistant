import { getDatabase, getPhotos } from "@/db";
export const VISIT_DAYS = 30;
export const FACE_DAYS = 90;
export const DAY = 86400000;
// Bounded, retryable deletion. A record remains until its object is successfully deleted.
// This function also runs from the authenticated hourly maintenance endpoint.
export async function purgeExpired() {
  const db = getDatabase(), now = Date.now(), cutoff = new Date(now - VISIT_DAYS * DAY).toISOString();
  const rows = await db.prepare("SELECT id, photo_key FROM visits WHERE (expires_at > 0 AND expires_at <= ?) OR (expires_at = 0 AND created_at <= ?) LIMIT 100").bind(now, cutoff).all<{ id: string; photo_key: string | null }>();
  let removed = 0;
  for (const row of rows.results) {
    if (row.photo_key) await getPhotos().delete(row.photo_key);
    await db.prepare("DELETE FROM visits WHERE id = ?").bind(row.id).run(); removed++;
  }
  await db.batch([
    db.prepare("DELETE FROM face_profiles WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM verification_grants WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM pairing_codes WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM face_challenges WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM rate_limits WHERE expires_at <= ?").bind(now),
  ]);
  // Remove old orphan uploads from interrupted requests as well as database-linked photos.
  const state = await db.prepare("SELECT object_cursor FROM cleanup_state WHERE id = 1").first<{object_cursor: string | null}>();
  const objects = await getPhotos().list({ prefix: "visits/", limit: 1000, ...(state?.object_cursor ? {cursor: state.object_cursor} : {}) });
  for (const object of objects.objects) if (object.uploaded.getTime() <= now - VISIT_DAYS * DAY) await getPhotos().delete(object.key);
  await db.prepare("INSERT INTO cleanup_state (id, last_success_at, object_cursor) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET last_success_at=excluded.last_success_at, object_cursor=excluded.object_cursor").bind(now, objects.truncated ? objects.cursor : null).run();
  return { removed, more: rows.results.length === 100 || objects.truncated };
}
