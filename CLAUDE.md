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

## Complete Supabase schema (app_data) — all tables
api_usage           — rate limiting (user_id, endpoint, date, count)
permit_applications — submitted permits (shared between submit + gov portal)
permit_documents    — uploaded files (storage: permit-documents bucket)
permit_comments     — gov worker notes on applications
ai_reviews          — AI pre-screening results
user_profiles       — role + city assignment (gov vs owner)
jurisdiction_codes  — code/zoning lookup cache by state/county/city
parcel_data         — per-property zoning, permit history, hazard zones

## jurisdiction_codes seeded entries
- state / CA / building_code — CBC 2025, free access via ICC/UpCodes
- county / CA / San Mateo County / zoning_api — ArcGIS free endpoint
- city / CA / San Mateo County / Woodside / municipal_code — eTRAKiT details
- city / CA / San Mateo County / Woodside / zoning_reform — SB9 applies

## Next API endpoints to build
api/jurisdiction/
  lookup.js     — GET /api/jurisdiction/lookup?state=CA&county=San+Mateo+County&city=Woodside&topic=zoning_api
  seed.js       — POST /api/jurisdiction/seed (admin only, populates new jurisdictions)
api/parcel/
  lookup.js     — POST /api/parcel/lookup { address } → zoning + hazard zones via ArcGIS
  history.js    — POST /api/parcel/history { address } → permit history via eTRAKiT or AI

## Jurisdiction database — populated entries (June 8 2026)
State level (CA):
  - building_code (CBC 2025, free via ICC/UpCodes)
  - zoning_reform (SB9 2022)
  - adu_law (AB 2221 + SB 897 2023)

State level (OR):
  - building_code (Oregon Residential Specialty Code 2023)
  - zoning_reform (HB 2001 + SB 458)

County level (San Mateo County, CA):
  - zoning_api (ArcGIS free endpoint details)
  - zoning_districts (ArcGIS layer sampled)
  - parcel_layer (ArcGIS layer sampled)

City level (Woodside, CA):
  - municipal_code (eTRAKiT details, contact info)
  - zoning_reform (SB9 applies — AG rejected Woodside exemption)
  - adu_rules (crawled from woodsideca.gov)
  - setback_requirements (crawled)
  - permit_fees (crawled, medium confidence)
  - fire_hazard_zones (crawled, high confidence)

## To add a new jurisdiction
1. Add city to CITY_CONFIGS in api/jurisdiction/crawl-city.js
2. Add county to COUNTY_CONFIGS in api/jurisdiction/crawl-county.js
3. Call POST /api/jurisdiction/crawl-city and /crawl-county
4. Data auto-expires in 30 days and can be re-crawled on demand

## Next steps
1. Build POST /api/parcel/lookup — ArcGIS zoning query per address
2. Wire lot-potential to use jurisdiction + parcel lookup instead of AI search
3. Audit + deploy permit-assistant
4. Add Vercel Cron for monthly jurisdiction refresh
5. Remove api/debug/lookup.js before public launch

## Auth improvements — June 8 2026
1. Added token expiry check to getToken() — returns null if expired
2. Added refreshSession() — calls POST /api/auth action:'refresh'
3. Added getValidToken() — auto-refreshes expired tokens
4. Added authHeadersAsync() — async version that auto-refreshes
5. Added refresh action to api/auth.js handler
6. Added handle401() in App.jsx — shows re-login modal with "Session expired" message
7. All three fetch calls use authHeadersAsync() — auto-refresh on every API call

TODO: Apply same auth fixes to cre-evaluator, permit-submission, lot-potential
      (same issue will occur after 1 hour of inactivity in those apps)

## Anonymous usage — June 8 2026
Anonymous users (no login) can now use all demo endpoints with IP-based rate limits:
  - price/lookup: 3/day
  - price/projection: 5/day
  - permit/opportunities: 2/day
  - lot/eligibility: 2/day
  - lot/options: 2/day

Always requires login:
  - permit/submit, user/me, all crawlers, stripe/webhook

When limit hit → 429 with code SIGNUP_REQUIRED → app shows signup modal
  "You've used your free daily lookups. Sign up for 30 days unlimited."

Database: app_data.anonymous_usage (ip_hash, endpoint, date, count)
IP is hashed with SHA256 + salt before storage — no raw IPs stored.

TODO: Apply same auth fixes (authHeadersAsync, handle401, handleSignupRequired)
      to cre-evaluator, permit-submission, and lot-potential apps.
