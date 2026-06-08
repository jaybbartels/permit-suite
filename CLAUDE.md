# Permit Suite — CLAUDE.md
# Updated: June 8, 2026

## Architecture
6 Vite + React SPAs + 1 dedicated API service. Deployed separately on Vercel.
Shared API is a separate Vercel project — apps call it by URL.
UI layer is thin/swappable — all business logic server-side.

## Apps
- apps/house-value-predictor  — DEPLOYED hvp-app-gamma.vercel.app ✓
- apps/cre-evaluator          — not yet deployed
- apps/permit-submission      — not yet deployed
- apps/government-portal      — ISOLATED — not yet deployed
- apps/permit-assistant       — not yet deployed
- apps/lot-potential          — not yet deployed

## API Service
DEPLOYED: https://permit-suite-api.vercel.app

## Known limitations
- Price lookup: Zillow/Redfin encrypt web search snippets — AI can't always
  extract sale price. Manual entry works and saves to DB cache.
  Future fix: integrate Attom/RealtyMole/Rentcast API (~$50/mo)
- Permit lookup: same encrypted content issue — AI fallback works partially

## Auth + permissions
- Supabase JWT on every API call
- New users: role "free", trial_ends_at: now + 30 days
- During trial: full pro access
- After trial: free tier rate limits apply
- Pro: Stripe webhook upgrades role (not yet configured)

## Subscription tiers
Free: price/lookup 3/day, permit/opportunities 2/day,
      lot/eligibility 2/day, price/projection 10/day
Pro: unlimited, PDF reports, unlimited saved history

## Supabase schema (app_data)
property_lookups  — address_key, last_sale_price, last_sale_month,
                    last_sale_year, sale_source, looked_up_at
property_permits  — address_key, permits (jsonb), fetched_at
api_usage         — user_id, endpoint, date, count

## API endpoints (https://permit-suite-api.vercel.app)
POST /api/price/lookup          — AI waterfall sale price lookup + DB cache
POST /api/price/save            — Save manually entered price to DB
POST /api/price/projection      — 20 metro Case-Shiller projection
POST /api/permit/opportunities  — Permit history + opportunities + DB cache
POST /api/lot/eligibility       — SB9/state law eligibility check
POST /api/lot/options           — Cost model, ROI, permit steps
GET  /api/user/me               — Current user role + trial status
POST /api/auth                  — Supabase auth proxy
POST /api/stripe/webhook        — Stripe role updates (configured when ready)
POST /api/debug/lookup          — Raw Anthropic response (remove before launch)

## Deploy command (from repo root)
vercel --prod --scope domusai  (links to permit-suite-api)

## Environment variables on permit-suite-api
ANTHROPIC_API_KEY ✓
SUPABASE_URL      ✓
SUPABASE_KEY      ✓ (service role)

## house-value-predictor (hvp-app on Vercel)
URL: https://hvp-app-gamma.vercel.app
Env: VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_KEY ✓
Status: Working — login required, manual price entry saves to DB,
        projection works, permit lookup works

## Next steps (in order)
1. Audit cre-evaluator — what does it do, what needs changing
2. Audit permit-submission — understand the form flow
3. Audit permit-assistant — understand the guidance flow
4. Deploy lot-potential
5. Remove api/debug/lookup.js before any public launch
6. Add Stripe checkout when ready to charge
7. Consider real estate data API for reliable price lookup

## How to resume
Paste this entire file at the start of a new Claude conversation and say:
"Resume permit suite development — here is our CLAUDE.md context"
