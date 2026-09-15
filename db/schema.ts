import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const visits = sqliteTable("visits", {
 id: text("id").primaryKey(),
 fullName: text("full_name").notNull(),
 netId: text("net_id").notNull(),
 photoKey: text("photo_key"),
 photoConsent: integer("photo_consent", { mode: "boolean" }).notNull(),
 consentVersion: text("consent_version").notNull(),
 createdAt: text("created_at").notNull(),
});
