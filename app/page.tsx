"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Mic, MicOff, Camera, CameraOff, Captions, Volume2, VolumeX, X, ArrowLeft, Check, BookOpen, UserRound, ScanFace, Square, FileText, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Orb } from "@/components/maker-orb";
import { api, ApiError } from "@/lib/client-api";
type Step = "idle" | "choose" | "name" | "netid" | "consent" | "face-consent" | "camera" | "review" | "done" | "ask";
type Source = { title: string; page: number; file: string };
type Device = { role: string; csrf: string; faceEnabled: boolean; expiresAt: number };
import { FACE_CONSENT_VERSION as faceConsentVersion, FaceSample } from "@/lib/face-contract";
import { scanVideo } from "@/lib/live-face";
export default function Home() {
  const [step, setStep] = useState<Step>("idle"), [caption, setCaption] = useState(""), [heard, setHeard] = useState(""), [input, setInput] = useState("");
  const [name, setName] = useState(""), [netid, setNetid] = useState(""), [photo, setPhoto] = useState<string | null>(null);
  const [photoConsent, setPhotoConsent] = useState(false), [faceConsent, setFaceConsent] = useState(false), [returning, setReturning] = useState(false);
  const [cameraOn, setCameraOn] = useState(false), [listening, setListening] = useState(false), [speaking, setSpeaking] = useState(false), [scanHint, setScanHint] = useState(""), [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [sources, setSources] = useState<Source[]>([]), [device, setDevice] = useState<Device | null>(null);
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), recognition = useRef<any>(null), request = useRef<AbortController | null>(null);
  const generation = useRef(0), busyRef = useRef(false), cameraPending = useRef(false), stepRef = useRef(step), activity = useRef(Date.now()), deviceRef = useRef<Device | null>(null);
  const visitId = useRef(""), scan = useRef<{ samples: FaceSample[]; model: string; challengeId: string } | null>(null);
  stepRef.current = step; deviceRef.current = device;
  function stopCamera() { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setCameraOn(false); }
  function stopMic() { recognition.current?.abort(); recognition.current = null; setListening(false); }
  function say(text: string) {
    setCaption(text); setError(""); window.speechSynthesis?.cancel(); setSpeaking(false);
    if (!muted && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; u.rate = .95;
      u.onstart = () => setSpeaking(true); u.onend = u.onerror = () => setSpeaking(false); window.speechSynthesis.speak(u);
    }
  }
  function reset() {
    generation.current++; request.current?.abort(); cameraPending.current = false; busyRef.current = false;
    stopCamera(); stopMic(); window.speechSynthesis?.cancel(); setSpeaking(false); setStep("idle"); setCaption(""); setHeard(""); setInput("");
    setScanHint(""); setName(""); setNetid(""); setPhoto(null); setPhotoConsent(false); setFaceConsent(false); setReturning(false); setBusy(false); setError(""); setSources([]);
    visitId.current = ""; scan.current = null;
  }
  useEffect(() => {
    const touch = () => { activity.current = Date.now(); };
    const hidden = () => { if (document.hidden) reset(); };
    const timer = setInterval(() => { if (stepRef.current !== "idle" && !busyRef.current && Date.now() - activity.current > 120000) reset(); }, 1000);
    const maintenance = setInterval(() => { const d = deviceRef.current; if (d?.role === "kiosk") api("/api/maintenance", {}, d.csrf).catch(() => {}); }, 60000);
    document.addEventListener("pointerdown", touch); document.addEventListener("keydown", touch); document.addEventListener("visibilitychange", hidden);
    return () => { clearInterval(timer); clearInterval(maintenance); document.removeEventListener("pointerdown", touch); document.removeEventListener("keydown", touch); document.removeEventListener("visibilitychange", hidden); stream.current?.getTracks().forEach(t => t.stop()); recognition.current?.abort(); request.current?.abort(); window.speechSynthesis?.cancel(); };
  }, []);
  useEffect(() => { if (step === "camera" && video.current && stream.current) { video.current.srcObject = stream.current; video.current.play().catch(() => setError("Tap the preview to start the camera.")); } }, [step, cameraOn]);
  function handleError(e: any) {
    if (e instanceof ApiError && e.status === 401) { reset(); setDevice(null); return; }
    setError(e.name === "AbortError" ? "The request timed out. Please try again." : e.message || "Something went wrong. Please try again.");
  }
  async function work(fn: (signal: AbortSignal, current: () => boolean) => Promise<void>) {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError("");
    const g = generation.current, controller = new AbortController(); request.current = controller;
    const current = () => g === generation.current && !controller.signal.aborted;
    try { await fn(controller.signal, current); } catch (e) { if (current()) handleError(e); }
    finally { if (g === generation.current) { busyRef.current = false; setBusy(false); } }
  }
  function choose() { setReturning(false); setStep("choose"); setInput(""); setHeard(""); setSources([]); say("Welcome to Ingram Hall Makerspace. Are you checking in, or do you have a question?"); }
  function begin() {
    if (busyRef.current) return;
    choose();
    if (device?.role === "kiosk" && device.expiresAt > Date.now()) return;
    setDevice(null);
    void work(async (signal, current) => {
      let d: Device | null = null;
      try { d = await api<Device>("/api/session", undefined, undefined, signal); }
      catch (e) { if (!(e instanceof ApiError) || e.status !== 401) throw e; }
      if (!current()) return;
      if (d?.role !== "kiosk") d = await api<Device>("/api/session", { role: "kiosk" }, undefined, signal);
      if (current()) setDevice(d);
    });
  }
  function manual() { generation.current++; cameraPending.current = false; stopCamera(); stopMic(); setReturning(false); visitId.current = ""; setPhoto(null); setFaceConsent(false); setPhotoConsent(false); scan.current = null; setSources([]); setInput(""); setHeard(""); setStep("name"); say("Let’s check you in. What’s your full name?"); }
  function listen() {
    if (listening) { recognition.current?.stop(); return; } window.speechSynthesis?.cancel(); setSpeaking(false);
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError("Voice input is unavailable. Please type your response."); return; }
    const r = new SR(); r.lang = "en-US"; r.interimResults = true; r.continuous = false;
    r.onresult = (e: any) => { if (recognition.current !== r) return; const t = Array.from(e.results).map((x: any) => x[0].transcript).join(" "); setInput(t); setHeard(t); activity.current = Date.now(); };
    r.onerror = (e: any) => { if (recognition.current === r) { setListening(false); if (e.error !== "aborted") setError("Speech was not available. Try again or type below."); } };
    r.onend = () => { if (recognition.current === r) setListening(false); };
    recognition.current = r; try { r.start(); setListening(true); } catch { setError("Unable to start microphone."); }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); stopMic(); const value = input.trim(); if (!value) return; setHeard(value); setError("");
    if (step === "name") { if (value.length < 2 || value.length > 100) { setError("Please enter your full name."); return; } setName(value); setInput(""); setStep("netid"); say("What’s your TXST NetID? Do not enter your password."); }
    else if (step === "netid") { const id = value.toLowerCase().replace(/\s/g, ""); if (!/^[a-z][a-z0-9]{2,19}$/.test(id)) { setError("Enter your NetID without an email address."); return; } setNetid(id); setInput(""); setStep("consent"); say("May I take and store a check-in photo for 30 days? You can continue without a photo."); }
    else await work(async (signal, current) => {
      if (step === "ask") { setInput(""); setSources([]); say("Let me check the Makerspace documents."); const result = await api("/api/ask", { question: value }, device?.csrf, signal); if (!current()) return; setSources(result.sources || []); say(result.answer); }
    });
  }
  async function openCamera() {
    if (cameraPending.current) return; cameraPending.current = true; const g = generation.current;
    stopMic(); setScanHint(""); setPhotoConsent(!returning); setHeard(returning ? "I agree to face check-in." : faceConsent ? "I agree to a photo and optional face enrollment." : "I agree to a check-in photo.");
    try { const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }); if (g !== generation.current) { media.getTracks().forEach(t => t.stop()); return; } stream.current = media; setCameraOn(true); setStep("camera"); say(returning || faceConsent ? "Center your face and tap Start scan. Follow the three prompts." : "Center yourself in the preview, then tap Take photo."); }
    catch { if (g === generation.current) setError("Camera access is unavailable. Allow it in your browser or use check-in without a photo."); }
    finally { if (g === generation.current) cameraPending.current = false; }
  }
  function snap() {
    const v = video.current; if (!v?.videoWidth) throw new Error("Camera is still starting.");
    const c = document.createElement("canvas"); c.width = 640; c.height = Math.round(640 * v.videoHeight / v.videoWidth); c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", .82);
  }
  async function capture() {
    if (!cameraOn) { await openCamera(); return; }
    await work(async (signal, current) => {
      if (!returning && !faceConsent) { setPhoto(snap()); stopCamera(); setStep("review"); say("Please review your details and photo, then confirm your check-in."); return; }
      const challenge = await api("/api/face/challenge", { purpose: returning ? "checkin" : "enroll", consent: true }, device?.csrf, signal);
      const result = await scanVideo(video.current!, challenge.direction, current, say, setScanHint, snap);
      if (!current()) return;
      stopCamera();
      scan.current = { samples: result.samples, model: result.model, challengeId: challenge.id };
      if (returning) { say("Checking your enrolled face."); if (!visitId.current) visitId.current = crypto.randomUUID(); await api("/api/face/checkin", { id: visitId.current, consent: true, ...scan.current }, device?.csrf, signal); if (!current()) return; scan.current = null; setHeard(""); setStep("done"); say("You’re checked in. Welcome to the Makerspace."); }
      else { setPhoto(result.photo); setStep("review"); say("Review your photo and details. Confirm to save this visit and enroll your face for 90 days."); }
    });
  }
  function skipPhoto() { generation.current++; cameraPending.current = false; stopCamera(); setPhoto(null); setPhotoConsent(false); setFaceConsent(false); scan.current = null; setStep("review"); say("Please confirm your details to save this visit without a photo."); }
  async function save() {
    await work(async (signal, current) => {
      if (!visitId.current) visitId.current = crypto.randomUUID();
      await api("/api/checkin", { id: visitId.current, name, netid, photo, photoConsent, faceConsent, faceConsentVersion, ...scan.current }, device?.csrf, signal);
      if (!current()) return; setPhoto(null); scan.current = null; setName(""); setNetid(""); setHeard(""); setStep("done"); say(faceConsent ? "Your visit is recorded and face check-in is enrolled for 90 days. Next time, tap Check in, then Check in with face." : "You’re checked in. Welcome to the Makerspace.");
    });
  }
  const typed = ["name", "netid", "ask"].includes(step);
  return <div className="kiosk"><header className="header"><div className="brand"><span className="wordmark">TXST</span><span className="brand-divider"/><div className="brand-copy">INGRAM HALL<br/>MAKERSPACE</div></div><span className="location"><MapPin size={14}/> San Marcos, Texas</span></header>
    <main className="main">{step === "idle" ? <section className="idle"><div className="eyebrow">YOUR MAKERSPACE ASSISTANT</div><Orb active={false}/><h1>Ready when you are.</h1><p className="subtle">Check in or ask a question.</p><Button className="start-button" onClick={begin}>Touch to begin <ArrowRight size={18}/></Button><p className="privacy-line">Camera and microphone stay off until you choose to use them.</p></section> :
    <section className="session"><div className="session-visual"><Orb active={speaking || listening}/><div className="session-state">{listening ? "Listening" : speaking ? "Speaking" : busy ? "Working" : cameraOn ? "Camera active" : "Ready when you are"}</div></div><div className="session-panel">
      <div className="panel-top"><span className="eyebrow">{step === "choose" ? "LET’S GET STARTED" : step === "ask" ? "MAKERSPACE KNOWLEDGE" : returning ? "FACE CHECK-IN" : "VISITOR CHECK-IN"}</span><Button className="end" variant="ghost" onClick={reset}>End session <X size={14}/></Button></div>
      {step === "done" && <div className="success-icon"><Check size={21}/></div>}
      <div className={`response ${caption.length > 250 ? "long" : ""}`}><div className="caption-label"><Volume2 size={13}/> ASSISTANT<Button aria-label={muted ? "Enable voice" : "Mute voice"} className="!h-7 !w-7 !p-0 !ml-auto" variant="ghost" onClick={() => { window.speechSynthesis?.cancel(); setSpeaking(false); setMuted(!muted); }}>{muted ? <VolumeX size={15}/> : <Volume2 size={15}/>}</Button></div><p className="caption" aria-live="polite" aria-atomic="true">{caption}</p></div>
      {heard && <div className="heard"><span>{listening ? "HEARING YOU" : "YOU"}</span>{heard}</div>}
      {!!sources.length && <div className="sources">{sources.map((s, i) => <a key={i} href={`/documents/${encodeURIComponent(s.file)}#page=${s.page}`} target="_blank" rel="noreferrer"><FileText size={13}/>{s.title} · p. {s.page}</a>)}</div>}
      <div className="controls">
        {step === "choose" && <><Button className="action" disabled={busy || !device} onClick={manual}><span className="action-label"><UserRound size={18}/> Check in</span><ArrowRight size={17}/></Button><Button className="action secondary" disabled={busy || !device} onClick={() => { setStep("ask"); setSources([]); setInput(""); setHeard(""); say("What would you like to know about the Makerspace?"); }}><span className="action-label"><BookOpen size={18}/> Ask a question</span><ArrowRight size={17}/></Button></>}
        {typed && <form onSubmit={submit}><label className="field-label" htmlFor="response">{step === "name" ? "Full name" : step === "netid" ? "TXST NetID" : "Your question"}</label><div className="form-row" style={{ marginTop: 9 }}><Input id="response" className="text-input" value={input} onChange={e => setInput(e.target.value)} maxLength={step === "ask" ? 1000 : 100} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={busy}/>{<Button type="button" variant="secondary" className="icon-button" onClick={listen} disabled={busy} aria-label={listening ? "Stop listening" : "Use microphone"}>{listening ? <Square size={18}/> : <Mic size={19}/>}</Button>}<Button type="submit" className="icon-button" disabled={busy || !input.trim()} aria-label="Continue"><ArrowRight size={20}/></Button></div><p className="small-note">Review recognized speech before sending.</p></form>}
        {step === "name" && <Button className="action secondary" onClick={() => { stopMic(); setInput(""); setReturning(true); setStep("face-consent"); setHeard(""); say("Use your enrolled face to record this visit? A short live camera scan will match your face. Follow the head-turn prompts. The video stays on this device."); }}><span className="action-label"><ScanFace size={18}/> Check in with face</span><ArrowRight size={17}/></Button>}
        {step === "consent" && <><div className="consent-note">The check-in photo, name, NetID, and visit time expire after 30 days. A photo is optional.</div>{device?.faceEnabled && <label className="consent-note flex items-start gap-3"><Checkbox checked={faceConsent} onCheckedChange={v => setFaceConsent(v === true)} aria-label="Enroll my face for future check-ins"/><span>Enable faster check-in next time: I agree to a short live face scan and storage of an encrypted face template with my name and NetID for 90 days. The video is not saved. I can ask staff to remove my enrollment sooner.</span></label>}<Button className="action" onClick={openCamera}><span className="action-label"><Camera size={18}/> I agree · Enable camera</span><ArrowRight size={17}/></Button><Button className="action secondary" onClick={skipPhoto}>Continue without photo</Button></>}
        {step === "face-consent" && <><div className="consent-note">For students who opted into face check-in on a previous visit. Your video is not saved.</div>{!device?.faceEnabled && <p className="error">Face check-in is temporarily unavailable. You can check in with your name and NetID.</p>}<Button className="action" disabled={!device?.faceEnabled} onClick={openCamera}>I agree · Start face check-in <ScanFace size={18}/></Button><Button variant="ghost" onClick={manual}>Use name and NetID</Button></>}
        {step === "camera" && <><div className="camera"><video ref={video} autoPlay playsInline muted onClick={() => video.current?.play()} aria-label="Camera preview"/><div className="camera-guide"/><div className="camera-label">Live preview · not saved</div></div>{scanHint && <p className="small-note" role="status" aria-live="polite">{scanHint}</p>}<Button className="action" onClick={capture} disabled={busy}>{busy ? "Follow the spoken prompts…" : !cameraOn ? "Restart camera" : returning || faceConsent ? "Start scan" : "Take photo"}<Camera size={18}/></Button>{!busy && <Button variant="ghost" onClick={returning ? manual : skipPhoto}>Cancel photo</Button>}</>}
        {step === "review" && <>{photo && <div className="camera"><img src={photo} alt="Your photo, not yet saved"/><div className="camera-label">Review · not yet saved</div></div>}<div className="details"><strong>{name}</strong><span>{netid}</span></div><p className="small-note">Visit{photo ? " and photo" : ""} retained 30 days{faceConsent ? " · face enrollment retained 90 days" : ""}.</p><Button className="action" onClick={save} disabled={busy}>{busy ? "Saving…" : "Confirm & save check-in"}<Check size={18}/></Button><Button variant="ghost" disabled={busy} onClick={() => { setPhoto(null); scan.current = null; setStep("consent"); say("You can take a new photo or continue without one."); }}>Change photo choice</Button></>}
        {step === "done" && <Button className="action" onClick={reset}>Finish <ArrowRight size={18}/></Button>}
        {step === "choose" && error && !device && <Button variant="ghost" disabled={busy} onClick={begin}>Try again</Button>}
        {error && <p className="error" role="alert">{error}</p>}
        {!["choose", "idle", "done"].includes(step) && <Button variant="ghost" className="back" disabled={busy} onClick={() => { generation.current++; cameraPending.current = false; stopCamera(); stopMic(); choose(); }}><ArrowLeft size={14}/> Back</Button>}
      </div></div></section>}</main>
    <footer className="footer"><span>INGRAM HALL · TEXAS STATE UNIVERSITY</span><div className="device-state"><span>{cameraOn ? <Camera size={13}/> : <CameraOff size={13}/>} Camera {cameraOn ? "on" : "off"}</span><span>{listening ? <Mic size={13}/> : <MicOff size={13}/>} Mic {listening ? "on" : "off"}</span><span><Captions size={14}/> Captions on</span></div></footer></div>;
}
