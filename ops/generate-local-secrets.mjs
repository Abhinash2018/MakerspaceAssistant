import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
const token = () => randomBytes(32).toString("base64url");
const staff = token();
writeFileSync(".dev.vars", `STAFF_ACCESS_KEY=${staff}\nDATA_ENCRYPTION_KEY=${token()}\nMAINTENANCE_KEY=${token()}\nFACE_ENABLED=true\nALLOW_LOCAL_HTTP=true\nOPENAI_API_KEY=\nOPENAI_MODEL=gpt-4.1-mini\n`, { mode: 0o600, flag: "wx" });
console.log("Created ignored .dev.vars. Keep it private; do not overwrite an existing encryption key.");
