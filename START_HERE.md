# Run the updated assistant

## 1. Kiosk app

Use Node.js 24 and the pnpm version in package.json. In the project directory:

    pnpm install --frozen-lockfile
    node ops/generate-local-secrets.mjs

The second command creates a private, ignored `.dev.vars`; it refuses to overwrite an existing file. Keep its encryption key stable. Add your OpenAI key there if you want generated RAG responses. Do not put real keys in `.env.example` or commit them.

    pnpm build
    pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_pale_ultimo.sql
    pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_far_reaper.sql
    pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_abandoned_eternity.sql
    pnpm dev

Run each migration once, in order. The commands above initialize a fresh local database; do not replay migration 0000 on an existing database. Open the localhost address printed by the terminal.

## 2. Open the kiosk

Open the app and touch Begin. Check in and Ask a question appear immediately; the browser starts its session automatically. No pairing or staff code is required. Staff check-in history and enrollment-removal controls are at `/staff` behind `STAFF_ACCESS_KEY`. On your staff device, open that address and use the existing key from your private setup file. You can filter by date, see saved photos, and download the displayed rows as CSV.

Students need no staff code: choose Check in, enter name and NetID, optionally take a photo and enroll for future face matching, then confirm. These details are self-reported. Home keeps only Check in and Ask a question; Check in with face is inside Check in.

## 3. Use face check-in

No Python server, face API key, or separate hosting is needed. Face recognition uses the bundled models in the browser. If upgrading an older local setup, change `FACE_ENABLED=false` to `FACE_ENABLED=true` in your ignored `.dev.vars`, preserve your existing encryption key, and restart. New generated configurations enable it by default.

First visit: Check in → name → NetID → select “Enable faster check-in next time” → allow camera → Start scan → follow the prompts → confirm. The photo is optional; skipping it still records the visit.

Returning visit: Check in → Check in with face. The camera opens and recognition starts automatically; follow the head-turn prompts. A recognized face records the visit without retyping details. Photo-only records from earlier versions need a fresh opt-in enrollment first.

Use HTTPS on the tablet and allow Safari camera access. Keep one face centered in good lighting. Models load on the first scan; later scans reuse them. If no confident match is found, retry or use the name/NetID flow.

## 4. Cleanup while offline

With MAKERSPACE_URL and MAINTENANCE_KEY supplied securely to a trusted scheduler, run:

    node ops/purge.mjs

Schedule hourly and monitor failures. This is in addition to active-kiosk cleanup. For a private Sites origin, the scheduler must also satisfy hosting-level authentication; see README.md. No scheduler is provisioned by these files.

## 5. Security tests

    node tests/security.cjs

    node tests/face-models.cjs

The source ZIP includes the browser face models and their license. It contains no student records or live credentials. iPad camera performance and real-user accuracy still require testing on the actual device.
