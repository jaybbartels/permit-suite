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

## Deployment status
- permit-suite-api    LIVE — https://permit-suite-api.vercel.app
- house-value-predictor — not yet deployed as standalone
- lot-potential         — not yet deployed
- permit-submission     — not yet deployed
- government-portal     — not yet deployed
- permit-assistant      — not yet deployed

## Verified working
- GET  /api/user/me               → 401 UNAUTHENTICATED (correct)
- POST /api/price/projection      → 401 UNAUTHENTICATED (correct)
- All auth middleware firing correctly

## Deploy command (from repo root)
vercel --prod --scope domusai
(links to permit-suite-api project)

## Architecture decisions confirmed
- Government portal fully isolatable (potential FedRAMP/self-host)
- Government portal NEVER imports from shared api/ — stays self-contained
- Supabase: shared users for private sector; gov portal gets own instance
- Permit-submission is same user journey as pricing apps (private sector)
- Pricing apps hand off to permit-submission via URL params
- API is a separate Vercel project — UI apps call it by URL
- UI layer is thin/swappable — all business logic server-side
- Deploy API from repo root (not from api/ subfolder)

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

## API endpoints (all at https://permit-suite-api.vercel.app)
POST /api/price/lookup          — { address } → { price, month, year, source }
POST /api/price/projection      — { address, purchasePrice, purchaseMonth } → { metro, projection[] }
POST /api/permit/opportunities  — { address } → { permits, opportunities }
POST /api/lot/eligibility       — { address } → { isEligible, options[], disqualified[] }
POST /api/lot/options           — { address, stateCode, optionType } → { costModel, roi, process }
GET  /api/user/me               — → { id, email, role, inTrial, trialDaysLeft }
POST /api/stripe/webhook        — Stripe events → update user role
POST /api/auth                  — Supabase auth proxy
POST /api/claude                — Anthropic API proxy

## Environment variables
### permit-suite-api (set on Vercel)
ANTHROPIC_API_KEY     ✓ set
SUPABASE_URL          ✓ set
SUPABASE_KEY          ✓ set (service role)
STRIPE_WEBHOOK_SECRET — add when Stripe is configured

### Each UI app (to be set when deployed)
VITE_API_URL          — https://permit-suite-api.vercel.app
VITE_SUPABASE_URL     — for direct auth calls
VITE_SUPABASE_KEY     — anon key only

## Next steps (in order)
1. Update house-value-predictor src/auth.js to call VITE_API_URL
2. Update house-value-predictor App.jsx to send JWT on all API calls
3. Add VITE_API_URL to house-value-predictor and deploy
4. Smoke test end-to-end with a real address and real login
5. Delete dead client-side functions from house-value-predictor/App.jsx
6. Deploy lot-potential
7. Build POST /api/permit/submit — private → gov portal boundary
8. Build GET  /api/permit/status — gov → private

## How to resume
Paste this entire file at the start of a new Claude conversation and say:
"Resume permit suite development — here is our CLAUDE.md context"
