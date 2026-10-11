# 0005: Service topology: Next.js web, Fastify API, isolated executor worker

Status: **Accepted** (Dave, Checkpoint 2, 2026-10-11) 

## Context

The core invariant must be enforced by architecture. The validation audit showed the spike's gate was optional: `captureAuthorization()` could be called directly (finding T9b). The brief asked whether the API should be Next.js route handlers or a separate Node service, "considering that capture must be isolated from anything the agent can reach".

## Options

1. **One Next.js app** with route handlers for UI and API. Simplest, but capture code would share a public process and a bundle with UI code. Weak isolation story.
2. **Next.js (UI) + Fastify API + background worker (executor).** Capture/void exist only in the worker, which has no inbound port.
3. Same as 2, with the API also kept away from the PayPal secret (order creation delegated to the worker). Strongest, but adds a synchronous queue hop to every purchase.

## Decision (proposed)

Option 2, enforced by:
- `packages/executor` imported only by `apps/worker`, with a dependency-cruiser rule in CI;
- a branded `ConsumedApproval` type with no exported constructor;
- atomic DB consumption of the approval;
- a route-inventory test proving there's no capture/void route.

Fastify over Hono: mature OpenAPI generation from Zod (`@fastify/swagger` + a Zod type provider), lifecycle hooks for auth and idempotency, and Dave already knows Node. **Inference**: both would work.

## Consequences

- Three deployables (web, api, worker) plus Postgres. Render cost about $27/month (ADR-0008); a fallback merges API and worker into one service (about $20/month) at the cost of the "no inbound port" claim.
- The API still holds the PayPal secret for order creation and reads. A compromised API process could call PayPal directly. That falls under the honest limit about secret holders.
