# Start here

This is the complete source of your Ingram Makerspace Assistant prototype.
Open the ingram-maker-assistant folder in VS Code. Read README.md for the
implemented behavior and current limitations.

## Main code

- app/page.tsx: touch-first interface, animated ring, voice captions, check-in,
  photo consent, camera preview, review, and session reset.
- app/globals.css: TXST maroon/gold theme and responsive tablet layout.
- app/api/ask/route.ts: server-side retrieval-augmented generation endpoint.
- lib/retrieval.ts: page-based lexical retrieval and document-excerpt fallback.
- data/knowledge.json: extracted content from all twelve supplied PDFs.
- app/api/checkin/route.ts: validated check-in and consented photo persistence.
- db/schema.ts and drizzle/: visit database schema and SQL migration.
- public/documents/: original PDFs used for citations.
- .env.example: server-side AI configuration template, with no API key.

## Run locally

Install Node.js 24 and pnpm using a terminal:

    npm install -g pnpm@11.25.0

Inside this project's folder:

    pnpm install --frozen-lockfile

Copy .env.example to .env. To enable generated answers, set OPENAI_API_KEY
in .env to your own key. OPENAI_MODEL defaults to gpt-4.1-mini. Leave the
key blank to use clearly labeled document excerpts. Never commit .env.

Build once to create the local Worker configuration:

    pnpm build

Initialize the local database using the included migration:

    pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_pale_ultimo.sql

Start development:

    pnpm dev

Open the localhost address printed by the terminal (normally port 5173).
Local D1 and R2 data stay on your computer; this does not download live
visitor records. The ZIP includes no student records, credentials,
node_modules, build output, or Git history.

## iPad and hosting

For the actual iPad, use the HTTPS hosted app. A plain HTTP address on your
computer's local network is not sufficient for camera access. Test camera
permissions and browser speech support on the physical iPad. Text entry
remains available when speech recognition is unavailable.

The original deployment uses Sites with Cloudflare Workers, D1, and R2.
It is not a static HTML-only application. The included .openai/hosting.json
identifies your existing Site; do not publish another person's fork against
that project. A separate host needs its own Worker, D1/R2 bindings, secrets,
and access controls. The original private site's access protection is not
part of an arbitrary standalone deployment.

The AI generation endpoint is implemented but the original deployment has
no API key yet. Check-in is self-reported; it does not verify TXST identity,
operate doors, or replace FOM. See README.md before campus deployment.
