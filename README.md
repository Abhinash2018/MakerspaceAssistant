# Ingram Makerspace Assistant

Private iPad-oriented entrance kiosk for Texas State University. The home screen is silent until touched. Check-in collects a name and NetID, asks explicit permission for an optional still photo, shows a preview, and saves only after confirmation. A visitor can decline the photo. Speech input is optional, transcribed live and reviewed before submission. Every spoken assistant response is captioned. Camera and microphone stop when leaving the session; inactive sessions clear after two minutes, and backgrounding clears the session immediately.

## Knowledge system

Twelve supplied PDFs are indexed by document and page in `data/knowledge.json`. Retrieval uses BM25-style lexical scoring and limited query expansion; it does not require an embedding service. The server passes retrieved passages to the model, validates the response shape, and links the supporting PDF pages. Only the user's question and document passages go to the language model, never registration details or photos. No conversations or raw audio are saved by this app. Browser speech recognition may use the browser vendor's speech service.

Set the server-only `OPENAI_API_KEY` secret through Sites to enable retrieval-augmented generation. Optional `OPENAI_MODEL` defaults to `gpt-4.1-mini`. Without a key, the application explicitly labels its response as a document excerpt. This mode is functional retrieval, not generated AI. Do not put keys in client code.

Original PDFs live in `public/documents`. Scanned FOM pages are OCR-derived and may contain errors. Rate documents describe Spring 2026, not guaranteed current prices. Figures and screenshot-only controls in other manuals are not a substitute for opening the cited PDF; never treat a retrieved excerpt as a complete equipment procedure.

## Data

D1 `DB` holds visits (name, NetID, visit timestamp, consent version, optional photo key). Private R2 `BUCKET` holds JPEG photos. The browser cannot list or retrieve registrations or photos. There is no facial recognition, matching, face embedding, continuous video recording, occupancy inference, or door-control integration. Check-in names and NetIDs are self-reported, not verified against TXST SSO. Existing TXST ID, release forms, and FOM requirements remain in effect. Check-ins cannot tell who is currently inside without an exit/access integration.

API routes have no authentication or rate limiting implemented in the app code; they rely on hosting-level protections and access controls. Student names, NetIDs, and uploaded photos have no automatic deletion policy implemented in this review build. NetIDs are self-reported, not verified. The app is deployed owner-private for review. Do not expose an owner account on an unattended public kiosk. Campus rollout needs a dedicated restricted kiosk authentication arrangement, approved data access/retention and photo-consent wording, and the required university access-system integration. These are not configured in this review deployment. There is intentionally no public student directory or admin dashboard.

## Development

Use the existing pnpm lockfile. `pnpm build` builds the Cloudflare Worker. `pnpm db:generate` creates append-only D1 schema migrations. Hosted bindings are declared in `.openai/hosting.json`; credentials are server secrets. Browser camera requires HTTPS and explicit device permission. iPad speech input depends on browser and device support; text input always remains available. Verify speech, permission prompts, orientation, and camera capture on the physical kiosk iPad before installation.
