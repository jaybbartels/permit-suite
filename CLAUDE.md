# Permit Suite — CLAUDE.md
# Updated: June 6, 2026

## Architecture
5 Vite + React SPAs in a monorepo (pnpm). Deployed separately on Vercel.
Each app is standalone and must remain functional independently.
Shared API layer is additive/optional — apps work without it.

## Apps
- apps/house-value-predictor  — residential pricing (most complete, audited)
- apps/cre-evaluator          — land/commercial pricing
- apps/permit-submission      — bridges pricing → permit path
- apps/government-portal      — ISOLATED — own deployment, own Supabase
- apps/permit-assistant       — permit process guidance

## Architecture decisions confirmed
- Government portal must remain fully isolatable (potential FedRAMP/self-host)
- Government portal NEVER imports from shared api/ — stays self-contained
- Supabase: shared users for private sector; gov portal gets its own instance
- Owner portals: boundary decision still pending (private vs gov side)

## Completed
1. Fixed ESM/CJS mismatch — all api/auth.js handlers now use export default
2. Centralized api/claude.js — deleted 4 per-app duplicates, root is canonical
3. Government portal kept its own api/claude.js for isolation
4. Added vite proxy (/api → localhost:3000) to 4 private sector apps
5. Added .gitignore for .DS_Store
6. Built POST /api/price/lookup
7. Built POST /api/permit/opportunities
8. Built POST /api/price/projection — all 20 Case-Shiller metros + geocoding

## API endpoints built
POST /api/price/lookup
  body:    { address }
  returns: { price, month, year, source }
  errors:  400 (no address), 404 (not found), 500

POST /api/permit/opportunities
  body:    { address }
  returns: { permits, opportunities, permitsSource, permitsFetchedAt }
  errors:  400 (no address), 500
  notes:   Supabase cache first (30-day TTL), live fetch if stale
           writes back to cache automatically

POST /api/price/projection
  body:    { address, purchasePrice, purchaseMonth }
           purchaseMonth format: "Jan-2015"
  returns: { metro, fredCode, color, projection[] }
           projection: [{ month, value, index, isForecast, isExtrapolated }]
  errors:  400 (missing/invalid params), 500
  notes:   geocodes address via Nominatim (free, no key)
           ZIP prefix fast-path before geocoding
           75-mile proximity radius to nearest Case-Shiller metro
           falls back to National (CSUSHPISA) if no metro match
           all 20 metros: SF, LA, SD, NY, Boston, DC, Miami, Tampa,
           Chicago, Minneapolis, Cleveland, Detroit, Atlanta, Charlotte,
           Dallas, Denver, Phoenix, Las Vegas, Portland, Seattle

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

## Supabase schema (app_data)
property_lookups  — address_key, address_display, last_sale_price,
                    last_sale_month, last_sale_year, sale_source,
                    looked_up_by, looked_up_at
property_permits  — address_key, permits (jsonb), fetched_at, fetched_by

## Code categories
BROWSER-ONLY (stays client-side):
  localStorage in src/auth.js, AuthModal component, Supabase db.js direct calls

## Next steps (in order)
1. Wire house-value-predictor App.jsx to call:
   - POST /api/price/lookup    instead of client-side lookupLastSale()
   - POST /api/price/projection instead of client-side buildProjection()
   - POST /api/permit/opportunities instead of client-side fetchPermits()
2. Define 2-endpoint boundary between private sector and gov portal
   - POST /api/permit/submit  — private → gov (new permit submission)
   - GET  /api/permit/status  — gov → private (status updates)
3. Decide owner portal boundary (private sector vs gov side)

## How to resume
Paste this entire file at the start of a new Claude conversation and say:
"Resume permit suite development — here is our CLAUDE.md context"
