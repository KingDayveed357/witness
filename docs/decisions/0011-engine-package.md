# 0011: The decision engine is a shared package; money movement is reachable only through the executor

Status: **Accepted** (implementation detail within ADR-0005; recorded for review at Checkpoint 3)

## Context

The "decide after authorization" step (verify PayPal's order, write the approval) is needed in two places: synchronously in the API, and in the worker when it recovers from a crash or timeout (a purchase left in AUTHORIZING or VERIFYING). If that logic lived inside `apps/api`, the worker would either duplicate it or import the API app.

## Decision

- `packages/engine`: screen → create/authorize order → verify → decide. It writes approvals and never captures or voids. Imported by the API and the worker.
- `packages/executor`: consume approval → capture or void → reconcile. Imported only by the worker. It is also the only route to the money-movement client: the worker gets it through `createMoneyMovementClient()` from the executor, never by importing `@witness/paypal/money-movement` itself.
- `packages/config`: environment parsing shared by both processes.

## Consequences

- The trust boundary is unchanged. The architecture checker flagged the worker's first draft (which imported money-movement directly), and that was fixed by routing it through the executor.
- The engine runs in two processes, so every step is idempotent and state-checked: each function returns early unless the purchase is still in the state it expects.
