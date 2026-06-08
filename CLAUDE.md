# Permit Suite — CLAUDE.md
# Updated: June 8, 2026

## All Deployed Apps
- 🏠 House Value Predictor  — https://hvp-app-gamma.vercel.app
- 🏗️  CRE Evaluator         — https://cre-app-pi.vercel.app
- 📋 Permit Submission      — https://permit-submission.vercel.app
- 🔍 Lot Potential (SB9)    — https://lot-potential.vercel.app
- 🏛️  Government Portal      — https://government-portal-virid.vercel.app
- ⚙️  API Service            — https://permit-suite-api.vercel.app

## Demo Users
- Property owner:  permit@domusai.com  / (password set in Supabase)
- Gov reviewer:    gov@domusai.com     / govdemo2026
- Dev/admin:       jbartels@map65.com  / trinity

## Architecture
6 Vite + React SPAs + 1 dedicated API service. Deployed separately on Vercel.
Shared API is a separate Vercel project — apps call it by URL.
UI layer is thin/swappable — all business logic server-side.

## Auth
- Private sector apps (hvp, cre, permit-submission, lot-potential):
  use hvp_session in localStorage — shared session across apps
- Government portal: uses gov_session — isolated from private sector
- All apps authenticate via https://permit-suite-api.vercel.app/api/auth

## Subscription tiers
Free (post 30-day trial):
  - price/lookup: 3/day
  - permit/opportunities: 2/day
  - lot/eligibility: 2/day
  - price/projection: 10/day
Pro: unlimited + PDF reports

## Supabase schema (app_data)
property_lookups    — sale price cache
property_permits    — permit history cache
api_usage           — rate limiting
permit_applications — submitted permits (shared between submit + gov portal)
permit_documents    — uploaded files
permit_comments     — gov worker notes on applications
ai_reviews          — AI pre-screening results
user_profiles       — role + city assignment
code_lookups        — NOT YET CREATED (future)
property_history    — NOT YET CREATED (future)

## API endpoints (https://permit-suite-api.vercel.app)
POST /api/price/lookup          — AI sale price lookup + DB cache
POST /api/price/save            — Save manually entered price
POST /api/price/projection      — 20 metro Case-Shiller projection
POST /api/permit/opportunities  — Permit history + opportunities
POST /api/lot/eligibility       — SB9/state law eligibility
POST /api/lot/options           — Cost model, ROI, permit steps
GET  /api/user/me               — Current user role + trial status
POST /api/auth                  — Supabase auth proxy
POST /api/stripe/webhook        — Stripe role updates (not yet configured)
POST /api/debug/lookup          — REMOVE BEFORE PUBLIC LAUNCH

## Environment variables (all Vercel projects)
ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY (service role) — API service
VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_KEY (anon) — all UI apps

## Known limitations
- Price lookup: Zillow/Redfin encrypt snippets — AI extraction unreliable
  Fix: integrate Attom/RealtyMole/Rentcast API (~$50/mo)
- Permit lookup: same issue — AI fallback works partially

## Government portal — future integration work
### Phase 1 (done — works today)
- Permit queue from permit_applications table
- AI review of applications
- Comments on applications
- Gov worker profiles + city assignment

### Phase 2 — city/county system integration
- property_history table + integration with city permit APIs
  (SF: data.sfgov.org, Chicago: data.cityofchicago.org, NYC: nyc.gov/dob)
- code_lookups table + building code research automation
- Real permit submission routing to actual city portals
- Official permit number assignment from city systems
- Status sync back from city systems to owner portal

### Phase 3 — production hardening
- Government portal gets its own Supabase instance (data isolation)
- Role-based access: only government_reviewer role can access portal
- Audit logging for all status changes
- FedRAMP compliance review if required

## Permit-assistant app
NOT YET AUDITED OR DEPLOYED
Located at apps/permit-assistant/

## Next steps
1. Audit + deploy permit-assistant
2. Remove api/debug/lookup.js before public launch
3. Add Stripe checkout when ready to charge
4. Wire lot-potential handoff to house-value-predictor opportunity cards
5. Add cross-app navigation (pricing → permit submission flow)
6. Consider real estate data API for reliable price lookup
7. Government portal Phase 2 city integration

## Deploy commands
API:    cd ~/permit-suite && vercel --prod --scope domusai
Apps:   vercel apps/[app-name] --prod --scope domusai

## How to resume
Paste this entire file at the start of a new Claude conversation and say:
"Resume permit suite development — here is our CLAUDE.md context"
