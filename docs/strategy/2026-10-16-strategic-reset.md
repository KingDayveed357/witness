# Strategic reset: what to build for the PayPal AI Hackathon 2026

Date: 2026-10-16 · Deadline: **Nov 12, 2026, 12:00 PT** (≈27 days; internal submit target Nov 10)
Labels used throughout: **[V]** verified from a primary source this session · **[C]** a competitor's own claim · **[I]** my inference · **[U]** unknown, needs a test.

---

## 1. Verified rules and prizes [V]

Sources: the [Devpost overview](https://paypalaihackathon.devpost.com/), [rules](https://paypalaihackathon.devpost.com/rules), [resources](https://paypalaihackathon.devpost.com/resources) and sponsor detail pages, all read on 2026-10-16.

**Dates**
- Submissions: Oct 1 – **Nov 12, 2026, 12:00 PT**.
- Judging: Dec 1–15.
- Winners: around Dec 21.
- 15,582 registered participants.
- The project gallery is **not published yet**, so other entries can't be seen there.

**Must have** (Stage One, pass/fail):
- Meaningful use of PayPal **and** AI ("Any AI tool works, as long as PayPal integration is central").
- A working build judges can run: a hosted URL or full setup instructions.
- A public open-source repository with a visible licence.
- A YouTube video **under 3 minutes**: "judges aren't required to watch past that".
- A text description, and a list of the tools used.
- An existing project is allowed if it was "significantly updated" during the period.

**Stage Two**: five **equally weighted** criteria, quoted from the rules:

| Criterion | Official question |
|---|---|
| Technological Implementation | "How thoroughly and skillfully does the project use PayPal Developer Platform and AI tool(s)? … working, non-trivial implementation?" |
| Design | "a complete, coherent product experience — not just a technical proof of concept?" |
| Potential Impact | "a credible, specific case for solving a real problem for a real audience — and does the solution actually address that problem based on what's demonstrated?" |
| Innovation/Idea | "How creative and novel is the concept and does the project differ from existing concepts?" |
| Presentation | "Does the video clearly demonstrate the project working end-to-end? … what problem is solved, who it's for, and why it matters?" |

**Tie-break**: the criteria in the order listed, so **Technological Implementation first**.

**Prizes** ($67.5k+):

| Prize | Amount |
|---|---|
| 1st / 2nd / 3rd | $12k / $8k / $5k |
| Most Creative, Most Impactful, Best Demo Delivery, Best Use of PayPal + AI, **Best Use of Agentic Commerce** | $5k each |
| AG Grid | $5k / $2k / 3 × $1k |
| APIMatic | 3 × $1k + 6 months business plan |
| Bryntum | 3 × $1k |
| Channel3 | $1.5k |
| Render | $1k / $750 / $500 credits |

**Stacking**: "A project can only win up to one (1) Grand Prize and one (1) Sponsor Prize OR one (1) Honorable Mention Prize and one (1) Sponsor Prize."

**AG Grid prize, quoted [V]**: "This award covers both what your dashboard looks like and how you build it. Show us polish: custom widgets, theming, and layout tools, not just AG Grid or AG Charts on their own. Take Studio Agent Framework for a spin: a custom agent talking to Studio's built-in agents, or a swapped-in harness."
- **The prize is about AG Studio (the embedded-analytics component), not the plain data grid.**
- A free 45-day trial licence is offered.
- AG's own idea list includes an anomaly-alert agent, a natural-language finance agent and an invoice nudge-bot. **[I]** Many entries will build exactly those.
- A judge from AG Grid is on the panel (Sylwia Vargas).

**Channel3 [V]**: the API or MCP server must be called "as a meaningful part of the product experience". 20,000 free credits.

**Render [V]**: deploy on Render; Render Workflows are highlighted.

**Judges [V]**: six from PayPal (developer advocates, engineers, a product manager), plus AG Grid, APIMatic, Bryntum, Channel3, Elastic, Postman and Render.
- **[I]** PayPal DevRel and engineers will spot shallow PayPal usage instantly. They reward correct, non-trivial API use and a clear story.

**PayPal context [V, secondary sources]**:
- PayPal announced *Agentic Commerce Services* in October 2025:
  - **Agent Ready**, for merchants to accept agent-initiated payments, rolling out in early 2026;
  - **Store Sync**, which pushes merchant catalogs to AI platforms (Perplexity, ChatGPT and others).
- PayPal was a launch partner of Google's **AP2** (Agent Payments Protocol), which uses Intent, Cart and Payment *mandates*.
- **[U]** Agent Ready's current rollout status, and AP2 support inside PayPal checkout.

---

## 2. Competitive landscape

### What I inspected

| Project | What it is | Evidence | Strength |
|---|---|---|---|
| **Bursar** ([demo](https://bursar-demo.onrender.com/), [repo](https://github.com/priyansh-narang2308/bursar)) | Spend control for AI agents: "Agents propose, a deterministic policy decides". 17 policy rules, a Vault token as the mandate, an authorization per mission, dual approval, a webhook that must explain every movement of money (unexplained → incident, mandate frozen), a "Gauntlet" of 27 prompt-injection payloads, replayable receipts, MCP gateway, Bryntum Gantt, AG Studio with "six custom widgets" plus an assistant, Render cron and Workflow | [V] landing page, repo metadata (created Oct 5, ~103 commits, 667 files, 89 test files, packages for policy, ledger, lab, mcp-gateway, schedule, render-workflow). [C] "2,200+ tests", "24 to 0" injection result. [V] **no dispute handling in the tree.** Video not watched | **Very strong.** Same thesis as Witness, wider sponsor coverage, a sharper story, and a live "simulated vs real" table |
| **Stood** ([site](https://ma-za-kpe.github.io/stood/), [repo](https://github.com/ma-za-kpe/stood)) | Evidence-gated release for code milestones: acceptance tests frozen up front, untrusted code judged in Vercel Sandbox, capture on release and void on refusal. Its companion Yard coordinates work and pays builders through PayPal Payouts. Kernel cloud-browser approvals; APIMatic SDK and portal | [V] README, repo (created Oct 3, ~306 commits, pushed today). [C] full live capture and void runs on Oct 12, Payouts qualified live | **Very strong**, and deep on APIMatic, Kernel, Render and Payouts. Owns "agents pay agents only when the work stands" |
| **Witness** (ours) | Buyer-side intent verification: screen the cart, authorize, three-way match, isolated executor | See §4 | Strong engineering, weak differentiation |

### Seen only in your Discord screenshots (not inspected; Discord needs phone verification)
- SarafuPay: "AI treasurer in WhatsApp".
- Unitus: a chama (rotating savings group).
- PKLM Sandbox.
- Acquit: "SaaS sold seats…".
- ShortWork: a freelance marketplace.
- **[U]** What any of them do in practice.

### Underlying problem categories, and how crowded each is [I]

| Category | Who | Crowding |
|---|---|---|
| A. **Payer-side agent spend control** (mandates, policy, approval) | Bursar, Witness. Externally: Visa Intelligent Commerce and Trusted Agent Protocol, Mastercard Agent Pay, AP2, PayPal itself, Payman, Skyfire | **Saturated.** Networks own the standard; Bursar owns the hackathon story |
| B. **Conditional release / escrow on evidence of work** | Stood. Externally: Upwork-style escrow | **Owned by Stood** |
| C. Consumer and community money tools (WhatsApp treasurer, chamas, splitting) | SarafuPay, Unitus, PayPal's own inspiration list | Crowded; AG Studio fit is weak |
| D. **Merchant-side operations for agent-initiated orders** (accept, refuse, evidence, disputes) | **No entry seen.** Externally: Riskified (AI Agent Intelligence, enterprise), Signifyd guidance, Chargeflow and Justt (generic dispute automation) | **Open in the hackathon.** Recognised problem, enterprise-only tools |
| E. Payment-ops reconciliation and exception investigation | Externally: A2X, Synder (accounting sync) | Moderate. AG Studio fit high, but AG's own idea list invites copies |
| F. Developer tooling for PayPal agent integrations | None seen | Narrow impact story |

**External evidence for D [secondary, treat as directional]**:
- No settled rule assigns liability for agent purchases. Vendors argue merchants pay by default.
  - [Justt](https://justt.ai/blog/ai-agent-chargeback-liability/)
  - [Chargeflow](https://www.chargeflow.io/blog/ai-agent-chargeback-liability)
- Riskified reports that agents strip the behavioural signals fraud rules rely on, causing false declines and missed fraud. It sells an enterprise "AI Agent Intelligence" dashboard.
  - [Riskified × HUMAN](https://www.businesswire.com/news/home/20250813021841/en/Riskified-Joins-Forces-with-HUMAN-to-Help-Merchants-Embrace-Trusted-AI-Shopping-Agent-Commerce)
- Signifyd-sourced guidance: merchants should "verify shopper approval, record the agent's allowed scope and preserve evidence that the order was genuinely authorised".
  - [NHI Mgmt summary](https://nhimg.org/articles/agentic-commerce-is-changing-checkout-risk-and-merchant-trust/)
- Visa's dispute-monitoring threshold reportedly tightened in 2026, from 2.2% to 1.5% in the US.
  - [U] Primary Visa source not checked.
- PayPal Agent Ready is aimed at exactly these merchants.
  - [Digital Commerce 360](https://www.digitalcommerce360.com/2025/10/28/paypal-agentic-commerce-ai-driven-shopping-services/)

---

## 3. What wins (my framework, mapped to the official criteria)

The official criteria are equally weighted. The weights below are **mine**, for choosing a direction, not the judges' weights.

| My criterion | Official criterion it feeds | Why it matters here |
|---|---|---|
| Novelty against visible entries | Innovation | Bursar and Stood occupy the two obvious "control money with AI" ideas |
| PayPal centrality and depth | Tech Implementation (the tie-breaker) | Six PayPal judges |
| A specific buyer with a budget line | Potential Impact | "real problem for a real audience … based on what's demonstrated" |
| An observable outcome in PayPal's own records | Impact, Presentation | Judges trust a state change they can check |
| Coherent product, not a console of features | Design | Bursar sets a high bar |
| Video clarity in under 3 minutes | Presentation, Best Demo Delivery | Hard cap |
| AG Studio central to the job | AG prize | Custom widgets plus the agent framework |
| Feasible in about 27 days, solo | Everything | An unfinished ambition scores below a finished focus |

**If two projects solve a similar problem, what convinces judges one is better?** Not more rules, tests, dashboards or AI. These things do:
1. **A different victim and a different money outcome.** If both protect the same party from the same loss, the better-executed one wins, and right now that's Bursar. Protecting a *different party*, from a loss the other can't even see, is a different product.
2. **A result that closes in PayPal's own record**, such as a dispute moving from *open* to *evidence submitted* to *resolved*, not just a green badge in your own UI.
3. **Evidence the other product structurally cannot produce.** A payer-side gate never holds the artefacts a merchant needs, and the reverse is also true.
4. **A judge can run an adversarial case themselves** and see it fail closed (Bursar does this with its Gauntlet).
5. **Alignment with a real standard** (AP2-style mandates) rather than a home-made format, so it reads as infrastructure for an emerging market, not a demo.
6. **An honest table of what's real and what's simulated.** Bursar has one; so must we.

---

## 4. Witness scorecard (as deployed on 2026-10-16)

**What it really does [V, from our own code and the live site]**:
- Screens an agent's cart against a confirmed intent, with rule-based checks plus Haiku checks for injection and listing integrity.
- On the real sandbox:
  - authorizes, runs the three-way match on PayPal's stored order, then captures or voids;
  - the executor is isolated and approvals are single-use;
  - the audit log is hash-chained.
- Judge page with 7 scenarios and "try to beat it".
- Phone hold approval.
- AG Studio console with a custom evidence-chain widget and custom Witness lead and analyst agents.
- Evals: 0 false captures on our own suites. Self-authored, as we have said.

**Not proven**:
- Disputes: never run against a real dispute.
- Docker compose: never run.
- The hosted Postman run: pending.

**Weak spots**:
- The live site shows "Loading counters…" for about 15 s on a cold start.
- The catalog is mostly fixtures (one product family: trail shoes).

**What a judge understands in 30 seconds**: "An AI agent buys shoes; it gets checked before payment." That is clear, but it is *Bursar's sentence*, and Bursar says it with more sponsors and a red-team demo.

| Score | Value | Reasoning |
|---|---|---|
| **Current product** | **58/100** | Tech 8/10 (real, correct, deep PayPal use). Design 6 (coherent, but scenario cards plus a console feel like a test bench). Impact 4 (real problem, but the buyer side will be owned by networks and wallets, and the demo is one synthetic shoe scenario). Innovation 3 (dominated by Bursar). Presentation, provisional 6 (no video yet) |
| **Remaining potential, as spend control** | **30/100** | Even perfect execution leaves it a lookalike of a stronger entry, judged on the same criteria |
| **Demo readiness** | **65/100** | Live and reproducible. Cold start, disputes unproven, video not made |
| **Commercial potential** | **30/100** | Who pays? Agent platforms will rely on PayPal, Visa and Mastercard mandates; consumers won't pay; a merchant gets nothing from a buyer-side gate |

**Why Witness loses as it stands**:
1. Same thesis as Bursar, which already has more breadth: Vault mandates, dual approval, incident freeze, MCP gateway, Bryntum, Render Workflows, a red-team lab.
2. The payer-side category is being standardised by the networks and PayPal (AP2, Trusted Agent Protocol, Agent Pay, Agent Ready). PayPal judges know the core is commoditising.
3. The demo shows one synthetic product family, so it reads as a test harness rather than a business.
4. The capability that would differentiate (dispute evidence) is the one thing not proven live.
5. AG Studio is a viewer *beside* the product, not where the work happens.

**What is valuable and reusable** (about 60–70% of the codebase) [V]:
- PayPal order, authorize, capture and void, with deterministic request IDs and an isolated executor;
- the three-way match against PayPal's stored order;
- signed webhook intake;
- the hash-chained audit log and evidence writer;
- dispute attach and submit (tested against a fake);
- AG Studio with a custom widget and custom agents, the web proxy, the Render Blueprint and Postman.

---

## 5. Opportunities (ranked)

Scores are 0–10 per dimension: novelty, PayPal relevance, AG Studio fit, demo impact, feasibility in 27 days, commercial potential, differentiation. The total is out of 100: the sum × 100/70, rounded.

| # | Product | One line | Nov | PP | AG | Demo | Feas | Comm | Diff | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Countersign** | Merchant desk for agent-initiated orders: accept only orders carrying a verifiable shopper mandate, and win disputes with that mandate as evidence | 8 | 9 | 8 | 8 | 6 | 7 | 9 | **79** |
| 2 | **Ledgerline** | Payment-ops investigator: reconciles PayPal transactions, refunds, fees and disputes against orders and books; AG Studio as the investigation workbench | 6 | 8 | 9 | 6 | 5 | 7 | 6 | **67** |
| 3 | Dispute Desk (generic) | AI dispute response for PayPal small merchants | 4 | 9 | 7 | 7 | 6 | 7 | 3 | **61** |
| 4 | Refund-abuse triage | Flags serial refunders and "item not received" abuse on PayPal orders before refunding | 5 | 7 | 7 | 5 | 6 | 6 | 5 | **59** |
| 5 | Subscription recovery agent | Rescues failed PayPal subscription renewals with segmented outreach and retries | 4 | 8 | 7 | 5 | 5 | 7 | 4 | **57** |
| 6 | A2A settlement | Two agents negotiate and settle through a PayPal authorization as escrow | 7 | 7 | 4 | 7 | 5 | 4 | 3 | **53** |
| 7 | Agent-payment flight recorder | Developer tool that replays agent payment flows against the sandbox and finds idempotency and webhook bugs | 6 | 8 | 4 | 4 | 7 | 4 | 7 | **57** |
| 8 | Payout guard for marketplaces | Checks a payout batch against work and fraud signals before PayPal Payouts | 5 | 8 | 7 | 5 | 6 | 6 | 3 | **57** |
| 9 | Witness, kept as spend control | (status quo) | 3 | 8 | 6 | 6 | 9 | 3 | 2 | **53** |
| 10 | Freelancer invoicing and nudges | Multi-currency invoices with friendly reminders | 2 | 8 | 7 | 5 | 8 | 5 | 1 | **51** |

Per-opportunity notes (buyer · evidence · alternatives · PayPal · AI · AG Studio · risk · edge):

1. **Countersign**: covered in §7–8.
2. **Ledgerline**
   - *Buyer*: finance and ops at merchants with roughly $1–50M on PayPal.
   - *Pain*: month-end mismatches between PayPal settlements, fees and refunds and the order system. Commercial tools prove demand (A2X, Synder).
   - *PayPal*: Transaction Search / Reporting API, Disputes, Refunds. **[U]** How the sandbox populates reporting data; it may be delayed or sparse.
   - *AI*: explains each discrepancy and proposes the matching rule.
   - *AG Studio*: a pivot of discrepancies by type and day; a master/detail trace widget; an agent that builds investigation widgets.
   - *Risk*: sandbox data realism, and AG's own idea list invites similar entries.
   - *Edge*: deep AG Studio use.
3. **Dispute Desk**: the market exists (Chargeflow, Justt), so it's weak on innovation. It's the fallback inside #1 if the mandate story doesn't land.
4. **Refund-abuse triage**: real pain, but it needs historical behaviour data that the sandbox can't make convincing.
5. **Subscription recovery**: real revenue, but sandbox failure states are hard to produce, and the idea is generic.
6. **A2A settlement**: trendy, but Stood owns "agents pay agents", and buyers are unclear.
7. **Flight recorder**: PayPal DevRel would like it. Impact and Design read narrow, and AG fit is weak.
8. **Payout guard**: overlaps Stood (payouts after release) and Bursar (spend policy).
9. **Witness as is**: see §4.
10. **Invoicing**: on AG's own idea list, so crowded by design.

None besides #1 clears 70. **#1 is the only option that is novel in this field, central to PayPal's current agentic-commerce bet, and mostly buildable from what we already have.**

---

## 6. Deep comparison of the top three

| | **Countersign** | **Ledgerline** | **Dispute Desk** |
|---|---|---|---|
| Against Bursar | Opposite side of the transaction. Bursar protects the payer's wallet and has no dispute handling [V]; Countersign protects the merchant's revenue | No overlap | No overlap |
| Against Stood | Stood gates *release of escrow for work*; Countersign gates *acceptance of a retail order* and defends it afterwards | No overlap | No overlap |
| Against external products | Riskified: enterprise fraud scoring of agent traffic, no mandate verification and no PayPal dispute loop. Chargeflow: generic disputes, no agent mandate. **[I]** Nobody joins the mandate to the dispute for PayPal small merchants | A2X and Synder: accounting sync, not investigation | Chargeflow does this commercially |
| Answer to a skeptical judge | "Every other entry protects the person whose agent spends. Nobody protects the merchant who gets the order and eats the chargeback. We verify the shopper's signed mandate at acceptance, and when PayPal opens a dispute we answer it with that mandate, in PayPal, on screen." | "We find the money your PayPal settlements and your books disagree on." Credible, but less novel | Weak against "Chargeflow exists" |
| PayPal APIs | Orders v2 (create, authorize, capture, void); Disputes v1 (list, show, provide-evidence, sandbox require-evidence and adjudicate); webhooks (`CUSTOMER.DISPUTE.CREATED/UPDATED/RESOLVED`, `PAYMENT.CAPTURE.*`); optionally Refunds | Reporting / Transaction Search, Disputes, Refunds | Disputes, webhooks |
| AI does | Reads the dispute reason and the buyer's message and maps them to the mandate clauses that answer them; drafts the evidence narrative with numbers filled in by code; flags orders whose items drift from the mandate's natural-language intent; powers the Studio analyst | Explains discrepancies | Drafts evidence |
| AG Studio | The **Agent Order Desk**: master/detail grid of agent orders (verdict, agent platform, mandate scope, PayPal state); a dispute queue sorted by PayPal's response deadline; a custom **Mandate ⇄ Order diff** widget; dispute exposure pivoted by agent platform; Studio agents ("which agent platform drives our disputes?" builds the widget) | Investigation workbench | Dispute queue |
| Hardest assumption | **[U] Sandbox disputes end to end**: a buyer opens a dispute, it reaches `provide_evidence`, the submission works, the sandbox adjudicates. Gate 4 was never passed | **[U]** Sandbox reporting data | Same as Countersign |
| Effort | About 60–70% reuse of Witness; around 15–18 build days | Mostly new; around 20+ days | About 12 days |
| Running cost | Haiku cents per dispute; existing Render services | Similar | Similar |

---

## 7. Decision

**Primary: Countersign. Reposition Witness to the merchant side and reuse its infrastructure.**

This is not a rename. It changes:
- **the buyer**: from the shopper and agent owner to the merchant;
- **the loss prevented**: from overspend to chargebacks, false declines and the dispute-ratio threshold;
- **the end of the demo**: from "we voided it" to "we won the dispute in PayPal";
- **the role of AG Studio**: from a viewer beside the product to the merchant's daily desk.

Witness's buyer-side gate survives as one internal step: checking an order against its mandate is the same machinery.

**Backup: Ledgerline**, if the sandbox dispute spike fails in a way we can't work around, since Countersign's climax depends on disputes. Witness kept as spend control is **not** a backup. If disputes fail *and* Ledgerline's reporting data is unusable, fall back to Countersign without the live dispute climax (acceptance, refusal and the evidence pack exported), and disclose it.

**Why it's hard to copy in the time left [I]**:
- It needs the whole chain working on real PayPal:
  - mandate verification at acceptance;
  - authorize, three-way match, capture;
  - signed webhooks;
  - the dispute lifecycle;
  - evidence built from a hash-chained record.
- We have most of that chain already; a competitor starting now doesn't.

**What would change my mind**:
1. The disputes spike shows the sandbox can't take a buyer-opened dispute through to evidence.
2. A visible entry turns out to already do merchant-side agent-order dispute defence.
3. PayPal judges signal that Agent Ready is out of scope or uninteresting (no evidence of that).

**Probability of competing strongly**:
- **Moderate**, for a sponsor prize (AG Grid) and one of the $5k category prizes (Agentic Commerce, PayPal + AI).
- **Low to moderate** for a top-3 grand prize. The field is large and Bursar and Stood are excellent.
- As spend control, I'd put Witness at **low** for anything beyond a sponsor prize.

---

## 8. Product definition: Countersign

**A. Thesis**
- **Tagline**: "Accept the agent's order. Win the dispute."
- **Customer**: small and mid-size PayPal merchants starting to receive orders from AI shopping agents (PayPal Agent Ready and Store Sync channels).
  - **Who pays**: the merchant's ops or owner, from the chargeback and fraud budget.
- **Problem**: an agent places the order, and the shopper later says "I never authorised that". The merchant has no proof of what the shopper delegated. Dispute forms assume a human clicked "buy", and fraud tools lose their behavioural signals.
- **Value proposition**: verify a shopper-signed mandate *before* accepting, bind it to the PayPal order, and answer disputes with that mandate automatically, after human approval.
- **Why now**: PayPal Agent Ready, AP2 mandates, and liability rules not yet settled.
- **Why PayPal**: PayPal is both the money rail and the dispute venue; one integration covers acceptance and defence.
- **Why AG Studio**: the merchant works a queue of orders and disputes all day. Grouping, pivots, deadline sorting, detail views and an analyst agent *are* the job, not decoration.
- **Why AI**:
  - maps a free-text dispute claim ("not what I asked for") to the specific mandate clauses that refute or concede it;
  - checks natural-language intent against item details;
  - drafts evidence with numbers filled in by code.
  - Rules alone can't read the buyer's claim.
- **Not a wrapper**: the core is a protocol, mandate → order binding → dispute evidence, with deterministic verification. AI handles only the language parts and can never accept an order.

**B. Core workflow** (with demo data)
1. **Agent platforms** (simulated, with keys we register: "ShopAgent", "PocketBuyer", "RogueBot") send orders to the merchant's Countersign endpoint. Each order carries an **intent mandate** (AP2-style, shopper-signed JWS: category, max amount, merchant, expiry) and a cart.
2. **Acceptance**: rule-based checks:
   - signature valid against a registered agent key;
   - shopper key bound to the mandate;
   - not expired;
   - amount and merchant within scope;
   - not replayed.

   Haiku then checks the cart lines against the mandate's natural-language intent (Witness's listing-integrity engine). Outcome: **accept** → create the PayPal order, authorize, three-way match, capture; **refuse** (no PayPal call); or **step up** (ask the shopper).
3. **Binding**: the mandate hash, cart hash and PayPal order and capture IDs go into the hash-chained record. The mandate hash is also written into PayPal's `custom_id` field, so the binding is visible in PayPal itself.
4. **Dispute**: the sandbox buyer opens one. The `CUSTOMER.DISPUTE.CREATED` webhook arrives and Countersign links it via the capture ID. Haiku classifies the claim against the mandate ("item not as described" vs "unauthorised"). Code assembles the evidence pack: the mandate's verified signature, scope, the cart diff, PayPal's order match and the timeline. The narrative is drafted with numbers filled in by code.
5. **Review**: the merchant sees the dispute at the top of the AG Studio queue, sorted by PayPal's response deadline, opens the Mandate ⇄ Order diff, edits and approves. Countersign calls `provide-evidence`.
6. **Outcome**: PayPal's dispute status changes, confirmed by a GET. The sandbox `adjudicate` result is labelled **simulated verdict**.
7. **Analytics**: the Studio analyst answers "Which agent platform causes our disputes, and how many did mandates win?" and builds the widget.

**C. The defensible technical point**
- The **mandate-to-dispute evidence loop**, bound to PayPal identifiers at acceptance time: the evidence exists *before* the dispute.
- **Acceptance itself is gated** on cryptographic delegation, not on behavioural fraud signals that agents remove.
- Most of the hard part is already working and tested in Witness:
  - money safety: executor isolation, three-way match, idempotency;
  - the audit chain;
  - the AG Studio custom agents.

**D. Architecture** (reuse first)
- **Keep**: the existing monorepo (Fastify API, isolated worker/executor, Postgres, pg-boss), the Next.js web app with its server-side key proxy, AG Studio, Render.
- **Add**:
  - `packages/mandate`: JWS verification with `jose`, an agent-key registry and a replay guard;
  - a merchant order-intake endpoint;
  - a dispute webhook handler that auto-links disputes;
  - dispute classification and an evidence builder (reusing the evidence writer);
  - an agent simulator script and page.
- **Data**: `agents` (platform, public key, status); `mandates` (hash, shopper key, scope JSON, expiry, verified_at); and links from `orders` and `purchases` to mandates. `disputes` already exists, extended in 0002.

**E. MVP boundaries**

| Must exist | Must be proven before the demo | May be simulated, disclosed | Never simulated | After the hackathon |
|---|---|---|---|---|
| Intake, mandate verification, accept/refuse/step-up, PayPal order lifecycle, dispute linking, evidence approve-and-submit, the AG Studio desk | **Gate 4**: a sandbox dispute through provide-evidence; webhooks arriving on Render | Agent platforms and their keys (our simulator); the shopper's signing device; the sandbox `adjudicate` verdict | PayPal calls and states; signature verification; amounts; dispute submission | Real AP2 / Agent Ready integration, multi-merchant, claims on other card networks |

**F. Product experience**
- **Primary screen**: the AG Studio **Agent Order Desk**. KPIs (accepted, refused, disputed, won, value protected), the dispute queue sorted by deadline, and the order grid.
- **The interaction that sells it**: click a disputed order. The custom **Mandate ⇄ Order** widget shows the signed scope beside what was bought and PayPal's stored order. Every line shows ✓ or ✗ with the evidence quote. Then **Approve evidence** sends it to PayPal, and the status changes in place.

**G. Business model [I]**
- A monthly subscription by order volume, plus a per-dispute fee. That mirrors Chargeflow's success-fee model, which shows merchants pay for dispute outcomes.
- **Deployment**: a hosted SaaS app connected with PayPal OAuth.
- **What brings merchants back**: daily dispute deadlines and the agent-channel analytics.
- No customer demand is claimed beyond the cited market signals.

---

## 9. The three-minute demo

| Time | What's shown |
|---|---|
| 0:00 | Problem in one sentence over a real Store Sync / Agent Ready headline: "Agents now buy from your store. When the shopper says 'I didn't authorise that', you lose the money and the fee." |
| 0:20 | Three agent orders arrive live: in-scope → **accepted** and captured (PayPal order shown); over scope → **refused** before PayPal; forged mandate → **refused** (signature) |
| 1:00 | Judge-testable: "edit the mandate amount and resend" fails verification |
| 1:15 | A dispute arrives by webhook on the captured order. It appears at the top of the desk with PayPal's deadline |
| 1:35 | Mandate ⇄ Order widget, AI claim classification, evidence draft (numbers from the record), **Approve** → PayPal provide-evidence → status checked by GET |
| 2:15 | Studio analyst builds "disputes and win rate by agent platform" |
| 2:40 | Real vs simulated table, and close |

---

## 10. Plan (milestones; only M0 blocks everything)

| # | Deliverable | Acceptance criteria | Test | Blocks |
|---|---|---|---|---|
| **M0** (Oct 17–19) | **Dispute feasibility spike**: a captured sandbox order, a buyer-opened dispute (Dave logs in as the sandbox buyer), `GET` shows it, webhook received on Render, `provide-evidence` accepted, `require-evidence` and `adjudicate` behaviour recorded | Every step confirmed by PayPal GET with debug IDs, written to `docs/evidence/gate4.md` | Live sandbox | **Yes.** Fail → Ledgerline spike |
| M1 (Oct 19–21) | Mandate format and verifier (`jose` JWS, AP2-inspired fields, agent registry, replay guard) | Valid accepted; tampered, expired, wrong merchant, replayed and unregistered all refused; fuzzing finds no crash | Unit tests on each failure path | Yes |
| M2 (Oct 21–24) | Order intake → accept/refuse/step-up → existing PayPal lifecycle, with the mandate hash bound in `custom_id` and the audit chain | Refused orders make 0 PayPal calls; accepted orders capture exactly the mandated cart | Database tests plus a sandbox run | Yes |
| M3 (Oct 24–27) | Dispute auto-link from webhook, AI claim classification, evidence builder, approve-and-submit | Webhook → linked dispute; evidence contains no model-written numbers; submitted once | Fake PayPal tests plus the M0 live path | Yes |
| M4 (Oct 27–31) | AG Studio Agent Order Desk, Mandate ⇄ Order widget, analyst prompts, theme | Desk opens fast; widget shows every clause; the agent answers with figures matching the grid | Headless browser checks | No |
| M5 (Oct 31–Nov 2) | Agent simulator page (judges send good, over-scope and forged orders) | A judge reproduces all three outcomes without setup | Browser check | No |
| M6 (Nov 2–5) | Hardening: warm-up for cold starts, error states, secrets review, hosted Postman, evals for claim classification | Hosted Postman green; no keys in the browser; cold-start screen | Postman, security review | No |
| M7 (Nov 5–9) | README, real-vs-simulated table, video under 3 minutes, rehearsal | Video shows the whole loop; a fresh person passes the test | Fresh-person run | Submission |

**Risk register**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sandbox disputes can't reach evidence | Medium | High | M0 first; fall back to the Ledgerline spike, or export the evidence pack |
| Judges read it as "Witness from the other side" | Medium | High | Lead with the merchant's loss and the dispute climax; never say "spend control" |
| Mandate format seen as home-made | Medium | Medium | Mirror AP2 field names; say "AP2-inspired, not certified" |
| AG Studio trial or licence lapses before judging | Medium | Medium | Ask AG on Discord now; trial mode still runs with a watermark (verified) |
| Render cold start in front of a judge | High | Medium | Warm-up ping and a loading state; the paid plan doesn't sleep (check the web plan) |
| Solo time overrun | Medium | High | Cut M5 polish before cutting M0–M3 |

**Cost-conscious development**
- Haiku only, behind the existing caps.
- Expected AI spend for the whole build is under $1 (current total is about $0.23).
- Reuse the Witness packages; no new paid services.
- Every task ends in a test or a recorded sandbox result.
- Strong-model time goes to M0 analysis, mandate security and the evidence-builder review.

---

## 11. Next five actions
1. **Dave decides**: Countersign as primary, with the M0 spike as the go/no-go.
2. **M0 spike**: I script the captured order and the polling; Dave opens the dispute as the sandbox buyer; we record each PayPal state.
3. Ask AG Grid on Discord about a licence covering Dec 1–15 (`AG_STUDIO_LICENSE_KEY`).
4. Check Agent Ready / AP2 documentation for mandate field names, so ours mirror the standard.
5. Freeze Witness: no more buyer-side features. Fix the cold-start counter state, since it's live now.
