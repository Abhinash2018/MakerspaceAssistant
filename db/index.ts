import { env } from "cloudflare:workers";
export function getDatabase() {
 if (!env.DB) throw new Error("Visit database unavailable");
 return env.DB;
}
export function getPhotos() {
 if (!env.BUCKET) throw new Error("Photo storage unavailable");
 return env.BUCKET;
}
