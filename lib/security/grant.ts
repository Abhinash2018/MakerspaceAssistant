import { getDatabase } from "@/db";
import { HttpError } from "./auth";
import { unseal } from "./crypto";
import type { Identity } from "@/app/api/verification/route";
export async function verifiedIdentity(grantId: unknown, sessionId: string, visitId: string) {
  if (typeof grantId !== "string") throw new HttpError(403, "Staff verification is required.");
  const grant = await getDatabase().prepare("SELECT payload FROM verification_grants WHERE id = ? AND session_id = ? AND expires_at > ? AND (consumed_by IS NULL OR consumed_by = ?)")
    .bind(grantId, sessionId, Date.now(), visitId).first<{ payload: string }>();
  if (!grant) throw new HttpError(403, "Staff verification expired or was already used.");
  return unseal<Identity>(grant.payload, `grant:${grantId}`);
}
