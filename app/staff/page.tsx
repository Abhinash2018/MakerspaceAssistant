"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { api } from "@/lib/client-api";
import { historyCsv, texasTime, VisitPage, VisitRow } from "@/lib/visit-history";
function VisitPhoto({ row }: { row: VisitRow }) {
  const [failed, setFailed] = useState(false);
  return row.photoUrl && !failed ? <img src={row.photoUrl} alt={`Saved check-in photo for ${row.name}`} loading="lazy" className="visit-photo" onError={() => setFailed(true)}/> : <span className="history-muted">{row.photoUrl ? "Unavailable" : "No photo"}</span>;
}
export default function Staff() {
  const [csrf, setCsrf] = useState(""), [expires, setExpires] = useState(0), [key, setKey] = useState("");
  const [netid, setNetid] = useState(""), [attested, setAttested] = useState(false), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<VisitRow[]>([]), [cursor, setCursor] = useState<string | null>(null), [day, setDay] = useState(""), [loading, setLoading] = useState(false), [loaded, setLoaded] = useState(false);
  const active = useRef<AbortController | null>(null), generation = useRef(0);
  function clearSession() { generation.current++; active.current?.abort(); setCsrf(""); setExpires(0); setRows([]); setCursor(null); setLoaded(false); setNetid(""); setKey(""); setAttested(false); setLoading(false); setBusy(false); }
  function error(e: any) { if (e.name === "AbortError") return; if (e.status === 401 || e.status === 403) { clearSession(); setMessage("Please sign in with your staff access key."); } else setMessage(e.message || "Unable to load check-ins. Please try again."); }
  async function loadHistory(next?: string, selectedDay = day) {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    const g = generation.current; setLoading(true); setMessage("");
    const q = new URLSearchParams(); if (selectedDay) q.set("date", selectedDay); if (next) q.set("cursor", next);
    try { const r = await api<VisitPage>(`/api/staff/visits?${q}`, undefined, undefined, controller.signal); if (controller.signal.aborted || g !== generation.current) return; setRows(previous => next ? [...previous, ...r.visits] : r.visits); setCursor(r.nextCursor); setLoaded(true); }
    catch (e) { if (!controller.signal.aborted && g === generation.current) error(e); }
    finally { if (!controller.signal.aborted && g === generation.current) setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    api("/api/session", undefined, undefined, controller.signal).then(d => { if (!controller.signal.aborted && d.role === "staff") { setCsrf(d.csrf); setExpires(d.expiresAt); } }).catch(() => {});
    return () => { controller.abort(); active.current?.abort(); generation.current++; };
  }, []);
  useEffect(() => { if (csrf) { setRows([]); setCursor(null); setLoaded(false); void loadHistory(undefined, day); } return () => active.current?.abort(); }, [csrf, day]);
  useEffect(() => { if (!expires) return; const timer = setTimeout(() => { clearSession(); setMessage("Your staff session expired. Sign in again to view check-ins."); }, Math.max(0, expires - Date.now())); return () => clearTimeout(timer); }, [expires]);
  async function run(fn: () => Promise<void>) { if (busy) return; setBusy(true); setMessage(""); try { await fn(); } catch(e) { error(e); } finally { setBusy(false); } }
  function exportShown() {
    const url = URL.createObjectURL(new Blob([historyCsv(rows)], {type:"text/csv;charset=utf-8"}));
    const a = document.createElement("a"); a.href = url; a.download = `makerspace-checkins-${day || "recent"}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="kiosk"><header className="header"><div className="brand"><span className="wordmark">TXST</span><span className="brand-divider"/><div className="brand-copy">INGRAM HALL<br/>STAFF</div></div><a href="/" className="location">Back to kiosk</a></header>
    <main className="staff-main"><section className={csrf ? "staff-history" : "staff-login"}>
      <div className="history-heading"><div><span className="eyebrow">MAKERSPACE</span><h1>{csrf ? "Check-in history" : "Staff sign-in"}</h1></div>{csrf && <Button variant="ghost" disabled={busy} onClick={() => run(async () => { const res = await fetch("/api/session", {method:"DELETE", headers:{"X-CSRF-Token":csrf}}); if (!res.ok && res.status !== 401) throw new Error("Could not sign out. Please try again."); clearSession(); })}>Sign out</Button>}</div>
      {!csrf ? <form className="controls" onSubmit={e => { e.preventDefault(); run(async () => { const d = await api("/api/session", {role:"staff",key}); setKey(""); setCsrf(d.csrf); setExpires(d.expiresAt); }); }}><label htmlFor="staff-key">Staff access key</label><Input id="staff-key" type="password" className="text-input" value={key} onChange={e=>setKey(e.target.value)} autoComplete="off"/><Button className="action" type="submit" disabled={busy || !key}>{busy ? "Signing in…" : "Sign in"}</Button><p className="history-muted">Use your staff device to view visitor records.</p></form> : <>
        <p className="history-muted">Central Time · Newest first · Records retained for 30 days</p>
        <div className="history-toolbar"><label htmlFor="history-date">Date<Input id="history-date" type="date" value={day} onChange={e=>setDay(e.target.value)} /></label>{day && <Button variant="ghost" onClick={()=>setDay("")}>All dates</Button>}<Button variant="secondary" disabled={loading} onClick={()=>loadHistory()}>Refresh</Button><Button variant="secondary" disabled={!rows.length || loading} onClick={exportShown}>Download shown rows (CSV)</Button></div>
        <div className="history-table" aria-busy={loading}><Table><TableHeader><TableRow><TableHead>Check-in time</TableHead><TableHead>Name</TableHead><TableHead>NetID</TableHead><TableHead>Photo</TableHead></TableRow></TableHeader><TableBody>{rows.map(row=><TableRow key={row.id}><TableCell><time dateTime={row.checkedInAt}>{texasTime(row.checkedInAt)}</time></TableCell><TableCell className="history-name">{row.name}</TableCell><TableCell>{row.netid}</TableCell><TableCell><VisitPhoto row={row}/></TableCell></TableRow>)}</TableBody></Table>
        {loading && <p className="history-empty" role="status">Loading check-ins…</p>}{loaded && !rows.length && !loading && <p className="history-empty">{day ? "No check-ins on this date." : "No check-ins yet."}</p>}</div>
        <div className="history-bottom"><span className="history-muted">{rows.length} {rows.length === 1 ? "check-in" : "check-ins"} shown</span>{cursor && <Button variant="secondary" disabled={loading} onClick={()=>loadHistory(cursor)}>Load more</Button>}</div>
        <p className="history-muted">Photos appear only when saved with consent. Returning face scans do not save a new photo. Names and NetIDs are self-reported.</p>
        <details className="enrollment-management"><summary>Manage face enrollment</summary><div className="controls"><label htmlFor="netid">Student NetID</label><Input id="netid" className="text-input" value={netid} onChange={e=>{setNetid(e.target.value.toLowerCase());setAttested(false);}} autoComplete="off" autoCapitalize="none"/><label className="consent-note flex items-start gap-3"><Checkbox checked={attested} onCheckedChange={v=>setAttested(v===true)}/><span>I verified this student's identity and request to remove their face enrollment.</span></label><Button variant="secondary" disabled={busy || !attested || !netid} onClick={()=>run(async()=>{await api("/api/enrollment/revoke",{netid,attested},csrf);setMessage("Face enrollment removed, if present.");setAttested(false);})}>Remove face enrollment</Button></div></details>
      </>}{message && <p className="consent-note" role="status" style={{marginTop:20}}>{message}</p>}
    </section></main></div>;
}
