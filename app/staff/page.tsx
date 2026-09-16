"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/client-api";
export default function Staff() {
  const [csrf, setCsrf] = useState(""), [key, setKey] = useState(""), [netid, setNetid] = useState(""), [attested, setAttested] = useState(false), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { api("/api/session").then(d => { if (d.role === "staff") setCsrf(d.csrf); }).catch(() => {}); }, []);
  async function run(fn: () => Promise<void>) { setBusy(true); setMessage(""); try { await fn(); } catch (e: any) { setMessage(e.message); if (e.status === 401) setCsrf(""); } finally { setBusy(false); } }
  return <div className="kiosk"><header className="header"><div className="brand"><span className="wordmark">TXST</span><span className="brand-divider"/><div className="brand-copy">MAKERSPACE<br/>STAFF SETUP</div></div><a href="/" className="location">Back to kiosk</a></header><main className="main"><section style={{ maxWidth: 520, width: "100%" }}><h1>{csrf ? "Enrollment management" : "Staff sign-in"}</h1>
    {!csrf ? <form className="controls" onSubmit={e => { e.preventDefault(); run(async () => { const r = await api("/api/session", { role: "staff", key }); setCsrf(r.csrf); setKey(""); }); }}><label className="field-label" htmlFor="staff-key">Staff access key</label><Input id="staff-key" type="password" className="text-input" value={key} onChange={e => setKey(e.target.value)} autoComplete="off"/><Button className="action" disabled={busy || !key} type="submit">Sign in</Button><p className="small-note">Use your staff device. Do not leave a staff session on an unattended kiosk.</p></form> : <div className="controls">
      <label className="field-label" htmlFor="netid">Verified NetID</label><Input id="netid" className="text-input" value={netid} onChange={e => { setNetid(e.target.value.toLowerCase()); setAttested(false); }} autoComplete="off" autoCapitalize="none"/>
      <label className="consent-note flex items-start gap-3"><Checkbox checked={attested} onCheckedChange={v => setAttested(v === true)}/><span>I verified this student's identity and request to remove their face enrollment.</span></label>
      <Button className="action secondary" disabled={busy || !attested || !netid} onClick={() => run(async () => { await api("/api/enrollment/revoke", { netid, attested }, csrf); setMessage("Face enrollment removed, if present. Future face check-ins cannot use it."); setAttested(false); })}>Remove this student's face enrollment</Button>
      <Button variant="ghost" disabled={busy} onClick={() => run(async () => { await fetch("/api/session", { method: "DELETE", headers: { "X-CSRF-Token": csrf } }); setCsrf(""); setNetid(""); })}>Sign out</Button>
    </div>}{message && <p className="consent-note" role="status" style={{ whiteSpace: "pre-wrap", marginTop: 20, overflowWrap: "anywhere" }}>{message}</p>}</section></main></div>;
}
