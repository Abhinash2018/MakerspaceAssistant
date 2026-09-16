export const FACE_MODEL = "faceapi-resnet128-v1";
export const FACE_CONSENT_VERSION = "face-video-opt-in-v2-90days";
export const MATCH_THRESHOLD = 0.50; // score = 1 - Euclidean distance
export const MATCH_MARGIN = 0.08;
export type FaceSample = { vector: number[]; yaw: number; time: number };
export function validVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 128 && value.every(v => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 5) && value.some(v => Math.abs(v) > 0.001);
}
export function faceDistance(a: number[], b: number[]) {
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
}
export function scanValid(samples: FaceSample[], direction: string) {
  if (!Array.isArray(samples) || samples.length !== 3 || samples.some(s => !s || !validVector(s.vector) || !Number.isFinite(s.yaw) || Math.abs(s.yaw) > 2 || !Number.isFinite(s.time))) return false;
  const [first, turn, last] = samples;
  const delta = turn.yaw - first.yaw;
  return Math.abs(first.yaw) < 0.25 && (direction === "left" ? delta >= 0.10 : delta <= -0.10)
    && Math.abs(last.yaw - first.yaw) < 0.10 && turn.time > first.time && last.time > turn.time
    && last.time - first.time < 60000 && faceDistance(first.vector, last.vector) < 0.45
    && faceDistance(first.vector, turn.vector) < 0.60;
}
