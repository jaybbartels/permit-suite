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
9. Wired house-value-predictor App.jsx to use all 3 API endpoints
   - handleLookup → POST /api/price/lookup
   - handleSubmit → POST /api/permit/opportunities
   - projection   → POST /api/price/projection (useEffect + useState)

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
  notes:   geocodes via Nominatim, ZIP prefix fast-path
           75-mile proximity radius to nearest Case-Shiller metro
           all 20 metros supported, National fallback

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

## IN PROGRESS — house-value-predictor App.jsx wiring
STATUS: All 4 edits applied, NOT YET committed or tested
NEXT: commit, deploy to Vercel, smoke test with a real address
The old client-side functions (lookupLastSale, buildProjection,
fetchPermits, fetchPermitOpportunities) are still in App.jsx
but no longer called — can be deleted after testing confirms
the API endpoints work correctly end-to-end.

## Next steps (in order)
1. Commit App.jsx changes
2. Deploy to Vercel and smoke test with a real address
3. Delete now-unused client-side functions from App.jsx
4. Define 2-endpoint boundary between private sector and gov portal
   - POST /api/permit/submit  — private → gov
   - GET  /api/permit/status  — gov → private
5. Decide owner portal boundary (private sector vs gov side)

## How to resume
Paste this entire file at the start of a new Claude conversation and say:
"Resume permit suite development — here is our CLAUDE.md context"
