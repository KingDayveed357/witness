// Drizzle table definitions mirroring migrations/*.sql (the SQL is the source of truth;
// integration tests exercise every table through these definitions, so drift fails loudly).

import { bigint, bigserial, boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  paypalMerchantId: text("paypal_merchant_id").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  principal: text("principal").notNull(),
  scopes: text("scopes").array().notNull(),
  keyHash: text("key_hash").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  revokedAt: ts("revoked_at"),
});

export const shoppers = pgTable("shoppers", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  displayName: text("display_name").notNull(),
  vaultId: text("vault_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const intents = pgTable("intents", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  shopperId: text("shopper_id").notNull(),
  lineageId: text("lineage_id").notNull(),
  version: integer("version").notNull(),
  status: text("status", { enum: ["DRAFT", "CONFIRMED", "REVOKED", "SUPERSEDED"] }).notNull(),
  sourceText: text("source_text"),
  policy: jsonb("policy").notNull(),
  policyDigest: text("policy_digest"),
  ambiguities: jsonb("ambiguities").notNull().default([]),
  compiler: jsonb("compiler"),
  createdAt: ts("created_at").notNull().defaultNow(),
  confirmedAt: ts("confirmed_at"),
  revokedAt: ts("revoked_at"),
});

export const purchases = pgTable("purchases", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  intentId: text("intent_id").notNull(),
  intentVersion: integer("intent_version").notNull(),
  policyDigest: text("policy_digest").notNull(),
  agentPrincipal: text("agent_principal").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  request: jsonb("request").notNull(),
  adapter: text("adapter").notNull().default("standard"),
  state: text("state").notNull(),
  version: integer("version").notNull().default(0),
  outcome: text("outcome"),
  reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
  retailer: text("retailer"),
  cart: jsonb("cart"),
  cartDigest: text("cart_digest"),
  facts: jsonb("facts"),
  amountCents: integer("amount_cents"),
  currency: text("currency"),
  paypalOrderId: text("paypal_order_id"),
  paypalAuthorizationId: text("paypal_authorization_id"),
  paypalCaptureId: text("paypal_capture_id"),
  authorizedAt: ts("authorized_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const checks = pgTable("checks", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  purchaseId: text("purchase_id").notNull(),
  phase: text("phase", { enum: ["SCREEN", "VERIFY", "RECHECK"] }).notNull(),
  checkId: text("check_id").notNull(),
  kind: text("kind", { enum: ["deterministic", "ai"] }).notNull(),
  result: text("result", { enum: ["pass", "fail", "unknown"] }).notNull(),
  detail: text("detail").notNull(),
  line: text("line"),
  model: text("model"),
  promptVersion: text("prompt_version"),
  /** Grounded evidence for AI checks (0003); null for deterministic checks. */
  evidence: jsonb("evidence"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const decisions = pgTable("decisions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  purchaseId: text("purchase_id").notNull(),
  outcome: text("outcome", { enum: ["REJECT", "HOLD", "CAPTURE", "VOID"] }).notNull(),
  reasons: jsonb("reasons").$type<string[]>().notNull(),
  decidedBy: text("decided_by").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  purchaseId: text("purchase_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  paypalOrderId: text("paypal_order_id").notNull(),
  paypalAuthorizationId: text("paypal_authorization_id").notNull(),
  payeeMerchantId: text("payee_merchant_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  cartDigest: text("cart_digest").notNull(),
  policyDigest: text("policy_digest").notNull(),
  intentVersion: integer("intent_version").notNull(),
  requestId: text("request_id").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const paypalCalls = pgTable("paypal_calls", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  purchaseId: text("purchase_id").notNull(),
  op: text("op", { enum: ["create-order", "capture", "void"] }).notNull(),
  requestId: text("request_id").notNull(),
  status: text("status", { enum: ["PENDING", "SUCCEEDED", "FAILED", "UNKNOWN"] }).notNull(),
  httpStatus: integer("http_status"),
  debugId: text("debug_id"),
  request: jsonb("request"),
  response: jsonb("response"),
  error: text("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const webhookEvents = pgTable("webhook_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  transmissionId: text("transmission_id"),
  verified: boolean("verified").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: ts("received_at").notNull().defaultNow(),
  processedAt: ts("processed_at"),
  outcome: text("outcome"),
});

export const holds = pgTable("holds", {
  purchaseId: text("purchase_id").primaryKey(),
  tokenHash: text("token_hash"),
  tokenExpiresAt: ts("token_expires_at"),
  autoVoidAt: ts("auto_void_at").notNull(),
  notifiedAt: ts("notified_at"),
  resolvedAt: ts("resolved_at"),
  resolution: text("resolution", { enum: ["APPROVED", "DENIED", "TIMEOUT", "REVOKED"] }),
});

export const auditLog = pgTable("audit_log", {
  epoch: integer("epoch").notNull(),
  seq: bigint("seq", { mode: "number" }).notNull(),
  tenantId: text("tenant_id"),
  purchaseId: text("purchase_id"),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  at: ts("at").notNull(),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
});
