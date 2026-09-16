import { FACE_MODEL, FaceSample, faceDistance } from "./face-contract";
let loading: Promise<any> | null = null;
export function loadFaceModels(): Promise<any> {
  if (!loading) loading = (async () => {
    if (!(window as any).faceapi) await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script"); script.src = "/face-models/face-api.js"; script.async = true;
      script.onload = () => resolve(); script.onerror = () => { script.remove(); reject(new Error("Face models could not load. Check the connection and try again.")); }; document.head.appendChild(script);
    });
    const f = (window as any).faceapi;
    try { await f.tf.setBackend("webgl"); } catch { await f.tf.setBackend("cpu"); }
    await f.tf.ready();
    await Promise.all([f.nets.tinyFaceDetector.loadFromUri("/face-models"), f.nets.faceLandmark68Net.loadFromUri("/face-models"), f.nets.faceRecognitionNet.loadFromUri("/face-models")]);
    return f;
  })().catch(() => { loading = null; throw new Error("Face models could not load. Check the connection, reload the page, and try again."); });
  return loading;
}
// Video remains on the device. Only three descriptors and the consented first photo leave it.
export async function scanVideo(video: HTMLVideoElement, direction: string, current: () => boolean, prompt: (s: string) => void, detected: (s: string) => void, snapshot: () => string) {
  prompt("Preparing face scan. Keep your face in the camera preview.");
  const f = await loadFaceModels();
  const samples: FaceSample[] = []; let photo = "", stable = 0, lastHint = "", stage = -1;
  const started = performance.now();
  while (performance.now() - started < 45000) {
    if (!current()) throw new DOMException("Cancelled", "AbortError");
    if (stage !== samples.length) { stage = samples.length; prompt(stage === 0 ? "Look straight at the camera." : stage === 1 ? `Turn your head slightly to your ${direction}.` : "Look straight at the camera again."); }
    const results = await f.detectAllFaces(video, new f.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 })).withFaceLandmarks().withFaceDescriptors();
    if (!current()) throw new DOMException("Cancelled", "AbortError");
    let hint = "Keep one face in the preview.";
    if (results.length === 1) {
      const r = results[0], points = r.landmarks.positions;
      const left = points[36], right = points[45], nose = points[30];
      const eyeSpan = Math.hypot(right.x - left.x, right.y - left.y);
      const yaw = (nose.x - (left.x + right.x) / 2) / eyeSpan;
      const vector = Array.from(r.descriptor) as number[];
      const first = samples[0];
      const delta = first ? yaw - first.yaw : 0;
      const pose = stage === 0 ? Math.abs(yaw) < 0.25 : stage === 1 ? (direction === "left" ? delta >= 0.10 : delta <= -0.10) : Math.abs(delta) < 0.10;
      const same = !first || faceDistance(first.vector, vector) < (stage === 1 ? 0.60 : 0.45);
      const close = r.detection.box.width >= video.videoWidth * 0.18;
      hint = !close ? "Move a little closer." : !same ? "Keep the same face in view." : pose ? "Face detected. Hold still." : stage === 1 ? `Turn a little more to your ${direction}.` : "Face the camera straight on.";
      stable = pose && same && close ? stable + 1 : 0;
      if (stable >= 2) { samples.push({ vector, yaw, time: Math.round(performance.now() - started) }); if (samples.length === 1) photo = snapshot(); stable = 0; if (samples.length === 3) { detected("Face scan captured."); return { samples, photo, model: FACE_MODEL }; } }
    } else { stable = 0; hint = results.length ? "More than one face detected. Please scan one person at a time." : "No face detected. Face the camera in good lighting."; }
    if (hint !== lastHint) { detected(hint); lastHint = hint; }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("The scan timed out. Try again in good lighting, or use your name and NetID.");
}
