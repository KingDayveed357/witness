# 0008: Production deployment on Render

Status: **Accepted** (Dave, Checkpoint 2, 2026-10-11) 

## Context

The rules require the project to be available "free of charge and without any restriction … until the Judging Period ends" (Dec 15, 2026, **Verified**). PayPal webhooks need a stable public HTTPS URL. Render gives hackathon participants $50 of credits (**Verified**, sponsor page).

Render free-tier facts (**Verified**, [render.com/docs/free](https://render.com/docs/free)):
- Free Postgres **expires 30 days after creation**.
- Free web services spin down after 15 minutes idle and take about 1 minute to wake.
- Background workers have no free tier.

## Options

1. Free tier. **Not viable**: the database would expire before judging, cold starts would hit judges, and webhooks would arrive at a sleeping service.
2. **Paid instances on the Hobby workspace ($0 + compute):** web (Next.js), api (Fastify), worker (background worker), Postgres. The price list shows $7/month as the lowest paid compute tier and $6/month as the lowest paid Postgres tier (**Verified** on [render.com/pricing](https://render.com/pricing); which instance each price maps to is **Inference**, to be confirmed at setup). Total ≈ **$27/month**.
3. Merge API and worker into one service: ≈ $20/month. Loses the "executor has no inbound port" property (ADR-0005).

## Decision (proposed)

Option 2, from a `render.yaml` Blueprint:
- **Services:** `witness-web` (web service), `witness-api` (web service, `/healthz` health check), `witness-worker` (background worker, runs pg-boss consumers, the reconciler cron and HOLD timeouts), `witness-db` (Postgres).
- **Environment groups:** `paypal` (client ID and secret: attached to api and worker only, **never web**), `ai` (api only), `channel3` (api only), `app` (shared non-secret config).
- **Webhooks:** register `https://witness-api…onrender.com/v1/webhooks/paypal` in the sandbox app for the events in `docs/spike-results.md`. Store `PAYPAL_WEBHOOK_ID` in the `paypal` group.
- **Data:** Drizzle migrations run as a pre-deploy command. The seed script creates the demo tenant, demo shopper (with the Gate 2 vault ID) and demo agent key.
- **Reset:** admin endpoint → job voids every open authorization (real PayPal calls), starts a new audit epoch and reseeds.
- **Local path for judges:** `docker-compose.yml` (Postgres + api + worker + web) with `.env.example`. Judges bring their own sandbox credentials.

Cost: about $27 × ~1.7 months (late Oct → Dec 15) ≈ **$46**, inside the $50 credit with little margin. Spend alerts on.

## Consequences

- No cold starts for judges or webhooks.
- If credits run short in December, the fallback is option 3 for the last weeks.
- The AG Studio trial is a separate availability risk (ADR-0009).
