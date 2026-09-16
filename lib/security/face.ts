import { env } from "cloudflare:workers";
import { getDatabase } from "@/db";
import { HttpError } from "./auth";
import { digest, unseal } from "./crypto";
import { FACE_MODEL, FACE_CONSENT_VERSION, MATCH_THRESHOLD, MATCH_MARGIN, validVector, faceDistance, scanValid, FaceSample } from "../face-contract";
export { FACE_MODEL, FACE_CONSENT_VERSION, MATCH_THRESHOLD, MATCH_MARGIN };
export type Profile = { id: string; net_id_hash: string; payload: string; expires_at: number };
export type FaceIdentity = { name: string; netid: string; vector: number[]; model: string };
export function jpeg(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length > 550000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value)) throw new HttpError(400, "Please take a new photo.");
  let bytes: Uint8Array; try { bytes = Uint8Array.from(atob(value.split(",")[1]), c => c.charCodeAt(0)); } catch { throw new HttpError(400, "Invalid photo."); }
  if (bytes.length < 100 || bytes.length > 400000 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw new HttpError(400, "Invalid JPEG photo.");
  return bytes;
}
export function similarity(a: number[], b: number[]) {
  if (!validVector(a) || !validVector(b)) throw new HttpError(400, "Invalid face template.");
  return 1 - faceDistance(a, b);
}
export function chooseMatch<T>(ranked: { score: number; value: T }[]): T | null {
  const sorted = [...ranked].sort((a, b) => b.score - a.score);
  if (!sorted.length || sorted[0].score < MATCH_THRESHOLD) return null;
  if (sorted[1] && sorted[0].score - sorted[1].score < MATCH_MARGIN) return null;
  return sorted[0].value;
}
export async function gallery() {
  const rows = await getDatabase().prepare("SELECT * FROM face_profiles WHERE expires_at > ? LIMIT 1001").bind(Date.now()).all<Profile>();
  if (rows.results.length > 1000) throw new HttpError(503, "Face check-in needs a larger matching service. Please check in with your name and NetID.");
  return Promise.all(rows.results.map(async row => ({ row, identity: await unseal<FaceIdentity>(row.payload, `face:${row.id}`) })));
}
export function faceConfigured() {
  if (env.FACE_ENABLED === "false") throw new HttpError(503, "Face check-in is temporarily unavailable. Please use your name and NetID.");
}
export async function faceProof(body: any, sessionId: string, visitId: string, purpose: "enroll" | "checkin") {
  faceConfigured();
  if (body.model !== FACE_MODEL || typeof body.challengeId !== "string" || !Array.isArray(body.samples) || body.samples.length !== 3) throw new HttpError(400, "A fresh video face scan is required.");
  const samples = body.samples as FaceSample[];
  const hash = await digest(JSON.stringify({ samples, model: body.model, photo: body.photo || null }));
  const challenge = await getDatabase().prepare("SELECT direction FROM face_challenges WHERE id = ? AND session_id = ? AND purpose = ? AND expires_at > ?")
    .bind(body.challengeId, sessionId, purpose, Date.now()).first<{ direction: string }>();
  if (!challenge || !scanValid(samples, challenge.direction)) throw new HttpError(400, "Follow the face scan prompts and try again.");
  const used = await getDatabase().prepare("UPDATE face_challenges SET used_by = ?, body_hash = ? WHERE id = ? AND session_id = ? AND purpose = ? AND expires_at > ? AND (used_by IS NULL OR (used_by = ? AND body_hash = ?)) RETURNING direction")
    .bind(visitId, hash, body.challengeId, sessionId, purpose, Date.now(), visitId, hash).first();
  if (!used) throw new HttpError(400, "This face scan expired or was already used. Please scan again.");
  // Browser samples are untrusted attendance input, never identity/access proof.
  return samples[0].vector.map((value, i) => (value + samples[2].vector[i]) / 2);
}
