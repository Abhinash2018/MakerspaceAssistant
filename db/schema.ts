import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const visits = sqliteTable("visits", {
  id: text("id").primaryKey(), fullName: text("full_name").notNull(), netId: text("net_id").notNull(),
  photoKey: text("photo_key"), photoConsent: integer("photo_consent", { mode: "boolean" }).notNull(),
  consentVersion: text("consent_version").notNull(), createdAt: text("created_at").notNull(),
  expiresAt: integer("expires_at").notNull().default(0), sessionId: text("session_id"),
  method: text("method").notNull().default("legacy-unverified"), profileId: text("profile_id"),
}, t => [index("idx_visits_expiry").on(t.expiresAt), index("idx_visits_time_id").on(t.createdAt, t.id), index("idx_visits_profile_time").on(t.profileId, t.createdAt)]);
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), role: text("role").notNull(), csrf: text("csrf").notNull(), expiresAt: integer("expires_at").notNull(),
}, t => [index("idx_sessions_expiry").on(t.expiresAt)]);
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(), expiresAt: integer("expires_at").notNull(),
}, t => [index("idx_rate_expiry").on(t.expiresAt)]);
export const pairingCodes = sqliteTable("pairing_codes", {
  hash: text("hash").primaryKey(), expiresAt: integer("expires_at").notNull(),
});
export const grants = sqliteTable("verification_grants", {
  id: text("id").primaryKey(), codeHash: text("code_hash").notNull().unique(), payload: text("payload").notNull(),
  expiresAt: integer("expires_at").notNull(), sessionId: text("session_id"), consumedBy: text("consumed_by"),
});
export const profiles = sqliteTable("face_profiles", {
  id: text("id").primaryKey(), netIdHash: text("net_id_hash").notNull().unique(), payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(), consentVersion: text("consent_version").notNull(),
}, t => [index("idx_profiles_expiry").on(t.expiresAt)]);
export const challenges = sqliteTable("face_challenges", {
  id: text("id").primaryKey(), sessionId: text("session_id").notNull(), purpose: text("purpose").notNull(),
  direction: text("direction").notNull(), expiresAt: integer("expires_at").notNull(), usedBy: text("used_by"), bodyHash: text("body_hash"),
});
export const cleanupState = sqliteTable("cleanup_state", {
  id: integer("id").primaryKey(), lastSuccessAt: integer("last_success_at").notNull(), objectCursor: text("object_cursor"),
});
