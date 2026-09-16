import { env } from "cloudflare:workers";
const encoder = new TextEncoder();
export function randomToken(bytes = 32) {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))).map(x => x.toString(16).padStart(2, "0")).join("");
}
export async function constantEqual(a: string, b: string) {
  const left = await digest(a), right = await digest(b);
  let delta = 0; for (let i = 0; i < left.length; i++) delta |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return delta === 0;
}
function secret() {
  if (!env.DATA_ENCRYPTION_KEY || env.DATA_ENCRYPTION_KEY.length < 43) throw new Error("Data encryption is not configured");
  return env.DATA_ENCRYPTION_KEY;
}
async function key() {
  return crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", encoder.encode(secret())), "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function keyedHash(text: string) {
  const k = await crypto.subtle.importKey("raw", encoder.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, encoder.encode(text)))).map(x => x.toString(16).padStart(2, "0")).join("");
}
export async function seal(value: unknown, context: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(context) }, await key(), encoder.encode(JSON.stringify(value)));
  return JSON.stringify({ iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) });
}
export async function unseal<T>(text: string, context: string): Promise<T> {
  const { iv, data } = JSON.parse(text);
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv), additionalData: encoder.encode(context) }, await key(), new Uint8Array(data));
  return JSON.parse(new TextDecoder().decode(clear)) as T;
}
