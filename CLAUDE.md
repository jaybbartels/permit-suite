# Permit Suite — CLAUDE.md
# Updated: June 6, 2026

## Architecture
6 Vite + React SPAs in a monorepo (pnpm). Deployed separately on Vercel.
Each app is standalone and must remain functional independently.
Shared API layer is additive/optional — apps work without it.

## Apps
- apps/house-value-predictor  — residential pricing (audited + wired to API)
- apps/cre-evaluator          — land/commercial pricing
- apps/permit-submission      — bridges pricing → permit path
- apps/government-portal      — ISOLATED — own deployment, own Supabase
- apps/permit-assistant       — permit process guidance
- apps/lot-potential          — SB9/state zoning reform eligibility checker

## Architecture decisions confirmed
- Government portal must remain fully isolatable (potential FedRAMP/self-host)
- Government portal NEVER imports from shared api/ — stays self-contained
- Supabase: shared users for private sector; gov portal gets its own instance
- Owner portals: boundary decision still pending (private vs gov side)
- Permit-submission is same user journey as pricing apps (not gov side)
- Pricing apps hand off to permit-submission via URL params:
  /permit-submission?address=...&type=...&estimatedValue=...&fromApp=...

## Completed
1.  Fixed ESM/CJS mismatch — all api/auth.js handlers now use export default
2.  Centralized api/claude.js — deleted 4 per-app duplicates, root is canonical
3.  Government portal kept its own api/claude.js for isolation
4.  Added vite proxy (/api → localhost:3000) to 4 private sector apps
5.  Added .gitignore for .DS_Store
6.  Built POST /api/price/lookup
7.  Built POST /api/permit/opportunities
8.  Built POST /api/price/projection — all 20 Case-Shiller metros + geocoding
9.  Wired house-value-predictor App.jsx to use all 3 API endpoints
10. Scaffolded apps/lot-potential
11. Built POST /api/lot/eligibility — state law db, AI property check, options
12. Built POST /api/lot/options — cost models, ROI, rental income, permit steps
13. Built lot-potential React UI

## API endpoints built
POST /api/price/lookup
  body:    { address }
  returns: { price, month, year, source }

POST /api/permit/opportunities
  body:    { address }
  returns: { permits, opportunities, permitsSource, permitsFetchedAt }
  notes:   Supabase cache first (30-day TTL), live fetch if stale

POST /api/price/projection
  body:    { address, purchasePrice, purchaseMonth }
  returns: { metro, fredCode, color, projection[] }
  notes:   all 20 Case-Shiller metros, Nominatim geocoding, ZIP fast-path

POST /api/lot/eligibility
  body:    { address }
  returns: { stateCode, hasReformLaw, stateLaw, isEligible,
             disqualified[], options[], propertyData, coords }
  notes:   9 states covered: CA, OR, WA, MT, VT, ME, CO, RI, CT
           AI web search checks historic/fire/flood/HOA/zoning
           approval likelihood fetched per option

POST /api/lot/options
  body:    { address, stateCode, optionType, stateLawName, currentValue }
  returns: { costModel, rentalRates, roi, process }
  notes:   cost breakdown by state, ROI model, rental income estimate
           local permit steps via AI with fallback

## Canonical api/ structure
api/
  anthropic.js        — Anthropic API proxy
  auth.js             — Supabase auth proxy
  claude.js           — Claude API proxy
  price/
    lookup.js         — POST /api/price/lookup
    projection.js     — POST /api/price/projection
  permit/
    opportunities.js  — POST /api/permit/opportunities
  lot/
    eligibility.js    — POST /api/lot/eligibility
    options.js        — POST /api/lot/options

## Supabase schema (app_data)
property_lookups  — address_key, address_display, last_sale_price,
                    last_sale_month, last_sale_year, sale_source,
                    looked_up_by, looked_up_at
property_permits  — address_key, permits (jsonb), fetched_at, fetched_by

## IN PROGRESS — needs testing
- house-value-predictor App.jsx wired to API endpoints (not yet smoke tested)
- lot-potential full app (not yet deployed to Vercel)
- Dead client-side functions still in house-value-predictor/src/App.jsx
  (lookupLastSale, buildProjection, fetchPermits, fetchPermitOpportunities)
  — safe to delete after smoke test confirms endpoints work

## Next steps (in order)
1. Deploy house-value-predictor to Vercel and smoke test
2. Deploy lot-potential to Vercel
3. Delete dead client-side functions from house-value-predictor/App.jsx
4. Build POST /api/permit/submit — private sector → gov portal boundary
5. Build GET  /api/permit/status — gov portal → private sector
6. Wire permit-submission app to use shared API endpoints
7. Add lot-potential handoff URL to house-value-predictor opportunity cards

## How to resume
Paste this entire file at the start of a new Claude conversation and say:
"Resume permit suite development — here is our CLAUDE.md context"
