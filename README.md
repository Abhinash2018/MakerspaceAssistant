# Ingram Makerspace Assistant

Touch-first iPad kiosk for TXST Ingram Hall Makerspace. The interface stays silent with camera and microphone off until the visitor chooses to begin. Speech is captioned, and speech input is reviewed before submission. Twelve supplied PDFs provide page-cited retrieval; set `OPENAI_API_KEY` server-side to enable generated RAG answers. With no key, answers are clearly labeled source excerpts.

## First visit and returning face check-in

1. Touch to begin opens Check in / Ask a question. The browser obtains a kiosk session automatically, with no pairing code or staff involvement. Kiosk sessions expire in 12 hours and a later touch starts a new one; staff sessions expire in 30 minutes.
2. Home offers only Check in and Ask a question. Check in opens the normal name → NetID → optional photo → confirmation flow. No staff verification code is required. A Check in with face option appears inside Check in.
3. Photo capture is optional and requires explicit consent. A separate opt-in permits an encrypted face template and entered identity to be retained for 90 days. Existing photos are never automatically enrolled.
4. For enrollment, the browser continuously detects faces in live video and captures three stable poses: front, a randomly selected head turn, then front. The student reviews the photo and confirms the visit and enrollment. Only the first image is uploaded as the consented visit photo. Video stays on the device. Three face descriptors and pose measurements are sent to the backend; only the averaged descriptor is retained.
5. On later visits, the student chooses Check in → Check in with face, consents to the scan, and completes the short head-turn scan. A sufficiently strong, unambiguous match records the visit without asking for a name or NetID. Returning scan images are discarded. Uncertain/no-match scans fall back to name-and-NetID check-in.
6. Staff can immediately revoke enrollment at `/staff` after verifying the student's request. Expired/revoked profiles cannot match.

Names and NetIDs are self-reported and labeled that way in stored visits. No TXST SSO or directory verification is configured. Matching a face recalls the identity supplied at enrollment; it does not establish a university-verified identity. An active face enrollment cannot be replaced by entering its NetID again. No device pairing is required. Staff sign-in at `/staff` is only for enrollment administration. The kiosk records visits; it neither unlocks doors nor measures current occupancy.

## App-level API security

Every data/API operation requires an app-owned opaque session, except bounded session creation and the maintenance operation, which alternatively accepts its own secret bearer credential. Kiosk sessions are issued automatically to visitors who can reach the app; they are anonymous browser sessions, not device or user authentication. Hosting access protection controls who can reach this private deployment. Staff operations still require an authenticated staff session. If deployed publicly, visitor session creation is also public. Session tokens are 256-bit random values, stored only as hashes in D1 and delivered through HttpOnly, Secure, SameSite=Strict cookies. Client-side visibility is never used for authorization. Staff/kiosk roles are checked server-side. All browser mutations require same-origin requests and a session-bound CSRF token. Production requires HTTPS; localhost HTTP is opt-in for development only.

D1 atomic counters enforce per-session and global route limits, including pre-authentication login limits. Limits are fixed windows, so a burst may straddle a window boundary. Storage failure fails protected operations closed. Request bodies and image sizes are bounded. Registration validates the submitted name/NetID format and stores its self-reported provenance. Active face enrollments cannot be overwritten by retyping a NetID; expired enrollments can be renewed with fresh consent. Idempotency keys are bound to the kiosk session. Face challenges bind purpose, kiosk, time, visit ID, and scan-payload digest to reject reuse of the same challenge for another visit or payload. A two-minute cooldown suppresses repeated face check-ins.

Face descriptors are computed in the browser using bundled, self-hosted FaceAPI models. The backend validates descriptor shape, pose sequence, challenge binding, and match ambiguity, but browser data can be forged. This is convenience attendance logging, not biometric authentication or proof of presence. Enrollment templates and verification payloads use AES-GCM with context-bound authenticated data. NetID lookup indexes use keyed HMAC. All face data stays out of OpenAI requests. No public student/photo/gallery/list endpoint exists. The model compares only voluntarily enrolled identities.

