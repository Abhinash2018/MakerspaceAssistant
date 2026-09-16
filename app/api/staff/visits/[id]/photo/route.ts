import { getDatabase, getPhotos } from "@/db";
import { requireSession, fail, HttpError } from "@/lib/security/auth";
import { DAY, VISIT_DAYS } from "@/lib/security/retention";
export const dynamic = "force-dynamic";
export async function GET(req: Request, context: { params: Promise<{id:string}> }) {
  try {
    await requireSession(req, ["staff"], "history-photo", 180);
    const { id } = await context.params;
    if (!/^[\w-]{1,100}$/.test(id)) throw new HttpError(404, "Photo unavailable.");
    const now = Date.now();
    const row = await getDatabase().prepare("SELECT photo_key FROM visits WHERE id = ? AND photo_consent = 1 AND (expires_at > ? OR (expires_at = 0 AND created_at > ?))").bind(id, now, new Date(now - VISIT_DAYS * DAY).toISOString()).first<{photo_key:string|null}>();
    if (!row?.photo_key) throw new HttpError(404, "Photo unavailable.");
    const photo = await getPhotos().get(row.photo_key);
    if (!photo) throw new HttpError(404, "Photo unavailable.");
    return new Response(photo.body, { headers: { "Content-Type":"image/jpeg", "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff", "Cross-Origin-Resource-Policy":"same-origin", "Content-Disposition":"inline" } });
  } catch(e) { return fail(e); }
}
