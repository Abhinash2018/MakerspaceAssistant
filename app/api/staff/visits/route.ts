import { getDatabase } from "@/db";
import { requireSession, fail, HttpError } from "@/lib/security/auth";
import { response } from "@/lib/request";
import { DAY, VISIT_DAYS } from "@/lib/security/retention";
import { texasDayRange } from "@/lib/visit-history";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    await requireSession(req, ["staff"], "history", 30);
    const q = new URL(req.url).searchParams, day = q.get("date"), cursor = q.get("cursor");
    const now = Date.now();
    let where = "(expires_at > ? OR (expires_at = 0 AND created_at > ?))";
    const args: (string | number)[] = [now, new Date(now - VISIT_DAYS * DAY).toISOString()];
    if (day) {
      let range: [string, string]; try { range = texasDayRange(day); } catch { throw new HttpError(400, "Choose a valid date."); }
      where += " AND created_at >= ? AND created_at < ?"; args.push(...range);
    }
    if (cursor) {
      let value; try { value = JSON.parse(atob(cursor)); } catch { throw new HttpError(400, "Invalid page cursor."); }
      if (cursor.length > 500 || !value || typeof value.at !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.at) || typeof value.id !== "string" || !/^[\w-]{1,100}$/.test(value.id)) throw new HttpError(400, "Invalid page cursor.");
      where += " AND (created_at < ? OR (created_at = ? AND id < ?))"; args.push(value.at, value.at, value.id);
    }
    const result = await getDatabase().prepare(`SELECT id, full_name, net_id, created_at, photo_key, photo_consent FROM visits WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT 51`).bind(...args).all<{id:string; full_name:string; net_id:string; created_at:string; photo_key:string|null; photo_consent:number}>();
    const page = result.results.slice(0, 50), last = page[page.length - 1];
    return response({ visits: page.map(v => ({ id: v.id, name: v.full_name, netid: v.net_id, checkedInAt: v.created_at, photoUrl: v.photo_key && v.photo_consent ? `/api/staff/visits/${encodeURIComponent(v.id)}/photo` : null })), nextCursor: result.results.length > 50 ? btoa(JSON.stringify({at:last.created_at,id:last.id})) : null });
  } catch (e) { return fail(e); }
}