## Retention and deletion

- Visits, names/NetIDs recorded in visits, and consented visit photos: 30 days.
- Enrolled identity and encrypted face template: 90 days from explicit enrollment/renewal; scanning does not extend this period.
- Verification grants: 10 minutes; pairing codes: 5 minutes; scan challenges: 2 minutes.
- Session and rate-counter data: expiry-based deletion.
- Legacy visits use `created_at + 30 days`; legacy photos are not face enrollments.

Expired enrollments are excluded from matching immediately. Bounded physical cleanup runs after successful check-ins and once per minute while a kiosk page is active. It deletes R2 photos before their metadata, retries failures, scans orphan uploads with a persisted cursor, and purges expired identity/session rows. Records may remain physically stored if the app is idle and no scheduler runs, or if storage fails.

For unattended cleanup, run `node ops/purge.mjs` hourly on a trusted scheduler with `MAKERSPACE_URL` and `MAINTENANCE_KEY` in its environment, and alert on nonzero exit. Scheduler configuration is NOT automatically provisioned by this source bundle. A private Sites deployment also requires the scheduler to satisfy Sites' outer access protection; the maintenance bearer token alone does not bypass that protection. For a standalone deployment, configure equivalent outer access or bind the scheduler directly to the app's protected origin. Do not make the whole app public to allow cleanup. Provider backups and service logs are outside this application's deletion scope.

These are configurable project defaults in `lib/security/retention.ts`, not a claim that TXST has approved a retention policy. Align them and the consent text with campus requirements before collecting student data.

## Live video recognition

Face check-in runs without a separate face server. The app includes `@vladmandic/face-api@1.7.15`, its browser runtime, Tiny Face Detector, 68-point landmarks, and the 128-value ResNet recognition model under `public/face-models`. Assets load from the same origin; no CDN or third-party face API receives the video. `provenance.json` records their checksums and the MIT license is included. Only face detection, landmarks, and recognition are loaded; no demographic or emotion inference runs.

After consent, the camera preview guides front → left/right turn → front. It requires one face, an adequate face size, two consecutive acceptable detections per pose, and consistent descriptors. The scan times out with a retry/manual fallback. Euclidean distance must be at most 0.50, with a runner-up gap of 0.08. These are prototype thresholds, not calibrated guarantees. Ordinary video motion checks are not certified liveness; recordings and modified clients can spoof attendance. This is not Apple Face ID and must not authorize physical access.

`FACE_ENABLED=true` enables the flow (the default if unset); `false` explicitly disables it. The hosted app is configured true. Camera access requires HTTPS or localhost. The first scan loads approximately 8 MB of static assets. Old photo-only registrations are not enrollments; opt in and scan once before using returning face check-in. Old SFace templates are incompatible and excluded from matching; any such enrollment must be removed before reenrolling with the new model. The unused Python prototype remains in `face-service/` for reference and is no longer called.

## Development and validation

See `START_HERE.md`. The project retains pnpm and its lockfile. D1 migrations are additive. Never rewrite an already-applied migration. Never rotate `DATA_ENCRYPTION_KEY` without a data migration or deliberate enrollment removal; existing templates need that key to decrypt.

Tests: `node tests/security.cjs` runs real route logic against isolated SQLite with an isolated storage boundary. `node tests/face-models.cjs` checks bundled asset integrity and loads/runs the actual recognition models on the CPU. Tests contain no student biometrics. iPad interaction and real-person recognition accuracy remain unvalidated.

The source includes `.dev.vars`, `.dev.vars.*`, `.env*`, legacy ONNX models, local credentials, and Python environments in `.gitignore` (with `.env.example` intentionally included). Ignore rules do not remove already committed secrets; rotate any credential that was previously published.
