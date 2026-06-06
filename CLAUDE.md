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

## What was completed this session
1. Fixed ESM/CJS mismatch — all api/auth.js handlers now use export default
2. Centralized api/claude.js — deleted 4 per-app duplicates, root is canonical
3. Government portal kept its own api/claude.js for isolation
4. Added vite proxy (/api → localhost:3000) to 4 private sector apps
5. Added .gitignore for .DS_Store
6. Built POST /api/price/lookup — first shared cross-app endpoint

## API endpoints built
POST /api/price/lookup
  body: { address: "123 Main St, City, ST 12345" }
  returns: { price, month, year, source }
  errors: 400 (no address), 404 (not found), 500 (server error)
  notes: runs full Zillow → Redfin → Realtor → AI waterfall server-side

## Canonical api/ structure
api/
  anthropic.js   — Anthropic API proxy (all private sector apps)
  auth.js        — Supabase auth proxy (all private sector apps)
  claude.js      — Claude API proxy (all private sector apps)
  price/
    lookup.js    — POST /api/price/lookup

## Code categories
PURE / API-ready:
  buildProjection(), fetchPermitOpportunities(), CATALOGUE data,
  parseZillowPage/Redfin/Realtor parsers (now in api/price/lookup.js)

BROWSER-ONLY (stays client-side):
  localStorage in src/auth.js, AuthModal component, Supabase db.js direct calls

## Next steps (in order)
1. Build POST /api/permit/opportunities — shared permit opportunities endpoint
2. Define 2-endpoint boundary between private sector and gov portal
   - POST /api/permit/submit  — private → gov
   - GET  /api/permit/status  — gov → private
3. Wire house-value-predictor to call /api/price/lookup instead of client-side
4. Decide owner portal boundary (private sector vs gov side)

## How to resume
Paste this entire file at the start of a new Claude conversation and say:
"Resume permit suite development — here is our CLAUDE.md context"
