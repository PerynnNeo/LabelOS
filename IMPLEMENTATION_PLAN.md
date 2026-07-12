# LabelOS — Implementation Plan

Turning the approved iOS UI into a coherent, functional, deployable MVP per
`LabelOS_Claude_Code_PROMPT.md`. **Do not redesign the UI. Adapt the existing
repo — do not rewrite.** Priorities (owner emphasis): **live garment analysis**
and **creating new designs (3 concepts)** must be genuinely functional.

Status legend: ✅ done · 🚧 in progress · ⬜ todo

## Already in place (from the initial build)

- ✅ Next.js 16 App Router, strict TS, Tailwind v4, Zod, Supabase, Anthropic SDK,
  Shopify provider, jose auth, sharp — installed and typechecking clean.
- ✅ Supabase migration (10 tables), repositories, storage, seed (Meridian, 15
  products with generated SVG→PNG assets, 3 suppliers, sample collection).
- ✅ Domain logic: category normaliser, deterministic outfit generator + heuristics,
  weighted score, Jaccard diversity, curation, costing, approvals, flat-sketch SVG.
- ✅ Anthropic layer: server client, structured outputs (+ Zod revalidation, retry,
  error taxonomy), vision, web-search trend research, 9 agent prompt modules,
  high-quality deterministic mock provider.
- ✅ Shopify: client-credentials token cache, typed GraphQL client, queries/mutations,
  provider + mock provider (stable `mock_` GIDs).
- ✅ API routes: catalog, analysis (single + batch), collections pipeline
  (trends → generate → critique → revise → curate → gap), designs (tech-pack,
  render, rfq, listing, shopify draft + publish), approvals, suppliers, integrations.
- ✅ iOS design foundation: globals.css tokens, tokens.ts helpers, BLUEPRINT.md,
  Instrument Serif. 🚧 iOS component kit + all screens (workflow in progress).

## Phase A — Unblock the two priority flows (live analysis + new designs)

- ✅ **Claude gating fix**: `getAnthropicProvider()` now returns the live provider
  whenever `ANTHROPIC_API_KEY` is set — DEMO_MODE no longer forces the mock
  (spec §1.4). Analysis/eval/revision/gap/concepts/spec/copy call real Claude
  when the key is present; mock otherwise.
- ⬜ **Verify live garment analysis end-to-end**: seed → analyse one product with a
  real key → confirm vision request, structured output, stored analysis, status
  transitions, and Activity entry. Confirm mock path with no key.
- ⬜ **New-design = THREE concepts** (spec §11.9, owner priority): concept-set Zod
  schema (3 distinct concepts, one AI-recommended); Product Designer agent + mock
  produce 3; gap route stores them; SVG front+back flat per concept; select one →
  generate draft specification for the selected concept. Rewire the
  Product-Development screen to the 3-card selector.

## Phase B — Coherence & truthfulness (one source of truth)

- ⬜ **Collection state machine**: detailed `workflow_status` enum + stage mapping +
  guarded transitions returning typed errors (spec §5). Central module; no
  hard-coded stage labels in components.
- ⬜ **Derived counts everywhere**: dashboard tiles, sidebar badges, action queue,
  pipeline metrics, catalog filters all derived from persisted state (counts sum
  to 15). Action queue only shows tasks valid for the current state.
- ⬜ **Human-approval gates & labels**: reserve "Approved" for the owner; AI uses
  "AI generated / shortlisted / recommended / Awaiting owner review". Keep every
  honesty label (AI concept — not production approved; Draft specification;
  Material is a visual inference; Demo supplier data — no supplier contacted).
- ⬜ **One dominant primary action per page**: next-action banner explains; sticky
  footer holds the state-specific primary button; no competing blue buttons; no
  generic "Continue" when a precise action exists.

## Phase C — Observability & remaining workflow depth

- ⬜ **agent_runs + activity_events**: persist an agent run before each Claude call;
  record model/tokens/duration/provider mode/safe error; Activity Log derives from
  these (owner view vs developer view). Serverless-safe: one bounded unit per
  request, idempotent.
- ⬜ **Sample cycle**: sample request (mock, no supplier contacted) → received →
  measurement review (spec vs sample vs tolerance, pass/fail) → owner approve /
  request revision. Production PO stays a locked draft preview.
- ⬜ **Supplier match score** with the exact documented weights (25/20/15/10/15/10/5),
  components visible; costing in integer cents (factory subtotal, landed
  commitment, deposit, gross margin) — never computed in a component or by Claude.
- ⬜ **Publication checklist** derived from data; each blocking item names the product
  and a repair action; publish requires typed confirmation + approval + publication.

## Phase D — Ship

- ⬜ Integration pass: `typecheck → test → build` green; fix cross-agent mismatches;
  drive the full mock workflow in the browser and fix what breaks.
- ⬜ Tests: state-transition units, counts-sum, costing/margin, mock-provider-makes-
  zero-fetch, approval-gate integration tests; one Playwright critical-flow test.
- ⬜ README (beginner) + `.env.example` refresh + BUILD_STATUS + Vercel notes.

## Deliberate MVP scoping / adaptations (documented, per §6 "adapt, don't rewrite")

- DB keeps `numeric` prices with a central `Intl.NumberFormat('en-SG')` formatter;
  cost/margin arithmetic uses integer-cents internally in `costing.ts` for exact
  math. (Full cents-column migration is deferred unless it proves necessary.)
- Auth stays the existing access-code + jose session (satisfies §16: public
  lookbook open, admin gated, live Shopify refused without a session).
- Suppliers/quotes are seeded + manually entered; RFQ text is drafted, never sent.
