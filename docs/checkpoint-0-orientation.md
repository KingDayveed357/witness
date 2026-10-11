# Checkpoint 0: Orientation

Date: 2026-10-11. Sources: the Devpost [overview](https://paypalaihackathon.devpost.com/), [rules](https://paypalaihackathon.devpost.com/rules), [resources](https://paypalaihackathon.devpost.com/resources) and sponsor pages ([AG Grid](https://paypalaihackathon.devpost.com/details/aggrid), [Channel3](https://paypalaihackathon.devpost.com/details/channel3), [Render](https://paypalaihackathon.devpost.com/details/render), [APIMatic](https://paypalaihackathon.devpost.com/details/apimatic), [Postman](https://paypalaihackathon.devpost.com/details/postman)), fetched today.

## The product as I understand it

Witness is a **capture gate** for merchant-of-record agent platforms on PayPal. The agent never holds PayPal credentials. Witness authorizes first (a real hold), then, before moving any money, checks three sources against each other: the human's confirmed, versioned intent; product facts it fetched itself; and the order PayPal actually stored. Then it captures an explicit amount, holds, or voids. Every decision leaves evidence tied to the PayPal transaction (intent digest in `custom_id`), and the same evidence can later defend a dispute. AI turns words into structure and judges fuzzy constraints. Deterministic code owns the money boundary. The cart-swap catch and the real-authorization HOLD are the parts nobody else has.

Stage 1 showed that the PayPal mechanics all hold, including **authorization with the buyer not present** (Gate 2). That second point matters for the demo, see point 5 below.

## Where I disagree with the brief, or want it sharper

1. **You can win only one sponsor prize.** Rules §8: *"A project can only win up to one (1) Grand Prize and one (1) Sponsor Prize OR one (1) Honorable Mention Prize and one (1) Sponsor Prize."* **Verified.** Chasing AG Grid, Channel3, Render and APIMatic at once spends effort on prizes we can't stack. Recommendation: target **AG Grid** (the biggest pool, and the console is real product). Use Channel3 because the verifier needs independent facts, Render because we need hosting, and Postman because it gives us tests. None of them for the logo.
2. **APIMatic's prize isn't about SDK generation.** Their page rewards using the **APIMatic Context Plugin for PayPal** inside your AI coding tool while building ("Participants who used the Context Plugin to build their PayPal integration…"). **Verified.** Generating SDKs from our OpenAPI spec is a fine stretch goal, but it isn't what that prize is for. **Postman has no prize** (**Verified**). Keep the collection for its value as tests and judge tooling.
3. **Render's prize points at Render Workflows** for background tasks (**Verified**, sponsor page). That's worth comparing against pg-boss for HOLD timers and dispute steps in the stack ADR. We can't win both Render and AG Grid, so it's a tie-breaker, not a driver.
4. **Hold off on authorizing obviously bad carts.** With a vault payment, PayPal authorizes **in the same call as order creation** (Gate 2 evidence). If Witness creates the order before checking intent, every VOID leaves a hold the buyer can see. Proposal: run the deterministic intent checks **before** creating the order (a rejected cart never touches PayPal), and keep the three-way match **before capture** for whatever slips through (swaps, tampering). It costs nothing, it shrinks the "honest limit", and it makes "$0 moved" literally true for policy violations.
5. **Judges shouldn't need a PayPal login.** The rules say testers may need "sandbox login details" in the README. Because Gate 2 passed, the hosted demo can use a pre-vaulted sandbox wallet, so judges press buttons and never type a PayPal password. Keep a "pay with your own sandbox buyer" path as optional.
6. **HOLD timing.** The brief says to auto-void before the 3-day honour period ends. PayPal also allows one **reauthorization** between days 4 and 29 (**Verified**, Payments v2 schema). Auto-void at about 72 hours is still the safest default for a demo. Reauthorizing is an option to mention, not to build.
7. **Scope versus three weeks.** Core engine + AI layer + agent + AG Studio console + Channel3 + disputes + Postman + Render, with evals, is a lot for one person. I'll propose a hard cut list at Checkpoint 2. My first candidates to cut: APIMatic SDKs, and dispute filing beyond a single scripted case.

## Rules that constrain us (all Verified on the rules page unless marked)

| Constraint | Detail |
|---|---|
| Submission period | Oct 1, 2026 9:15am PT → **Nov 12, 2026 12:00pm PT**. Nov 12 falls after US daylight saving ends, so that's 20:00 UTC = **21:00 Lagos** (Inference: time-zone arithmetic). |
| Judging | Dec 1–15, 2026. Winners around Dec 21. |
| **Availability** | *"The Entrant must make the Project available free of charge and without any restriction … until the Judging Period ends."* The hosted demo must stay up **through Dec 15**. That affects the Render plan, the AG Studio 45-day trial (not started yet; started around Oct 25 it ends around Dec 9, **before judging closes**; needs a fix, Unknown how; see ADR-0009) and the Channel3 credits. |
| Must use | PayPal developer platform (sandbox) **and** AI; *"PayPal integration is central to the project."* |
| Existing work | Allowed if *"significantly updated after the start of the Submission Period"*. Our spikes date from Oct 2026, so it's all in-period work. |
| Submission | Text description; a functional demo (hosted URL **or** complete run instructions); tools list; a **public** GitHub/GitLab/Bitbucket repo with an OSS licence detectable in the About section; a **YouTube** video under 3 minutes, publicly visible, showing it working, with no unlicensed third-party trademarks or music. |
| Judging stages | Stage 1: pass/fail on theme fit and API use. Stage 2: five **equally weighted** criteria (Technological Implementation, Design, Potential Impact, Innovation/Idea, Presentation). **Tie-break order follows that list, so Technological Implementation comes first.** Judging *"may utilize … automated AI-driven analysis"*, so README and docs clarity are scored, not just the video. |
| Eligibility | Age of majority; Nigeria is not on the excluded list (Inference: eligible). Projects must not have had financial support from PayPal or Devpost. |
| IP / open source | Entrant owns the IP; open-source components are fine if licences are respected and we build on top of them. The AG Studio licence terms for a public repo need checking (**Unknown**). |
| Third-party | Must be authorized to use every API and data source. The Channel3 promo code `PAYPAL-HACKATHON-2026` gives 20k credits (**Verified**, sponsor page). |
