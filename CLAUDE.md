# Permit Suite — CLAUDE.md
# Updated: June 8, 2026

## Architecture
6 Vite + React SPAs + 1 dedicated API service. Deployed separately on Vercel.
Each app is standalone and must remain functional independently.
Shared API is a separate Vercel project — apps call it by URL.

## Apps
- apps/house-value-predictor  — residential pricing (wired to API)
- apps/cre-evaluator          — land/commercial pricing
- apps/permit-submission      — bridges pricing → permit path
- apps/government-portal      — ISOLATED — own deployment, own Supabase
- apps/permit-assistant       — permit process guidance
- apps/lot-potential          — SB9/state zoning reform eligibility checker

## Deployment targets
- permit-suite-api (DEPLOYED) — https://vercel.com/domusai/permit-suite-api
- hvp.domusai.vercel.app          — house-value-predictor (not yet deployed)
- lot.domusai.vercel.app          — lot-potential (not yet deployed)
- permits.domusai.vercel.app      — permit-submission (not yet deployed)
- portal.domusai.vercel.app       — government portal (not yet deployed)
- assistant.domusai.vercel.app    — permit-assistant (not yet deployed)

## Architecture decisions confirmed
- Government portal fully isolatable (potential FedRAMP/self-host)
- Government portal NEVER imports from shared api/ — stays self-contained
- Supabase: shared users for private sector; gov portal gets own instance
- Permit-submission is same user journey as pricing apps (private sector)
- Pricing apps hand off to permit-submission via URL params
- API is a separate Vercel project — UI apps call it by URL
- UI layer is thin/swappable — all business logic server-side

## Auth + permissions model
- Supabase JWT — sent as Authorization: Bearer <token> on every API call
- New users get: role: "free", trial_ends_at: now + 30 days
- During trial: full pro access regardless of role field
- After trial: restricted to free tier limits
- Pro upgrade: Stripe webhook updates role to "pro" in user metadata
- Government portal: completely separate Supabase instance

## Subscription tiers
Free (post-trial):
  - price/lookup: 3/day
  - permit/opportunities: 2/day
  - lot/eligibility: 2/day
  - price/projection: 10/day
  - No PDF reports
  - Saved history: last 3 properties
Pro:
  - All endpoints unlimited
  - PDF reports
  - Unlimited saved history

## Supabase schema (app_data)
property_lookups  — address_key, address_display, last_sale_price,
                    last_sale_month, last_sale_year, sale_source,
                    looked_up_by, looked_up_at
property_permits  — address_key, permits (jsonb), fetched_at, fetched_by
api_usage         — user_id, endpoint, date, count (rate limiting)

## Supabase trigger
on_auth_user_created — sets role: "free", trial_ends_at: now + 30 days
                       on every new user signup

## API endpoints built
POST /api/price/lookup          — { address } → { price, month, year, source }
POST /api/price/projection      — { address, purchasePrice, purchaseMonth } → { metro, projection[] }
POST /api/permit/opportunities  — { address } → { permits, opportunities }
POST /api/lot/eligibility       — { address } → { isEligible, options[], disqualified[] }
POST /api/lot/options           — { address, stateCode, optionType } → { costModel, roi, process }
GET  /api/user/me               — → { id, email, role, inTrial, trialDaysLeft }
POST /api/stripe/webhook        — Stripe events → update user role
POST /api/auth                  — Supabase auth proxy (signup/login/logout)
POST /api/claude                — Anthropic API proxy

## Canonical api/ structure
api/
  anthropic.js        — Anthropic API proxy
  auth.js             — Supabase auth proxy
  claude.js           — Claude API proxy
  package.json        — type: module, node >= 18
  vercel.json         — Vercel Node.js deployment config
  middleware/
    auth.js           — JWT verify, role check, rate limiting
  price/
    lookup.js         — POST /api/price/lookup
    projection.js     — POST /api/price/projection
  permit/
    opportunities.js  — POST /api/permit/opportunities
  lot/
    eligibility.js    — POST /api/lot/eligibility
    options.js        — POST /api/lot/options
  user/
    me.js             — GET /api/user/me
  stripe/
    webhook.js        — POST /api/stripe/webhook

## Environment variables needed
### API service (permit-suite-api on Vercel)
ANTHROPIC_API_KEY     — Anthropic API key
SUPABASE_URL          — Supabase project URL
SUPABASE_KEY          — service role key (not anon key)
STRIPE_WEBHOOK_SECRET — add when Stripe is configured (not yet)

### Each UI app
VITE_API_URL          — https://permit-suite-api.vercel.app
VITE_SUPABASE_URL     — for direct auth calls
VITE_SUPABASE_KEY     — anon key only

## IN PROGRESS — next steps
1. Add env vars to permit-suite-api Vercel project:
   - ANTHROPIC_API_KEY
   - SUPABASE_URL
   - SUPABASE_KEY (service role)
2. Redeploy API with --prod after env vars set
3. Update house-value-predictor to call VITE_API_URL instead of /api/*
4. Deploy house-value-predictor as standalone Vercel project
5. Smoke test end-to-end with a real address
6. Delete dead client-side functions from house-value-predictor/App.jsx
7. Deploy lot-potential

## Next steps after smoke test passes
1. Build POST /api/permit/submit — private → gov portal
2. Build GET  /api/permit/status — gov → private
3. Wire permit-submission app to shared API
4. Add lot-potential handoff to house-value-predictor opportunity cards
5. Add Stripe checkout when ready to charge

## How to resume
Paste this entire file at the start of a new Claude conversation and say:
"Resume permit suite development — here is our CLAUDE.md context"
