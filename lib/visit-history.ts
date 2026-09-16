export type VisitRow = { id: string; name: string; netid: string; checkedInAt: string; photoUrl: string | null };
export type VisitPage = { visits: VisitRow[]; nextCursor: string | null };
export const texasTime = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
// Resolve each midnight separately so a daylight-saving day may have 23 or 25 hours.
export function texasDayRange(day: string): [string, string] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Invalid date");
  const base = Date.parse(day + "T00:00:00Z");
  if (!Number.isFinite(base) || new Date(base).toISOString().slice(0, 10) !== day) throw new Error("Invalid date");
  function midnight(target: number) {
    let guess = target;
    for (let i = 0; i < 3; i++) {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
      const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
      const wall = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second);
      guess += target - wall;
    }
    return new Date(guess).toISOString();
  }
  return [midnight(base), midnight(base + 86400000)];
}
export function historyCsv(rows: VisitRow[]) {
  const cell = (s: string) => '"' + (/^[\s]*[=+@-]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"';
  return "\uFEFF" + [["Name", "NetID", "Check-in (Central Time)", "Check-in (UTC)", "Saved photo"], ...rows.map(r => [r.name, r.netid, texasTime(r.checkedInAt), r.checkedInAt, r.photoUrl ? "Yes" : "No"])].map(r => r.map(cell).join(",")).join("\r\n");
}
