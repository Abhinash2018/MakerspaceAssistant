declare namespace Cloudflare {
  interface Env {
    DB?: D1Database; BUCKET?: R2Bucket;
    OPENAI_API_KEY?: string; OPENAI_MODEL?: string;
    STAFF_ACCESS_KEY?: string; DATA_ENCRYPTION_KEY?: string; MAINTENANCE_KEY?: string;
    ALLOW_LOCAL_HTTP?: string;
    FACE_ENABLED?: string; FACE_SERVICE_URL?: string; FACE_SERVICE_KEY?: string;
  }
}
