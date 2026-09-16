// Run hourly on a trusted scheduler. Credentials belong in environment variables.
const origin = process.env.MAKERSPACE_URL;
const key = process.env.MAINTENANCE_KEY;
if (!origin?.startsWith("https://") || !key || key.length < 32) throw new Error("Configure MAKERSPACE_URL and MAINTENANCE_KEY");
for (let page = 0; page < 50; page++) {
  const res = await fetch(new URL("/api/maintenance", origin), { method: "POST", headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000), redirect: "error" });
  if (!res.ok) throw new Error(`Cleanup failed (${res.status}); do not ignore scheduler alerts`);
  const data = await res.json(); if (!data.more) break;
  if (page === 49) throw new Error("Cleanup backlog exceeds batch limit; schedule another run");
}
