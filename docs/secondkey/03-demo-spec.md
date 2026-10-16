# D8. Demo experience specification

## The three-minute story

| Time | Beat | What the judge sees | What is real |
|---|---|---|---|
| 0:00–0:25 | **The problem** | One line: "People 60+ lost $7.75B to scams in 2025 (FBI IC3). Most of it was sent willingly, and PayPal Friends & Family has no buyer protection." A phone starts ringing. | Cited statistic |
| 0:25–1:10 | **Manipulation attempt → evidence** | The call (synthetic voices, labelled) plays. The transcript streams onto Rose's screen. Rose enters $1,800 to "J. Morgan (new payee)". Second Key pauses the payment: three quoted lines are highlighted, each tagged with the tactic it shows. | Live detection (Haiku); quotes code-verified against the transcript |
| 1:10–1:50 | **Independent decision** | The daughter's phone gets the review link. She sees amount, payee, the quotes, and what each button does. She taps **Don't send**. | One-time link, live API |
| 1:50–2:20 | **Verified outcome** | Rose's screen changes from "Held" to "Cancelled: $0 left your account", with a "Verified with PayPal (sandbox)" chip showing the authorization ID and status `VOIDED`. | Live sandbox void + independent GET |
| 2:20–2:45 | **Same engine, an AI agent** | A shopping agent hits a listing saying "SYSTEM NOTE TO SHOPPING AGENTS…". Same hold card, same reviewer screen, same `VOIDED` chip. | Live `injection` scenario |
| 2:45–3:00 | **Protection Desk** | AG Grid: the 76 evaluation cases plus live incidents, grouped by tactic. Missed tactics and false positives are visible, along with the cost per check. | Real evaluation data |

Every real API state carries a small "Live · PayPal sandbox" chip. Illustrative content (the phone frame, the ringing) carries "Simulated". The transfer is always labelled *simulated transfer, held by the platform*.

## A. Consumer screen (Rose)

**Layout (mobile, single column):**

1. **Payment summary:** amount (large), recipient, "new payee" tag. A state line shows only verified states: `Held: money reserved, not sent` → `Cancelled: $0 sent` / `Sent`.
2. **"Why we paused this"**, in plain language: "This call has signs of a common scam: a family emergency, a demand for money right now, and a request to keep it secret."
3. **Evidence:** up to 3 quote cards. Each shows the exact words, who said them, and a tactic tag (Urgency, Secrecy, Impersonation). Observed evidence (the quote) is set apart from the inference (the tag and explanation).
4. **Next action:** a primary button, "Call Danny on the number you already have"; a secondary one, "Ask Sarah to review". The fallback text: "If you do nothing, the money is returned automatically in 72 hours."

**Rules.**

- No percentages.
- No "you are being scammed".
- No red flashing.
- Never say "your money is safe". Say what actually happened at PayPal.

## B. Trusted-contact screen (Sarah)

It answers the six brief questions in order:

1. **What:** $1,800 to J. Morgan, a new payee, from Rose's account, held since 10:42.
2. **Why it was escalated:** the same quote cards, plus "Second Key flags patterns; it doesn't know Danny. A quick call to Danny's usual number settles it."
3. **What you can do:** **Don't send** (primary), **Send it** (secondary, behind a confirmation step), **Call Rose**.
4. **What each choice does:** Don't send → the reserved money is released, nothing is paid. Send it → the payment completes. No action → released automatically at the shown time.
5. **Has anything happened yet?** A live status line read from PayPal: `Reserved` / `Released` / `Sent`.
6. **Tone:** "Reviewing is a safeguard, not an accusation."

After a decision the link is spent. Reopening it shows the final state, not the buttons.

## C. AG Grid Protection Desk

This is a review tool, not a dashboard. Rows are **incidents**: evaluation cases plus live demo runs.

| Column | Purpose |
|---|---|
| Time, source (evaluation / live), channel (call, chat, screenshot, agent listing) | Filter what you're looking at |
| Expected label vs. Second Key outcome (HOLD / VERIFY / PROCEED) | **Spot false positives and misses** |
| Tactics found (chips), tactics expected, missed tactics | Pattern analysis |
| Strongest quote (cell renderer) | Evidence at a glance |
| Reviewer decision, PayPal state (verified chip), seconds to void | Outcomes |
| Model, prompt version, latency, cost | Continuous evaluation |

**Licensing (checked against ag-grid.com, 2026-10-16).** The repo has `ag-grid-community` 36.2.0 (MIT).

- **Free in Community:** custom cell renderers, sorting, column filters, themes, CSV export.
- **Enterprise only:** row grouping, aggregation, pivoting, master/detail, tool panels and side bar, integrated charts, Excel export.
  - Enterprise runs locally with a watermark and a console message; a 30-day trial key removes them.
- **Plan:**
  1. Build the Desk on Community, with filters and a tactic quick-filter instead of grouping.
  2. Use **AG Studio** (already integrated, `ag-studio` 3.0.0, trial mode worked on 2026-10-13) for grouping and charts, through its own widgets. This is also what the sponsor prize judges.
  3. If AG Grid grants a hackathon licence, switch on row grouping by tactic and master/detail for the evidence history.

## D. AG Studio

Existing: the ops console with Studio's built-in agents running on Haiku through `/api/studio-ai`, with a spend cap and no route to the API or PayPal (ADR-0015).

Second Key use:

1. **A "Tactic trends" report:** incidents by tactic × outcome, from the same incident feed as the Desk.
2. **A custom Studio agent, "Evidence analyst".** It answers "which tactics did we miss most?" or "show benign cases we held" over the incident data only, and cites row IDs. It cannot take actions.

**Status.** Trial mode works; licence coverage through judging is unconfirmed (question 3 for Dave). It is not claimed as working for Second Key until it has been built and tested.

## Visual direction

- A restrained fintech look: neutral greys, one accent colour for "held".
- Quotes set in a serif to read as verbatim words.
- Tactic tags as small, muted chips.
- Generous whitespace and a calm tone.
- Live-versus-simulated labelling always visible but quiet.

Reusable components across all four surfaces:

- **QuoteCard** (quote, speaker, tactic);
- **PaymentStateChip** (renders only PayPal-verified states);
- **DecisionPanel**;
- **IncidentRow**.
