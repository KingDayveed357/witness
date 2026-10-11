# Witness

**AI agents spend on PayPal only what the human actually asked for.**

Witness checks an agent-built cart against the buyer's intent and against the order PayPal actually authorized, then captures, holds or voids. See [BRIEF.md](BRIEF.md) for the product thesis.

> **Status: Phase 1, technical spikes.** This repo currently proves the PayPal mechanics the product depends on. The product (API, verifier, console) comes after the gates pass.

## Setup (10 minutes)

1. **Node 20.12 or newer.** No `npm install` needed: the spikes have zero dependencies.
2. **Sandbox app.** In the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/), open *Apps & Credentials → Sandbox* and create an app (or use the default one). Copy its client ID and secret.
3. **Enable Vault.** In the app's sandbox settings, under the payment features, make sure **Vault** is turned on. Spike 03 needs it.
4. **Find your sandbox buyer.** Under *Testing Tools → Sandbox Accounts*, note the **Personal** account's email and password. You log in as this buyer to approve payments.
5. **Configure:**
   ```bash
   cp .env.example .env   # then paste the client ID and secret
   npm test               # offline gate tests, should all pass
   ```

## Run the spikes in order

Each spike writes every PayPal request and response to `spikes/out/`, so a run leaves evidence you can show, not just console output.

| # | Command | What you do | Proves |
|---|---|---|---|
| 01 | `npm run spike:auth` | Nothing | Credentials work; lists scopes for orders, vault and disputes |
| 02 | `npm run spike:lifecycle` | Approve 2 orders as the buyer | **Gate 1:** capture and void on real authorizations; a voided authorization can't be captured |
| 03 | `npm run spike:vault` | Approve wallet saving once | **Gate 2:** authorization with the buyer *not present* |
| 04 | `npm run spike:swap` (add `-- --vault` if Gate 2 passed) | Approve 1 order (or none with `--vault`) | **Gate 3:** cart swap caught on PayPal's own order, then voided |
| 05 | `npm run spike:dispute -- create`, then `npm run spike:dispute -- next <id>` repeatedly | Wait a few minutes between `next` runs | **Gate 4:** dispute defended with Witness's record |

Approving: open the printed link, log in as the **sandbox Personal account**, and approve. The redirect page after approval doesn't need to load; the script polls PayPal and continues on its own.

### If something fails

Every failure prints PayPal's error, its debug ID, and the path of the saved response. Before concluding the API can't do something, check:

- **Configuration:** Vault enabled? Right app's credentials? Sandbox buyer used, not the business account?
- **Spike 03:** if AUTHORIZE fails it automatically runs a CAPTURE control with the same saved wallet. If the control also fails, it's configuration. If only AUTHORIZE fails, it's an API limitation, and BRIEF.md says what to do.
- **Spike 05 create:** a buyer transaction ID is required. The script tries the capture ID first; if PayPal rejects it, copy the transaction ID from the sandbox buyer's Activity page and pass `--buyer-txn <id>`. Or open the dispute by hand as the buyer at sandbox.paypal.com and use `list`.

## Record the results

Fill in the Gates table in [BRIEF.md](BRIEF.md). Keep `spikes/out/` locally (it's gitignored): those files are the evidence for the decision.

## Layout

```
spikes/
  lib/paypal.mjs     PayPal REST client: OAuth, idempotency keys, logs every call
  lib/orders.mjs     authorize -> capture | void helpers
  lib/gate.mjs       policy checks, cart digest, three-way match, capture invariant
  lib/catalog.mjs    fixture products and the trail-shoe policy
  01..05-*.mjs       the spikes
test/gate.test.mjs   offline tests for the gate (npm test)
BRIEF.md             product brief and gate results
```

## License

MIT
