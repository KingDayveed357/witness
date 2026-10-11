import type pg from "pg";
import type { PgBoss } from "pg-boss";
import { standardAdapter, swapAdapter, type CheckoutAdapter } from "@witness/core";
import type { CatalogSource } from "@witness/catalog";
import type { PayPalClient } from "@witness/paypal";

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };

export interface EngineDeps {
  pool: pg.Pool;
  boss: PgBoss;
  paypal: PayPalClient;
  catalog: CatalogSource;
  log?: Logger;
  now?: () => Date;
  /** How long an approval may wait for the executor before it expires (default 10 min). */
  approvalTtlMs?: number;
  /** HOLD auto-void delay after authorization (default 72 h, inside PayPal's 3-day honour period). */
  holdMs?: number;
  adapters?: Record<string, CheckoutAdapter>;
}

export interface Principal {
  tenantId: string;
  principal: string;
  scopes: string[];
}

/** Demo-only faulty adapters are registered by name; agents can never choose one (only the demo route can). */
export const DEFAULT_ADAPTERS: Record<string, CheckoutAdapter> = {
  standard: standardAdapter,
  "faulty:swap": swapAdapter({ sku: "TRL-WHT-10", name: "Ridgeline Trail Runner, Cloud White, US 10" }),
};

export const nowOf = (d: EngineDeps) => (d.now ?? (() => new Date()))();
export const logOf = (d: EngineDeps) => d.log ?? silentLogger;
