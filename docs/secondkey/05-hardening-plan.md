# Hardening milestone: execution order

Branch: `secondkey-feasibility-sprint`. Working tree at start: clean apart from Next's auto-generated `apps/web/next-env.d.ts`, which is left alone. No push or deploy.

| Order | Milestone | Why this order | Reversible? |
|---|---|---|---|
| 1 | **A. Transfer intents** ([ADR-0016](../decisions/0016-transfer-intents.md)) | Every later test (E2E, PayPal flows, UI) depends on the transfer having its own type; it removes a check-bypass stopgap | Yes: additive types, no DB migration, shopping path unchanged |
| 2 | **C. Trusted-contact security** | Small, isolated in `holds.ts`; fixes a documented inconsistency before more people touch the reviewer flow | Yes: config + logic, no schema change |
| 3 | **E. Reproducible E2E** (extends `secondkey/spikes/e2e/acceptance.ts`) | Re-proves A and C live, adds failure/retry cases | Read-only against the sandbox |
| 4 | **B. PayPal flow investigation** | Docs + live sandbox probes; needs the new personal sandbox account's email (not a secret) | Sandbox only |
| 5 | **D. Audio quality** | Needs the user's real Chrome and microphone; offline measurements can run any time | Yes |

Deliverables are written to `docs/secondkey/06-*.md` onward and summarised in `docs/secondkey/README.md`.
