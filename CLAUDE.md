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

## API endpoints built
POST /api/price/lookup
  body:    { address }
  returns: { price, month, year, source }
  errors:  400 (no address), 404 (not found), 500

POST /api/permit/opportunities
  body:    { address }
  returns: { permits, opportunities, permitsSource, permitsFetchedAt }
  errors:  400 (no address), 500
  notes:   checks Supabase cache first (30-day TTL)
           fetches live via Anthropic web search if stale/missing
           writes back to cache automatically
           runs opportunity catalogue filter against existing permits
           city-aware: San Francisco, Miami, National fallback

## Canonical api/ structure
api/
  anthropic.js        — Anthropic API proxy
  auth.js             — Supabase auth proxy
  claude.js           — Claude API proxy
  price/
    lookup.js         — POST /api/price/lookup
  permit/
    opportunities.js  — POST /api/permit/opportunities

## Supabase schema (app_data)
property_lookups  — address_key, address_display, last_sale_price,
                    last_sale_month, last_sale_year, sale_source,
                    looked_up_by, looked_up_at
property_permits  — address_key, permits (jsonb), fetched_at, fetched_by

## Code categories
PURE / API-ready:
  buildProjection() — still in house-value-predictor/src/App.jsx (not yet extracted)

BROWSER-ONLY (stays client-side):
  localStorage in src/auth.js, AuthModal component, Supabase db.js direct calls

## Next steps (in order)
1. Define 2-endpoint boundary between private sector and gov portal
   - POST /api/permit/submit  — private → gov (new permit submission)
   - GET  /api/permit/status  — gov → private (status updates)
2. Wire house-value-predictor to call /api/price/lookup instead of client-side
3. Wire house-value-predictor to call /api/permit/opportunities instead of client-side
4. Decide owner portal boundary (private sector vs gov side)
5. Extract buildProjection() to api/price/projection.js

## How to resume
Paste this entire file at the start of a new Claude conversation and say:
"Resume permit suite development — here is our CLAUDE.md context"
