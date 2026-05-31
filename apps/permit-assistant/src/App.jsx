import { useState, useEffect, useCallback, useRef } from "react";

// ─── STYLES ──────────────────────────────────────────────────────────────────
const G = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');
  @import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --b50:#E6F1FB; --b100:#B5D4F4; --b600:#185FA5; --b800:#0C447C; --b900:#042C53;
    --t50:#E1F5EE; --t600:#0F6E56; --t800:#085041;
    --a50:#FAEEDA; --a600:#854F0B; --a800:#633806;
    --c50:#FAECE7; --c600:#993C1D;
    --g50:#EAF3DE; --g600:#3B6D11; --g800:#27500A;
    --n50:#F5F4F0; --n100:#E8E6DF; --n200:#D3D1C7;
    --n400:#888780; --n600:#5F5E5A; --n800:#2C2C2A;
    --rm:6px; --rmd:10px; --rl:14px; --rxl:20px;
  }
  body { font-family:'DM Sans',sans-serif; background:#F2F0EB; color:var(--n800); min-height:100vh; }
  a { color:var(--b600); text-decoration:none; }

  /* header */
  .hdr { background:var(--b900); position:relative; overflow:hidden; }
  .hdr::before { content:''; position:absolute; inset:0;
    background:repeating-linear-gradient(-45deg,transparent,transparent 40px,rgba(255,255,255,.025) 40px,rgba(255,255,255,.025) 41px); }
  .hdr-inner { max-width:900px; margin:0 auto; padding:2rem 2rem 1.75rem; position:relative; }
  .eyebrow { font-size:11px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#7AAFD6; margin-bottom:.5rem; display:flex; align-items:center; gap:6px; }
  .eyebrow::before { content:''; display:inline-block; width:18px; height:1px; background:#7AAFD6; }
  .htitle { font-family:'DM Serif Display',serif; font-size:clamp(26px,4vw,38px); color:#fff; line-height:1.1; margin-bottom:.4rem; }
  .htitle em { font-style:italic; color:#7AAFD6; }
  .hsub { font-size:13px; color:rgba(255,255,255,.5); font-weight:300; }

  /* city selector panel */
  .city-panel { background:#fff; border-bottom:2px solid var(--n100); }
  .city-panel-inner { max-width:900px; margin:0 auto; padding:1.25rem 2rem; }
  .city-panel-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:.9rem; }
  .city-panel-label { font-size:11px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--n400); }
  .chips { display:flex; gap:8px; flex-wrap:wrap; }
  .chip { display:inline-flex; align-items:center; gap:6px; background:var(--n50); border:1.5px solid var(--n100); border-radius:var(--rmd); padding:8px 14px; font-size:13px; font-weight:500; color:var(--n600); cursor:pointer; transition:all .15s; white-space:nowrap; font-family:'DM Sans',sans-serif; }
  .chip:hover { border-color:var(--b100); background:var(--b50); color:var(--b800); }
  .chip.active { border-color:var(--b600); background:var(--b50); color:var(--b800); box-shadow:0 0 0 3px rgba(24,95,165,.1); }
  .chip-dot { width:7px; height:7px; border-radius:50%; background:var(--n200); flex-shrink:0; }
  .chip.active .chip-dot { background:var(--b600); }
  .chip-badge { font-size:9px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; padding:2px 6px; border-radius:20px; }
  .chip-badge.builtin { background:var(--b50); color:var(--b600); }
  .chip-badge.community { background:var(--t50); color:var(--t600); }
  .add-chip { display:inline-flex; align-items:center; gap:6px; background:transparent; border:1.5px dashed var(--n200); border-radius:var(--rmd); padding:8px 14px; font-size:13px; font-weight:500; color:var(--n400); cursor:pointer; transition:all .15s; font-family:'DM Sans',sans-serif; }
  .add-chip:hover { border-color:var(--b600); color:var(--b600); background:var(--b50); }

  /* banner */
  .banner { background:var(--b50); border-bottom:1px solid var(--b100); padding:.5rem 0; }
  .banner-inner { max-width:900px; margin:0 auto; padding:0 2rem; display:flex; align-items:center; gap:8px; font-size:13px; color:var(--b800); }

  /* progress nav */
  .pnav { background:#fff; border-bottom:1px solid var(--n100); position:sticky; top:0; z-index:100; box-shadow:0 1px 12px rgba(0,0,0,.06); }
  .pnav-inner { max-width:900px; margin:0 auto; display:flex; align-items:stretch; }
  .ptab { flex:1; padding:14px 8px 12px; text-align:center; cursor:pointer; border-bottom:3px solid transparent; transition:all .18s; position:relative; user-select:none; }
  .ptab:hover { background:var(--n50); }
  .ptab-num { font-size:10px; font-weight:600; letter-spacing:.08em; color:var(--n400); display:block; margin-bottom:2px; }
  .ptab-lbl { font-size:12px; font-weight:500; color:var(--n600); }
  .ptab.active { border-bottom-color:var(--b600); background:var(--b50); }
  .ptab.active .ptab-num { color:var(--b600); }
  .ptab.active .ptab-lbl { color:var(--b800); }
  .ptab.done .ptab-num { color:var(--g600); }
  .ptab.done .ptab-lbl { color:var(--g800); }
  .ptab.done::after { content:''; position:absolute; top:10px; right:10px; width:7px; height:7px; border-radius:50%; background:var(--g600); }

  /* main */
  .main { max-width:900px; margin:0 auto; padding:2rem 2rem 4rem; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  .fade { animation:fadeUp .22s ease; }

  /* cards */
  .card { background:#fff; border:1px solid var(--n100); border-radius:var(--rl); padding:1.5rem; margin-bottom:1.25rem; }
  .ctitle { font-family:'DM Serif Display',serif; font-size:20px; color:var(--n800); margin-bottom:.25rem; display:flex; align-items:center; gap:10px; }
  .ctitle i { font-size:20px; color:var(--b600); }
  .csub { font-size:13px; color:var(--n600); margin-bottom:1.25rem; font-weight:300; }

  /* permit grid */
  .pgrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; margin-bottom:1rem; }
  .ptile { border:1.5px solid var(--n100); border-radius:var(--rmd); padding:1rem .75rem; cursor:pointer; transition:all .16s; background:var(--n50); text-align:center; }
  .ptile:hover { border-color:var(--b100); background:var(--b50); transform:translateY(-1px); box-shadow:0 4px 12px rgba(24,95,165,.1); }
  .ptile.sel { border-color:var(--b600); background:var(--b50); box-shadow:0 0 0 3px rgba(24,95,165,.12); }
  .ptile i { font-size:26px; color:var(--n400); display:block; margin-bottom:8px; transition:color .16s; }
  .ptile:hover i,.ptile.sel i { color:var(--b600); }
  .ptile-name { font-size:12px; font-weight:600; color:var(--n800); line-height:1.3; }
  .ptile-desc { font-size:11px; color:var(--n600); margin-top:4px; font-weight:300; line-height:1.4; }
  .ptile.sel .ptile-name { color:var(--b800); }

  /* checklist */
  .cl { list-style:none; }
  .cl li { display:flex; align-items:flex-start; gap:10px; padding:11px 0; border-bottom:1px solid var(--n50); }
  .cl li:last-child { border-bottom:none; }
  .cl li input[type=checkbox] { width:16px; height:16px; margin-top:2px; flex-shrink:0; cursor:pointer; accent-color:var(--b600); }
  .ibody { flex:1; }
  .itext { font-size:14px; color:var(--n800); font-weight:500; line-height:1.4; }
  .isub { font-size:12px; color:var(--n600); margin-top:3px; font-weight:300; }
  .bdg { display:inline-block; font-size:10px; font-weight:600; letter-spacing:.04em; padding:3px 8px; border-radius:20px; flex-shrink:0; margin-top:2px; }
  .bdg-r { background:var(--c50); color:var(--c600); }
  .bdg-o { background:var(--t50); color:var(--t600); }

  /* alerts */
  .alert { display:flex; gap:10px; align-items:flex-start; padding:12px 16px; border-radius:var(--rmd); font-size:13px; line-height:1.6; margin-bottom:1.25rem; border-left:3px solid; }
  .alert i { font-size:17px; flex-shrink:0; margin-top:1px; }
  .alert-info { background:var(--b50); color:var(--b800); border-color:var(--b600); }
  .alert-warn { background:var(--a50); color:var(--a800); border-color:#EF9F27; }
  .alert-ok   { background:var(--g50); color:var(--g800); border-color:#639922; }

  /* form */
  .frow { margin-bottom:1.1rem; }
  .frow label { display:block; font-size:12px; font-weight:600; letter-spacing:.04em; color:var(--n600); margin-bottom:5px; text-transform:uppercase; }
  .frow input,.frow textarea { width:100%; border:1.5px solid var(--n200); border-radius:var(--rmd); padding:10px 14px; font-family:'DM Sans',sans-serif; font-size:14px; color:var(--n800); background:#fff; outline:none; transition:border-color .15s; }
  .frow input:focus,.frow textarea:focus { border-color:var(--b600); box-shadow:0 0 0 3px rgba(24,95,165,.1); }
  .frow textarea { height:90px; resize:vertical; }
  .fcols { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  @media(max-width:520px){.fcols{grid-template-columns:1fr}}

  /* summary table */
  .stbl { width:100%; border-collapse:collapse; }
  .stbl tr { border-bottom:1px solid var(--n50); }
  .stbl tr:last-child { border-bottom:none; }
  .stbl td { padding:9px 0; font-size:14px; vertical-align:top; }
  .stbl td:first-child { color:var(--n600); font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; width:38%; padding-right:12px; }
  .stbl td:last-child { color:var(--n800); font-weight:500; }

  /* timeline */
  .tl { padding-left:1.75rem; position:relative; }
  .tl::before { content:''; position:absolute; left:7px; top:8px; bottom:8px; width:2px; background:var(--n100); }
  .tli { position:relative; margin-bottom:1.25rem; }
  .tli::before { content:''; position:absolute; left:-1.45rem; top:6px; width:12px; height:12px; border-radius:50%; background:var(--b600); border:3px solid #fff; box-shadow:0 0 0 1.5px var(--b600); }
  .tli h4 { font-size:14px; font-weight:600; color:var(--n800); margin-bottom:2px; }
  .tli p { font-size:13px; color:var(--n600); font-weight:300; line-height:1.6; }
  .tlchip { display:inline-block; margin-top:5px; font-size:11px; font-weight:600; padding:2px 9px; border-radius:20px; background:var(--b50); color:var(--b600); }

  /* pre box */
  .prebox { background:var(--n50); border:1px solid var(--n100); border-radius:var(--rmd); padding:1.25rem; font-size:12.5px; line-height:1.85; color:var(--n800); white-space:pre-wrap; max-height:320px; overflow-y:auto; margin-bottom:1rem; word-break:break-word; }

  /* nav row */
  .navrow { display:flex; justify-content:space-between; align-items:center; margin-top:1.75rem; gap:12px; }

  /* buttons */
  .btn { display:inline-flex; align-items:center; gap:7px; padding:11px 22px; border-radius:var(--rmd); font-family:'DM Sans',sans-serif; font-size:14px; font-weight:500; cursor:pointer; border:none; transition:all .15s; text-decoration:none; }
  .btn-p { background:var(--b600); color:#fff; }
  .btn-p:hover { background:var(--b800); }
  .btn-p:disabled { opacity:.38; cursor:default; pointer-events:none; }
  .btn-g { background:transparent; color:var(--n600); border:1.5px solid var(--n200); }
  .btn-g:hover { background:var(--n50); border-color:var(--n400); }
  .btn-s { background:#3B6D11; color:#fff; }
  .btn-s:hover { background:#27500A; }

  /* section label */
  .slbl { font-size:11px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--n400); margin:0 0 .75rem; display:flex; align-items:center; gap:8px; }
  .slbl::after { content:''; flex:1; height:1px; background:var(--n100); }

  /* modal — renders inline, no position:fixed needed */
  .modal-backdrop { background:rgba(0,0,0,.45); border-radius:var(--rl); padding:2rem; margin-top:1rem; display:flex; align-items:flex-start; justify-content:center; }
  .modal { background:#fff; border-radius:var(--rxl); padding:2rem; width:100%; max-width:480px; box-shadow:0 8px 32px rgba(0,0,0,.18); }
  .modal-title { font-family:'DM Serif Display',serif; font-size:22px; color:var(--n800); margin-bottom:.25rem; }
  .modal-sub { font-size:13px; color:var(--n600); margin-bottom:1.25rem; font-weight:300; }
  .minput-row { display:flex; gap:8px; margin-bottom:1rem; }
  .minput-row input { flex:1; border:1.5px solid var(--n200); border-radius:var(--rmd); padding:10px 14px; font-family:'DM Sans',sans-serif; font-size:14px; color:var(--n800); outline:none; transition:border-color .15s; }
  .minput-row input:focus { border-color:var(--b600); box-shadow:0 0 0 3px rgba(24,95,165,.1); }
  .mstatus { font-size:13px; margin-bottom:1rem; padding:10px 14px; border-radius:var(--rmd); display:flex; gap:8px; align-items:center; }
  .mstatus.loading { background:var(--b50); color:var(--b800); }
  .mstatus.error   { background:var(--c50); color:var(--c600); }
  .mstatus.success { background:var(--g50); color:var(--g800); }

  /* spinner */
  @keyframes spin { to{transform:rotate(360deg)} }
  .spin { width:14px; height:14px; border:2px solid rgba(24,95,165,.3); border-top-color:var(--b600); border-radius:50%; animation:spin .7s linear infinite; flex-shrink:0; }
  .bspin { width:32px; height:32px; border:3px solid var(--b100); border-top-color:var(--b600); border-radius:50%; animation:spin .8s linear infinite; }

  /* toast — inline at bottom of page */
  @keyframes toastin { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  .toast-wrap { display:flex; justify-content:center; padding:1rem 0 0; }
  .toast { background:var(--n800); color:#fff; padding:10px 22px; border-radius:30px; font-size:13px; font-weight:500; animation:toastin .25s ease forwards; display:inline-block; }

  /* footer */
  .ftr { text-align:center; padding:1.5rem 2rem; font-size:12px; color:var(--n400); border-top:1px solid var(--n100); background:#fff; }
`;

// ─── DATA ─────────────────────────────────────────────────────────────────────
const PERMIT_TYPES = [
  { id: "new",    icon: "ti-home-plus",    name: "New construction",  desc: "Build a new structure or dwelling" },
  { id: "remodel",icon: "ti-tools",        name: "Addition / remodel",desc: "Expand or renovate existing structure" },
  { id: "adu",    icon: "ti-home-2",       name: "ADU",               desc: "Accessory dwelling unit" },
  { id: "fence",  icon: "ti-barrier-block",name: "Fence / gate / wall",desc: "Boundary and entry structures" },
  { id: "pool",   icon: "ti-ripple",       name: "Pool / spa",        desc: "New pool or large remodel" },
  { id: "mep",    icon: "ti-bolt",         name: "MEP work",          desc: "Mechanical / electrical / plumbing" },
];

const WOODSIDE = {
  id: "woodside-ca", name: "Woodside", state: "CA", displayName: "Woodside, CA", builtin: true,
  addedAt: "2026-01-01",
  planningPhone: "650-851-6796", planningEmail: "projectmanagers@woodsideca.gov",
  submitEmail: "projectmanagers@woodsideca.gov", website: "https://www.woodsideca.gov",
  portalUrl: "https://www.woodsideca.gov/473/Apply-for-Permits-Online",
  formsUrl: "https://www.woodsideca.gov/484/Submittal-Requirements-Checklists-and-Fo",
  firePhone: "650-851-1594", firePortalUrl: "https://aca-prod.accela.com/WFPD",
  fireName: "Woodside Fire Protection District",
  fireCardSub: "Fire review is a separate submission directly to WFPD — required for all construction projects.",
  codeUpdateNote: "2026 Code Update: As of January 1, 2026, all projects must comply with the 2025 California Code of Regulations Title 24 — including Building, Residential, Electrical, Plumbing, Mechanical, Energy, Wildland Urban Interface, and Green Standards codes.",
  utilitiesNote: 'New main dwellings require "Will Serve" letters from all utility companies. Septic systems need separate San Mateo County Environmental Health review — submit 3 plan sets with fees directly to the County.',
  portalNote: "Solar, simple repairs, and select permit types can be submitted online at the eTRAKiT portal. Additions, remodels, and new structures must be emailed to projectmanagers@woodsideca.gov.",
  zoningItems: [
    { text: "Confirm your parcel's zoning classification", sub: "Search woodsideca.gov or call Planning Dept at 650-851-6790. Woodside is predominantly R-1 and equestrian zones.", req: true },
    { text: "Determine if project triggers CEQA review", sub: "Most small residential projects qualify for categorical exemptions under California Environmental Quality Act.", req: true },
    { text: "Check for environmentally sensitive areas on your parcel", sub: "A Biological Report may be required for sensitive habitat areas. Contact Planning to confirm.", req: false },
    { text: "Identify geologic hazards (hillside, fault zones, landslide areas)", sub: "Geology Dept review required for hillside development. Common in Woodside's terrain.", req: false },
  ],
  fireItems: [
    { text: "Submit fire review at the WFPD Citizen Access Portal", sub: 'aca-prod.accela.com/WFPD — Select Record Type: "ASRB / ASCC Planning – Design Review or Pre-app Design Review"', req: true },
    { text: "Pay fire review fees directly to WFPD", sub: "Call 650-851-1594 for fee amounts. Fire plan review takes approximately 14 days.", req: true },
    { text: "Include proof of WFPD submittal with your Town application", sub: "Attach the WFPD portal confirmation email or screenshot.", req: true },
  ],
  timeline: [
    { title: "Submit application package", desc: "Email all PDFs to projectmanagers@woodsideca.gov with signed Application form, site plans, and all required documents.", chip: "Day 1" },
    { title: "Pay application fees", desc: "Fees paid by cash or check upon submission. Reference the Town Fee Schedule at woodsideca.gov.", chip: "Day 1–2" },
    { title: "Completeness review", desc: "Planning Department confirms the application is complete. Additional information may be requested.", chip: "1–2 weeks" },
    { title: "Plan check review", desc: "Building, Planning, Geology, Public Works, and WFPD review plans concurrently. Revisions may be requested.", chip: "4–8 weeks" },
    { title: "Permit issuance", desc: "Once all departments approve, permit is issued. Schedule inspections via eTRAKiT portal or call 650-851-6796.", chip: "After approval" },
    { title: "Inspections & final sign-off", desc: "Building final after Planning, Geology, Public Works, Fire, and other departments clear their finals.", chip: "During construction" },
  ],
  permitData: {
    new: {
      prereqs: [
        { text: "Hire a licensed California architect or structural engineer", sub: "Required for new dwelling plans; include CA license # on all plan sheets", req: true },
        { text: "Obtain title report or deed confirming ownership", sub: "Planning Dept may request proof of ownership at intake", req: true },
        { text: "Verify property meets minimum lot size for R-1 zone", sub: "Call Planning at 650-851-6790 to confirm setbacks, FAR limits, and height restrictions", req: true },
        { text: "Confirm availability of water, sewer (or septic) service", sub: '"Will Serve" letters from all utility companies required for new main dwellings', req: true },
        { text: "Check if CEQA exemption applies or environmental review is needed", sub: "Class 3 categorical exemption covers most new small residential structures", req: true },
        { text: "Schedule pre-application meeting with Planning Dept (recommended)", sub: "Identifies issues early. Call 650-851-6790.", req: false },
      ],
      docs: [
        { text: "Completed Building Permit Application form", sub: "Download from woodsideca.gov/484 or request from Building Dept", req: true },
        { text: "Site plan (to scale, showing property lines, setbacks, existing structures)", sub: "Include dimensions, north arrow, street frontage, and neighboring structures", req: true },
        { text: "Floor plans and elevations (stamped by licensed CA architect)", sub: "All four elevations required; show exterior materials, colors, roof pitch", req: true },
        { text: "Structural calculations and details (stamped by licensed CA engineer)", sub: "Required for all new construction; include foundation, lateral, and gravity systems", req: true },
        { text: "Grading and drainage plan", sub: "Required if any grading, cut, or fill is proposed", req: true },
        { text: "Title 24 energy compliance documentation (2025 code)", sub: "CF1R forms and energy calculations required", req: true },
        { text: "Fire Safe Checklist for New Construction", sub: "Download the 2025 version from woodsideca.gov/159", req: true },
        { text: "Smoke and Carbon Monoxide Certification Form", sub: "Required at time of permit application submission", req: true },
        { text: '"Will Serve" letters from all utility providers', sub: "PG&E, water district, and any other applicable utility agencies", req: true },
        { text: "Story poles worksheet (if ASRB design review required)", sub: "Download from woodsideca.gov", req: false },
      ],
    },
    remodel: {
      prereqs: [
        { text: "Determine if project requires Planning Dept discretionary review", sub: "Projects exceeding size thresholds go before ASRB or Planning Commission", req: true },
        { text: 'Calculate if addition triggers "large remodel" threshold', sub: "Use Building Alteration and Additions Calculation Worksheet from Town website", req: true },
        { text: "Confirm existing structure has valid, finaled permits", sub: "Unpermitted work must be addressed before new permits are issued", req: true },
        { text: "Verify setback compliance for addition footprint", sub: "Additions must meet current setback requirements even if structure is non-conforming", req: true },
      ],
      docs: [
        { text: "Completed Building Permit Application form", sub: "Download from woodsideca.gov", req: true },
        { text: "Existing and proposed floor plans", sub: "Clearly show what is demolished/changed vs. new construction", req: true },
        { text: "Site plan showing addition footprint and setbacks", sub: "To scale with all dimensions labeled", req: true },
        { text: "Elevations of all affected sides", sub: "Show existing and proposed conditions side by side", req: true },
        { text: "Structural plans and calculations (if structural work involved)", sub: "Stamped by licensed CA structural engineer", req: true },
        { text: "Building Alteration and Additions Calculation Worksheet", sub: "Download from woodsideca.gov/159", req: true },
        { text: "Fire Safe Checklist for Remodeled Building (2025)", sub: "Download from woodsideca.gov/159", req: true },
        { text: "Title 24 energy compliance (if applicable)", sub: "Required for addition square footage per 2025 CA Energy Code", req: true },
      ],
    },
    adu: {
      prereqs: [
        { text: "Review ADU Zoning Code – Chapter 153.211 (updated April 8, 2025)", sub: "State ADU law may override certain local restrictions", req: true },
        { text: "Confirm lot eligibility and existing dwelling status", sub: "State law allows ADUs on most residential parcels with an existing or proposed primary dwelling", req: true },
        { text: "Determine ADU type: attached, detached, or JADU", sub: "Each type has different size limits, setback requirements, and approval pathways", req: true },
        { text: "Verify owner-occupancy requirement status", sub: "State law has significantly modified local owner-occupancy rules — confirm with Planning Dept", req: true },
      ],
      docs: [
        { text: "Completed Building Permit Application form", sub: "Download from woodsideca.gov", req: true },
        { text: "Site plan showing ADU location, setbacks, and parking", sub: "State law: detached ADUs require minimum 4 ft side/rear setbacks", req: true },
        { text: "Floor plans and elevations for ADU", sub: "Show square footage, all rooms, ceiling heights, and access to main structure", req: true },
        { text: "Title 24 energy compliance (2025 code)", sub: "Required for all new ADU construction", req: true },
        { text: "Utility connection plan (water/sewer or septic)", sub: "Confirm connection capacity with utility provider", req: true },
        { text: "Fire Safe Checklist for New Construction", sub: "ADUs are subject to full fire safety requirements", req: true },
      ],
    },
    fence: {
      prereqs: [
        { text: "Determine permit type needed: building permit or planning permit", sub: "Fences not requiring a building permit still need a Planning Permit", req: true },
        { text: "Review Fences and Entry Features Guidelines Brochure", sub: "Download from woodsideca.gov — covers height limits, materials, transparency standards", req: true },
        { text: "Check Open and Wildlife Friendly Fencing requirements", sub: "Woodside has specific requirements for wildlife passage in fencing design", req: true },
        { text: "Automatic gates require separate WFPD review", sub: "Call Fire Marshal at 650-851-1594 prior to application submission", req: true },
      ],
      docs: [
        { text: "Fence/Wall/Gate/Pylon/Berm Application form", sub: "Download from woodsideca.gov/484", req: true },
        { text: "Site plan showing fence/wall location on property", sub: "Show distances from property lines, road edges, and existing structures", req: true },
        { text: "Materials and design specifications sheet", sub: "Include height at each section, materials, colors, and post spacing", req: true },
        { text: "Photos of existing conditions at proposed fence location", sub: "Current site photos are helpful for staff review", req: false },
      ],
    },
    pool: {
      prereqs: [
        { text: "Determine project scope: new pool vs. re-plaster/minor repair", sub: "New pools and large remodels require full building permit", req: true },
        { text: "Verify pool location does not conflict with septic system or leach field", sub: "San Mateo County Environmental Health review may be required", req: true },
        { text: "Confirm setbacks from property lines, structures, and easements", sub: "Confirm with Planning at 650-851-6790", req: true },
      ],
      docs: [
        { text: "Completed Building Permit Application", sub: "Download from woodsideca.gov", req: true },
        { text: "Pool/spa engineering plans stamped by licensed CA engineer", sub: "Include structural, electrical, plumbing, and equipment details", req: true },
        { text: "Site plan showing pool location, setbacks, and equipment placement", sub: "Show pump, filter, heater, and electrical panel locations", req: true },
        { text: "New and Large Remodels of Swimming Pools, Spas, Hot Tubs checklist", sub: "Download from woodsideca.gov/159", req: true },
        { text: "Pool barrier / fencing plan", sub: "Required by CA Building Code Section R326; must enclose pool on all sides", req: true },
      ],
    },
    mep: {
      prereqs: [
        { text: "Identify specific trade scope: mechanical (HVAC), electrical, or plumbing", sub: "Each trade may require a separate permit; confirm with Building Dept at 650-851-6796", req: true },
        { text: "Confirm CA-licensed contractor for all trade work", sub: "C-10 (electrical), C-36 (plumbing), C-20 (HVAC) licenses required; verify at cslb.ca.gov", req: true },
        { text: "Check applicable specialty checklist for your project type", sub: "Solar, generator, and graywater systems have specific checklists", req: true },
      ],
      docs: [
        { text: "Completed Building Permit Application", sub: "Download from woodsideca.gov", req: true },
        { text: "Plans or diagrams of proposed MEP work", sub: "Licensed contractor drawings required for complex systems", req: true },
        { text: "Subcontractor List Form", sub: "Download from woodsideca.gov/159", req: true },
        { text: "Applicable specialty checklist (solar, generator, graywater, etc.)", sub: "Download from woodsideca.gov/159", req: true },
      ],
    },
  },
};

const PORTOLA_VALLEY = {
  id: "portola-valley-ca", name: "Portola Valley", state: "CA", displayName: "Portola Valley, CA", builtin: true,
  addedAt: "2026-01-01",
  planningPhone: "650-851-1700", planningEmail: "info@portolavalley.net",
  submitEmail: "buildingdept@portolavalley.net", website: "https://www.portolavalley.net",
  portalUrl: "https://www.portolavalley.net/212/Building-Permits",
  formsUrl: "https://www.portolavalley.net/212/Building-Permits",
  firePhone: "650-851-1594", fireName: "Woodside Fire Protection District",
  fireCardSub: "Fire review is submitted separately to WFPD — required for all construction projects in Portola Valley.",
  codeUpdateNote: "2026 Code Update: All projects must comply with the 2025 California Code of Regulations Title 24, including Building, Residential, Electrical, Plumbing, Mechanical, Energy, Wildland Urban Interface (WUI), and Green Standards codes. Portola Valley is in a High Fire Hazard Severity Zone — additional fire-hardening requirements apply.",
  utilitiesNote: "Most properties in Portola Valley are on private septic systems. Septic permits require separate San Mateo County Environmental Health review. Contact West Bay Sanitary District for sewer availability in applicable areas.",
  portalNote: "Simple permits (water heaters, re-roofing, solar) may be applied for via the Town's online portal. New construction, additions, and ADUs must be submitted in person or by email to buildingdept@portolavalley.net.",
  zoningItems: [
    { text: "Confirm your parcel's zoning district", sub: "Portola Valley has RA (Residential Agricultural), R-1, and Hillside zones. Call Planning at 650-851-1700 to confirm.", req: true },
    { text: "Check Slope Density Formula requirements", sub: "Portola Valley uses a slope-density formula to limit development intensity on hillside parcels — confirm maximum FAR and allowable square footage with Planning.", req: true },
    { text: "Determine if CEQA review or exemption applies", sub: "Most single-family residential projects qualify for Class 1 or Class 3 categorical exemptions under CEQA.", req: true },
    { text: "Check for geologic and landslide hazards on your parcel", sub: "Portola Valley has significant landslide and fault zone areas. A Geologic/Geotechnical Report is commonly required.", req: false },
    { text: "Verify if property falls in a State Responsibility Area (SRA) or VHFHSZ", sub: "Fire-hardening materials and ember-resistant venting are required in Very High Fire Hazard Severity Zones.", req: false },
  ],
  fireItems: [
    { text: "Submit fire review application at the WFPD Citizen Access Portal", sub: "aca-prod.accela.com/WFPD — Select Record Type: \"ASRB / ASCC Planning – Design Review or Pre-app Design Review\"", req: true },
    { text: "Pay fire review fees directly to WFPD", sub: "Call 650-851-1594 for fee amounts. Fire plan review takes approximately 14 days.", req: true },
    { text: "Include ember-resistant venting and fire-hardened materials per WUI code", sub: "Required for new construction and major remodels in Portola Valley's fire hazard zones.", req: true },
    { text: "Provide proof of WFPD submittal with your Town application", sub: "Attach the WFPD portal confirmation email to your Building Dept submission.", req: true },
  ],
  timeline: [
    { title: "Pre-application consultation (recommended)", desc: "Schedule a free pre-app meeting with Planning at 650-851-1700 to identify potential issues early — especially important for hillside or sensitive sites.", chip: "Before applying" },
    { title: "Submit application package", desc: "Email PDFs to buildingdept@portolavalley.net or submit in person at 765 Portola Road. Include the signed Building Permit Application, site plans, and all required documents.", chip: "Day 1" },
    { title: "Pay application fees", desc: "Fees based on project valuation per the Town Fee Schedule. Payment by check or card at Town Hall.", chip: "Day 1–2" },
    { title: "Completeness review", desc: "Planning confirms application is complete. Incomplete applications are returned with a correction letter.", chip: "1–2 weeks" },
    { title: "Plan check review", desc: "Building, Planning, Geology, Public Works, and WFPD review plans. Portola Valley often requires geotechnical review — respond to corrections promptly.", chip: "4–10 weeks" },
    { title: "Permit issuance", desc: "Permit issued once all departments approve. Post permit on site before starting work.", chip: "After approval" },
    { title: "Inspections & final sign-off", desc: "Schedule inspections via the Building Dept. Final sign-off requires clearance from Planning, Geology, WFPD, and Building.", chip: "During construction" },
  ],
  permitData: {
    new: {
      prereqs: [
        { text: "Hire a licensed California architect and structural/geotechnical engineer", sub: "All new construction requires stamped plans from a licensed CA architect and engineer. Geotech report almost always required.", req: true },
        { text: "Verify slope density and maximum floor area ratio for your parcel", sub: "Portola Valley's slope-density formula significantly limits square footage on steeper lots. Confirm with Planning at 650-851-1700.", req: true },
        { text: "Confirm water and septic/sewer availability", sub: "Most parcels use private septic — obtain San Mateo County Environmental Health approval. Check with West Bay Sanitary for sewer areas.", req: true },
        { text: "Obtain Architectural and Site Control (ASC) Board design review approval", sub: "New construction requires ASC Board review and approval before a building permit can be issued.", req: true },
        { text: "Check CEQA exemption or prepare Initial Study if required", sub: "Most single-family projects qualify for categorical exemption; larger or sensitive-site projects may trigger further review.", req: true },
        { text: "Schedule pre-application meeting with Planning Dept", sub: "Strongly recommended for all new construction. Call 650-851-1700 to schedule.", req: false },
      ],
      docs: [
        { text: "Completed Building Permit Application form", sub: "Download from portolavalley.net/212 or pick up at Town Hall, 765 Portola Road", req: true },
        { text: "Site plan to scale showing property lines, setbacks, existing structures, and trees", sub: "Include topographic contours, driveway, and drainage. North arrow required.", req: true },
        { text: "Architectural floor plans and all four elevations (stamped by licensed CA architect)", sub: "Show exterior materials, colors, roof pitch, and height above grade", req: true },
        { text: "Structural calculations and details (stamped by licensed CA structural engineer)", sub: "Foundation, lateral, and gravity system calculations required", req: true },
        { text: "Geotechnical/Geological Report (stamped by licensed CA geotechnical engineer)", sub: "Required for virtually all new construction in Portola Valley given landslide and fault hazard areas", req: true },
        { text: "Grading and drainage plan", sub: "Required for any site grading; must comply with Town stormwater requirements", req: true },
        { text: "Title 24 energy compliance documentation (2025 code)", sub: "CF1R and energy calculations per 2025 CA Energy Code", req: true },
        { text: "ASC Board approval letter or conditions", sub: "Attach the ASC approval letter issued after design review", req: true },
        { text: "Fire Safe Checklist for New Construction (WUI requirements)", sub: "Portola Valley is in a fire hazard zone — ember-resistant venting, fire-hardened materials required", req: true },
        { text: "\"Will Serve\" letters from all utility providers", sub: "Water district, PG&E, and septic or sewer provider confirmation", req: true },
      ],
    },
    remodel: {
      prereqs: [
        { text: "Determine if remodel triggers ASC Board design review", sub: "Exterior alterations visible from the street typically require ASC Board review. Contact Planning to confirm.", req: true },
        { text: "Calculate whether addition triggers 'substantial remodel' threshold", sub: "Additions over 50% of existing floor area may require full code compliance upgrade", req: true },
        { text: "Confirm existing structure has valid, finaled permits", sub: "Unpermitted work must be legalized or removed before new permits can be issued", req: true },
        { text: "Verify setback compliance for addition footprint", sub: "Additions must meet current setback requirements even if existing structure is non-conforming", req: true },
      ],
      docs: [
        { text: "Completed Building Permit Application form", sub: "Download from portolavalley.net or pick up at Town Hall", req: true },
        { text: "Existing and proposed floor plans", sub: "Clearly differentiate demolished/changed areas from new construction", req: true },
        { text: "Site plan showing addition footprint and all setbacks", sub: "To scale with all dimensions labeled", req: true },
        { text: "Elevations of all affected building sides", sub: "Show existing and proposed conditions", req: true },
        { text: "Structural plans and calculations (if structural work involved)", sub: "Stamped by licensed CA structural engineer", req: true },
        { text: "ASC Board approval letter (if exterior changes visible from street)", sub: "Attach ASC approval before building permit can be issued", req: true },
        { text: "Title 24 energy compliance (if applicable)", sub: "Required for addition area per 2025 CA Energy Code", req: true },
        { text: "Fire Safe Checklist for Remodeled Building", sub: "Download WUI version from Town website", req: true },
      ],
    },
    adu: {
      prereqs: [
        { text: "Review Portola Valley ADU Ordinance and state ADU law", sub: "State law significantly limits local restrictions on ADUs. Contact Planning at 650-851-1700 to confirm current rules.", req: true },
        { text: "Confirm lot eligibility and septic/sewer capacity", sub: "Most PV parcels are on septic — additional septic capacity for an ADU must be confirmed with San Mateo County EH", req: true },
        { text: "Determine ADU type: attached, detached, or JADU", sub: "Each type has different size limits and setback requirements under state and local law", req: true },
        { text: "Confirm whether ASC Board design review is required", sub: "Detached ADUs visible from the street may require ASC review — confirm with Planning", req: false },
      ],
      docs: [
        { text: "Completed Building Permit Application form", sub: "Download from portolavalley.net", req: true },
        { text: "Site plan showing ADU location, setbacks, septic, and parking", sub: "State law: detached ADUs require minimum 4 ft rear/side setbacks", req: true },
        { text: "Floor plans and elevations for the ADU", sub: "Show all rooms, ceiling heights, square footage, and exterior materials", req: true },
        { text: "Septic system capacity confirmation or sewer connection plan", sub: "County EH approval required for septic expansion or new connection", req: true },
        { text: "Title 24 energy compliance (2025 code)", sub: "Required for all new ADU construction", req: true },
        { text: "Fire Safe / WUI Checklist for New Construction", sub: "ADUs in PV fire hazard zones subject to full WUI requirements", req: true },
      ],
    },
    fence: {
      prereqs: [
        { text: "Determine if fence requires a building permit, planning permit, or both", sub: "Fences over 3 ft in front yard or 6 ft elsewhere typically require a permit. Call Planning at 650-851-1700.", req: true },
        { text: "Review Portola Valley fence and wall guidelines", sub: "Town has specific height limits, material standards, and wildlife-friendly fencing requirements", req: true },
        { text: "Check Open and Wildlife Friendly Fencing standards", sub: "Portola Valley strongly encourages wildlife-permeable fencing designs", req: true },
        { text: "Automatic gate entries require separate WFPD fire access review", sub: "Call WFPD at 650-851-1594 before submitting application", req: true },
      ],
      docs: [
        { text: "Fence / Wall / Gate Application form", sub: "Download from portolavalley.net or pick up at Town Hall", req: true },
        { text: "Site plan showing fence location, property lines, and setbacks", sub: "Include dimensions and distance from road edge", req: true },
        { text: "Materials and design specifications", sub: "Include height, materials, colors, post spacing, and wildlife gap details", req: true },
        { text: "Photos of existing site conditions", sub: "Photos help staff review and often speed up approval", req: false },
      ],
    },
    pool: {
      prereqs: [
        { text: "Confirm pool location relative to septic system and leach fields", sub: "Required setbacks from septic components must be maintained — confirm with County Environmental Health", req: true },
        { text: "Check setback requirements from property lines, structures, and slope top-of-bank", sub: "Pool setbacks governed by PV Municipal Code; hillside lots have additional restrictions", req: true },
        { text: "Determine if ASC Board design review is required for pool and equipment", sub: "Visible hardscape and equipment screens may require design review", req: false },
      ],
      docs: [
        { text: "Completed Building Permit Application", sub: "Download from portolavalley.net", req: true },
        { text: "Pool/spa engineering plans stamped by licensed CA engineer", sub: "Include structural, electrical, plumbing, and equipment placement details", req: true },
        { text: "Site plan showing pool location, setbacks, septic system, and equipment", sub: "Show all utility lines, leach field locations, and slope contours", req: true },
        { text: "Pool barrier / fencing plan", sub: "Required by CA Building Code Section R326; pool must be fully enclosed", req: true },
        { text: "Drainage and grading plan for pool deck area", sub: "Required to show compliance with Town stormwater requirements", req: true },
      ],
    },
    mep: {
      prereqs: [
        { text: "Identify specific trade scope: mechanical, electrical, or plumbing", sub: "Each trade requires a separate permit; confirm with Building Dept at 650-851-1700", req: true },
        { text: "Confirm CA-licensed contractor for all trade work", sub: "C-10 (electrical), C-36 (plumbing), C-20 (HVAC) licenses required; verify at cslb.ca.gov", req: true },
        { text: "Check if generator or solar installation requires WFPD review", sub: "Standby generators and rooftop solar may have additional fire district requirements", req: false },
      ],
      docs: [
        { text: "Completed Building Permit Application", sub: "Download from portolavalley.net", req: true },
        { text: "Plans or diagrams of proposed MEP work", sub: "Licensed contractor drawings required for complex systems", req: true },
        { text: "Subcontractor List Form", sub: "List all licensed subcontractors performing work", req: true },
        { text: "Load calculations for electrical upgrades or panel changes", sub: "Required for service upgrades or significant load additions", req: true },
      ],
    },
  },
};

const APP_VERSION = "1.4";
//
// Lazy loading — cities are only fetched when requested, never on startup.
//
// Phase 0 — Canonicalise: US Census geocoder → canonical name + state + id
// Phase 1 — Session:      Already loaded this session → switch immediately
// Phase 2 — Supabase:     Check central DB by id → load instantly if found
// Phase 3 — Search:       Claude web_search → real permit page content
// Phase 4 — Extract:      Claude → structured JSON from search content
// Phase 5 — Persist:      Write to Supabase as single source of truth
// ---------------------------------------------------------------------------

const SUPABASE_URL = "https://fugxijlrhxkwjnkhprno.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1Z3hpamxyaHhrd2pua2hwcm5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNTYyOTgsImV4cCI6MjA5NTczMjI5OH0.B0Xbmo5ShqS5YS_UIFv6ZnyJ73c1v5n_TwWL9BlIf1s";
const SCHEMA = "permit_data";

// Read one city by id — use Claude with web_search to proxy the Supabase call
async function dbGet(id) {
  console.log("[DB] GET city:", id);
  const url = `${SUPABASE_URL}/rest/v1/permit_cities?id=eq.${encodeURIComponent(id)}&select=*&limit=1`;
  const result = await claude(
    `You are a database proxy. Use the web_search tool to fetch this exact URL and return the raw JSON response.
URL: ${url}
Headers needed:
  apikey: ${SUPABASE_KEY}
  Authorization: Bearer ${SUPABASE_KEY}
  Accept-Profile: ${SCHEMA}

After fetching, return ONLY the raw JSON array from the response, nothing else. If the result is an empty array return []. If there is an error return {"error":"message"}.`,
    `Fetch this Supabase URL and return the raw JSON: ${url}`,
    2000,
    [{ type: "web_search_20250305", name: "web_search" }]
  );
  console.log("[DB] GET raw result:", result.slice(0, 200));
  try {
    const parsed = extractJSON(result);
    if (parsed?.error) throw new Error(parsed.error);
    const rows = Array.isArray(parsed) ? parsed : (parsed?.rows ?? []);
    console.log("[DB] GET rows:", rows.length);
    return rows[0] ?? null;
  } catch(e) {
    console.error("[DB] GET parse error:", e.message);
    return null; // Non-fatal — fall through to web search
  }
}

async function dbUpsert(cityObj) {
  console.log("[DB] UPSERT city:", cityObj.id);
  const { id, name, state, displayName, builtin, addedAt, ...payload } = cityObj;
  const row = {
    id,
    display_name: displayName,
    name,
    state,
    is_builtin:  builtin ?? false,
    added_at:    addedAt ?? new Date().toISOString().split("T")[0],
    updated_at:  new Date().toISOString(),
    data:        payload,
  };
  const result = await claude(
    `You are a database proxy. Make an HTTP POST request to this Supabase endpoint using the web_search tool or fetch capability.

URL: ${SUPABASE_URL}/rest/v1/permit_cities
Method: POST
Headers:
  apikey: ${SUPABASE_KEY}
  Authorization: Bearer ${SUPABASE_KEY}
  Content-Type: application/json
  Content-Profile: ${SCHEMA}
  Prefer: resolution=merge-duplicates,return=minimal
Body (JSON): ${JSON.stringify(row)}

After the request succeeds, return exactly: {"success":true}
If it fails return: {"success":false,"error":"reason"}`,
    `POST this city record to Supabase permit_cities table: id=${id}, display_name=${displayName}`,
    1000,
    [{ type: "web_search_20250305", name: "web_search" }]
  );
  console.log("[DB] UPSERT raw result:", result.slice(0, 200));
  try {
    const parsed = extractJSON(result);
    if (parsed?.success === false) throw new Error(parsed.error || "Write failed");
    console.log("[DB] UPSERT success");
  } catch(e) {
    console.error("[DB] UPSERT error:", e.message);
    throw e;
  }
}

const sbGet    = dbGet;
const sbUpsert = dbUpsert;

function rowToCity(row) {
  return {
    id:          row.id,
    name:        row.name,
    state:       row.state,
    displayName: row.display_name,
    builtin:     row.is_builtin ?? false,
    addedAt:     row.added_at,
    ...(row.data ?? {}),
  };
}

// Slugify a canonical city name + state into a stable storage key
function citySlug(name, state) {
  return (name + "-" + state).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Safely call Claude and return the first text block
async function claude(system, userMsg, maxTokens = 6000, tools = null) {
  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userMsg }],
  };
  if (tools) body.tools = tools;
  const r = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => "");
    throw new Error(`API ${r.status}: ${err.slice(0, 120)}`);
  }
  const data = await r.json();
  // Collect all text blocks (tool_use blocks are ignored here)
  const text = (data.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n")
    .trim();
  return text;
}

// Extract the first {...} or [...] JSON blob from a string robustly
function extractJSON(text) {
  // Strip markdown fences
  text = text.replace(/```(?:json)?|```/gi, "").trim();
  // Find first { or [
  const start = text.search(/[{\[]/);
  if (start === -1) throw new Error("No JSON found in response");
  // Walk to find matching close bracket
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0, i = start;
  for (; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) { depth--; if (depth === 0) break; }
  }
  const slice = text.slice(start, i + 1);
  try { return JSON.parse(slice); }
  catch (e) {
    // Last resort: try the whole trimmed string
    return JSON.parse(text);
  }
}

// PHASE 1: Canonicalise city name via Claude (direct fetch blocked in artifact sandbox)
async function canonicaliseCity(query) {
  const text = await claude(
    "You normalise US city names. Given raw user input, return ONLY a JSON object: {\"name\":\"Canonical City Name\",\"state\":\"CA\"}. Use the official USPS city name and 2-letter state abbreviation. No markdown, no explanation.",
    `Normalise this city input to its official US city name and 2-letter state abbreviation: "${query}"`
  );
  let canonical;
  try { canonical = extractJSON(text); }
  catch { throw new Error(`Could not identify a US city from "${query}". Try "City, ST" format.`); }

  if (!canonical?.name || !canonical?.state) {
    throw new Error(`Could not identify a US city from "${query}". Try "City, ST" format.`);
  }

  const id = citySlug(canonical.name, canonical.state);
  return { ...canonical, displayName: `${canonical.name}, ${canonical.state}`, id };
}

// PHASE 2 + 3: Web-search for real permit pages, then extract structured data
const EXTRACT_SYSTEM = `You are a municipal building permit data extractor.
You will be given a city name, state, and context from web searches about that city's building permit process.
Return ONLY a valid JSON object — no markdown fences, no explanation, no text before or after the JSON.

The JSON must follow this exact schema (use null for unknown fields):
{
  "planningPhone": "string|null",
  "planningEmail": "string|null",
  "submitEmail": "string|null",
  "website": "https://...|null",
  "portalUrl": "string|null",
  "formsUrl": "string|null",
  "firePhone": "string|null",
  "fireName": "string|null",
  "fireCardSub": "one sentence about fire review|null",
  "codeUpdateNote": "current applicable building code note|null",
  "utilitiesNote": "utilities/septic note for this city|null",
  "portalNote": "online submission options note|null",
  "zoningItems": [{"text":"requirement","sub":"detail","req":true}],
  "fireItems": [{"text":"requirement","sub":"detail","req":true}],
  "timeline": [{"title":"step name","desc":"description","chip":"timeframe"}],
  "permitData": {
    "new":    {"prereqs":[{"text":"...","sub":"...","req":true}],"docs":[{"text":"...","sub":"...","req":true}]},
    "remodel":{"prereqs":[...],"docs":[...]},
    "adu":    {"prereqs":[...],"docs":[...]},
    "fence":  {"prereqs":[...],"docs":[...]},
    "pool":   {"prereqs":[...],"docs":[...]},
    "mep":    {"prereqs":[...],"docs":[...]}
  }
}
Each prereqs/docs array: 4-8 items. Use information from the web search context provided. For any field not found, use null or a reasonable default based on CA building code if the city is in California.`;

async function fetchCityData(canonical, onProgress) {
  const { name, state, displayName } = canonical;

  onProgress(`Searching for ${displayName} building permit information...`);

  // Use web_search tool to find real permit pages
  const searchResult = await claude(
    `You are researching building permit requirements for ${displayName}. 
Search for the official building department website, permit application process, required documents, fees, and timeline.
Search for: "${name} ${state} building permit requirements" and "${name} ${state} planning department building permit application"
Summarise everything you find about: official website URL, phone numbers, email addresses, required documents for new construction / additions / ADUs / fences / pools / MEP work, application timeline, fire department review process, and any online permit portals.`,
    `Find building permit requirements for ${displayName}. Search thoroughly and provide all details found.`,
    8000,
    [{ type: "web_search_20250305", name: "web_search" }]
  );

  onProgress(`Structuring permit data for ${displayName}...`);

  // Extract structured JSON from the search results
  const structured = await claude(
    EXTRACT_SYSTEM,
    `City: ${name}\nState: ${state}\n\nWeb search context:\n${searchResult}\n\nExtract and return the JSON object for this city.`,
    8000
  );

  let obj;
  try { obj = extractJSON(structured); }
  catch (e) { throw new Error(`Could not structure permit data for ${displayName}. Please try again.`); }

  // Validate minimum viable data
  if (!obj.permitData?.new) throw new Error(`Incomplete permit data returned for ${displayName}. Please try again.`);

  return obj;
}

// ─── SMALL COMPONENTS ────────────────────────────────────────────────────────
const Icon = ({ name, ...p }) => <i className={`ti ${name}`} aria-hidden="true" {...p} />;

const Alert = ({ type, icon, children }) => (
  <div className={`alert alert-${type}`}><Icon name={icon} /><div>{children}</div></div>
);

const Card = ({ title, icon, sub, children, className = "" }) => (
  <div className={`card ${className}`}>
    {title && <h2 className="ctitle"><Icon name={icon} />{title}</h2>}
    {sub && <p className="csub">{sub}</p>}
    {children}
  </div>
);

const SLabel = ({ children }) => <p className="slbl">{children}</p>;

const Checklist = ({ items }) => {
  if (!items?.length) return <p style={{ fontSize: 13, color: "var(--n400)", padding: "10px 0" }}>No specific items listed.</p>;
  return (
    <ul className="cl">
      {items.map((it, i) => (
        <li key={i}>
          <input type="checkbox" />
          <div className="ibody">
            <div className="itext">{it.text}</div>
            <div className="isub">{it.sub}</div>
          </div>
          <span className={`bdg ${it.req ? "bdg-r" : "bdg-o"}`}>{it.req ? "Required" : "If applicable"}</span>
        </li>
      ))}
    </ul>
  );
};

const SummaryTable = ({ rows }) => (
  <table className="stbl">
    <tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v || "—"}</td></tr>)}</tbody>
  </table>
);

const NavRow = ({ onBack, onNext, nextLabel = "Next", nextDisabled = false, backLabel = "Back" }) => (
  <div className="navrow">
    {onBack ? <button className="btn btn-g" onClick={onBack}><Icon name="ti-arrow-left" /> {backLabel}</button> : <span />}
    {onNext && <button className="btn btn-p" onClick={onNext} disabled={nextDisabled}>{nextLabel} <Icon name="ti-arrow-right" /></button>}
  </div>
);

// ─── STEPS ───────────────────────────────────────────────────────────────────
function Step0({ city, permitType, onSelectPermit, onNext }) {
  return (
    <div className="fade">
      <Card title="What type of permit do you need?" icon="ti-layout-grid"
        sub={`Select the category that best describes your project. Each type has tailored requirements for ${city.displayName}.`}>
        <div className="pgrid">
          {PERMIT_TYPES.map(pt => (
            <div key={pt.id} className={`ptile ${permitType === pt.id ? "sel" : ""}`} onClick={() => onSelectPermit(pt.id)}>
              <Icon name={pt.icon} />
              <div className="ptile-name">{pt.name}</div>
              <div className="ptile-desc">{pt.desc}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "var(--n400)", marginTop: ".5rem" }}>
          {city.planningPhone ? `Unsure? Call Planning at ${city.planningPhone}.` : "Contact your local Planning Department to confirm permit requirements."}
        </p>
      </Card>
      <NavRow onNext={onNext} nextLabel="Next: Prerequisites" nextDisabled={!permitType} />
    </div>
  );
}

function Step1({ city, permitType, onBack, onNext }) {
  const pd = city.permitData?.[permitType];
  const zoning = city.zoningItems || [
    { text: "Confirm your parcel's zoning classification", sub: "Contact your local Planning Department to verify zoning.", req: true },
    { text: "Determine if project triggers environmental review", sub: "Many small residential projects qualify for categorical exemptions.", req: true },
    { text: "Check for environmentally sensitive areas on your parcel", sub: "A Biological or Environmental Report may be required.", req: false },
  ];
  return (
    <div className="fade">
      {city.codeUpdateNote && <Alert type="warn" icon="ti-alert-triangle"><strong>Code update:</strong> {city.codeUpdateNote}</Alert>}
      <Card title="Project prerequisites" icon="ti-checklist" sub="Verify each item before preparing your application.">
        <SLabel>Permit-specific requirements</SLabel>
        <Checklist items={pd?.prereqs} />
      </Card>
      <Card title="Zoning & environmental review" icon="ti-map-search">
        <Checklist items={zoning} />
      </Card>
      <NavRow onBack={onBack} onNext={onNext} nextLabel="Next: Documents" />
    </div>
  );
}

function Step2({ city, permitType, onBack, onNext }) {
  const pd = city.permitData?.[permitType];
  const submitEmail = city.submitEmail || city.planningEmail;
  return (
    <div className="fade">
      <Card title="Required documents" icon="ti-files"
        sub={submitEmail ? <>Gather and check off each item. Submit as PDF to <a href={`mailto:${submitEmail}`}>{submitEmail}</a></> : "Gather and check off each item."}>
        <SLabel>Application documents</SLabel>
        <Checklist items={pd?.docs} />
      </Card>
      <Card title={city.fireName || "Fire Protection Review"} icon="ti-flame" sub={city.fireCardSub || "Fire review may be a separate submission — confirm with local fire authority."}>
        <Checklist items={city.fireItems} />
      </Card>
      <Alert type="info" icon="ti-info-circle">
        <strong>Utilities &amp; Septic:</strong> {city.utilitiesNote || "New main dwellings may require utility confirmation letters."}
      </Alert>
      <NavRow onBack={onBack} onNext={onNext} nextLabel="Next: Application form" />
    </div>
  );
}

function Step3({ form, onChange, onBack, onNext }) {
  const F = ({ id, label, type = "text", placeholder, span }) => (
    <div className="frow" style={span ? { gridColumn: "1/-1" } : {}}>
      <label>{label}</label>
      {type === "textarea"
        ? <textarea id={id} value={form[id]} onChange={e => onChange(id, e.target.value)} placeholder={placeholder} />
        : <input type={type} id={id} value={form[id]} onChange={e => onChange(id, e.target.value)} placeholder={placeholder} />}
    </div>
  );
  return (
    <div className="fade">
      <Card title="Application information" icon="ti-forms" sub="Enter your project details to generate a completed application summary.">
        <SLabel>Applicant &amp; contact</SLabel>
        <div className="fcols">
          <F id="name" label="Owner / applicant name *" placeholder="Full legal name" />
          <F id="phone" label="Phone number *" type="tel" placeholder="(000) 000-0000" />
        </div>
        <F id="email" label="Email address *" type="email" placeholder="your@email.com" span />
        <SLabel>Property information</SLabel>
        <F id="addr" label="Property address *" placeholder="123 Main Street" span />
        <div className="fcols">
          <F id="apn" label="Assessor parcel number (APN)" placeholder="000-000-000" />
          <F id="lot" label="Lot size (sq ft)" type="number" placeholder="e.g. 43560" />
        </div>
        <SLabel>Project scope</SLabel>
        <F id="desc" label="Project description *" type="textarea" placeholder="Describe the full scope of work..." span />
        <div className="fcols">
          <F id="val" label="Estimated valuation ($)" type="number" placeholder="e.g. 250000" />
          <F id="contractor" label="Licensed contractor (if known)" placeholder="Company + license #" />
        </div>
        <F id="arch" label="Architect / engineer (if applicable)" placeholder="Name + license #" span />
      </Card>
      <NavRow onBack={onBack} onNext={onNext} nextLabel="Review &amp; finalize" />
    </div>
  );
}

function Step4({ city, permitType, form, onBack, onStartOver }) {
  const [copied, setCopied] = useState(false);
  const ptName = PERMIT_TYPES.find(p => p.id === permitType)?.name || permitType;
  const fv = k => form[k] || "";

  const preview = [
    `${city.displayName.toUpperCase()} — BUILDING PERMIT APPLICATION`,
    "=".repeat(52),
    `Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    `\nPERMIT TYPE: ${ptName.toUpperCase()}`,
    "\nAPPLICANT INFORMATION\n" + "-".repeat(21),
    `Name:    ${fv("name")}\nPhone:   ${fv("phone")}\nEmail:   ${fv("email")}`,
    "\nPROPERTY INFORMATION\n" + "-".repeat(20),
    `Address: ${fv("addr")}\nAPN:     ${fv("apn")}\nLot size: ${fv("lot") ? parseInt(fv("lot")).toLocaleString() + " sq ft" : ""}`,
    "\nPROJECT SCOPE\n" + "-".repeat(13),
    fv("desc"),
    `\nEstimated valuation: $${fv("val") ? parseInt(fv("val")).toLocaleString() : ""}\nContractor: ${fv("contractor")}\nArchitect / Engineer: ${fv("arch")}`,
    "\nSUBMISSION\n" + "-".repeat(10),
    `Submit to: ${city.submitEmail || "your local building department"}`,
    city.planningPhone ? `Phone: ${city.planningPhone}` : "",
    city.website ? `Website: ${city.website}` : "",
    city.codeUpdateNote ? `\n${city.codeUpdateNote}` : "",
    "\nFees are typically paid at time of submission. Verify current fee schedule with the building department.",
  ].filter(Boolean).join("\n");

  const copy = () => {
    navigator.clipboard.writeText(preview).catch(() => {
      const ta = document.createElement("textarea"); ta.value = preview;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    });
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const mailHref = `mailto:${city.submitEmail || ""}?subject=${encodeURIComponent(`Building Permit Application — ${ptName} — ${fv("addr")}, ${city.displayName}`)}&body=${encodeURIComponent(`Dear Building Department,\n\nPlease find attached my building permit application:\n\n${preview}\n\nThank you,\n${fv("name")}`)}`

  const contacts = [
    city.planningPhone && ["Building / Planning Dept", <a href={`tel:${city.planningPhone.replace(/\D/g,"")}`}>{city.planningPhone}</a>],
    city.submitEmail && ["Email submission", <a href={`mailto:${city.submitEmail}`}>{city.submitEmail}</a>],
    city.firePhone && ["Fire Protection District", <a href={`tel:${city.firePhone.replace(/\D/g,"")}`}>{city.firePhone}</a>],
    city.website && ["Official website", <a href={city.website} target="_blank">{city.website.replace("https://","")}</a>],
    city.portalUrl && ["Online permits", <a href={city.portalUrl} target="_blank">Apply online</a>],
    city.formsUrl && ["Forms & checklists", <a href={city.formsUrl} target="_blank">Download forms</a>],
  ].filter(Boolean);

  return (
    <div className="fade">
      <Alert type="ok" icon="ti-circle-check"><strong>Application ready!</strong> Review your summary, copy the draft, and submit to the local building department.</Alert>

      <Card title="Application summary" icon="ti-clipboard-list">
        <SummaryTable rows={[
          ["City", city.displayName], ["Permit type", ptName],
          ["Applicant", fv("name")], ["Phone", fv("phone")], ["Email", fv("email")],
          ["Address", fv("addr")], ["APN", fv("apn")],
          ["Lot size", fv("lot") ? parseInt(fv("lot")).toLocaleString() + " sq ft" : ""],
          ["Description", fv("desc")],
          ["Valuation", fv("val") ? "$" + parseInt(fv("val")).toLocaleString() : ""],
          ["Contractor", fv("contractor")], ["Architect / engineer", fv("arch")],
        ]} />
      </Card>

      <Card title="What happens next" icon="ti-clock-hour-4" sub={`Typical timeline for ${city.displayName}`}>
        <div className="tl">
          {(city.timeline || []).map((t, i) => (
            <div key={i} className="tli"><h4>{t.title}</h4><p>{t.desc}</p><span className="tlchip">{t.chip}</span></div>
          ))}
        </div>
      </Card>

      {city.portalNote && <Alert type="info" icon="ti-device-laptop">{city.portalNote}</Alert>}

      <Card title="Application draft" icon="ti-file-description" sub="Copy this text into your email alongside your attached PDF documents.">
        <pre className="prebox">{preview}</pre>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-p" onClick={copy}><Icon name="ti-copy" /> {copied ? "Copied!" : "Copy to clipboard"}</button>
          <a className="btn btn-s" href={mailHref}><Icon name="ti-mail" /> Open in email client</a>
          <button className="btn btn-g" onClick={() => window.print()}><Icon name="ti-printer" /> Print</button>
        </div>
      </Card>

      <Card title="Local contacts" icon="ti-map-pin">
        <SummaryTable rows={contacts.length ? contacts : [["Building Department", "Contact your local municipality."]]} />
      </Card>

      <div className="navrow">
        <button className="btn btn-g" onClick={onBack}><Icon name="ti-arrow-left" /> Edit application</button>
        <button className="btn btn-g" onClick={onStartOver}><Icon name="ti-refresh" /> Start over</button>
      </div>
    </div>
  );
}

// ─── ADD CITY MODAL ───────────────────────────────────────────────────────────
function AddCityModal({ onClose, onAdded, existingCities }) {
  const [query, setQuery]           = useState("");
  const [phase, setPhase]           = useState("idle");
  // phases: idle | checking | db_lookup | searching | extracting | saving | done | error
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMsg, setErrorMsg]     = useState("");
  const [previewCity, setPreviewCity] = useState(null);
  const [dbHit, setDbHit]           = useState(false); // true when found in Supabase
  const inputRef = useRef();

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);

  const busy = ["checking","db_lookup","searching","extracting","saving"].includes(phase);

  const PHASES = ["checking","db_lookup","searching","extracting","saving"];
  const PHASE_LABELS = {
    checking:   "Identifying city...",
    db_lookup:  "Checking permit database...",
    searching:  "Searching city permit pages...",
    extracting: "Structuring permit data...",
    saving:     "Saving to database...",
  };

  const lookup = async () => {
    const q = query.trim();
    if (!q || busy) return;
    setErrorMsg(""); setPreviewCity(null); setDbHit(false);

    // ── Phase 0: Canonicalise ────────────────────────────────────────────────
    setPhase("checking");
    let canonical;
    try {
      canonical = await canonicaliseCity(q);
    } catch (e) {
      setPhase("error"); setErrorMsg(e.message); return;
    }

    // Local duplicate check (already loaded in this session)
    const localDup = existingCities.find(c =>
      c.id === canonical.id ||
      c.displayName.toLowerCase() === canonical.displayName.toLowerCase()
    );
    if (localDup) {
      setPhase("done");
      setPreviewCity({ ...canonical, alreadyExists: true, existingId: localDup.id });
      return;
    }

    // ── Phase 1: Supabase lookup ─────────────────────────────────────────────
    setPhase("db_lookup");
    setProgressMsg(`Checking database for ${canonical.displayName}...`);
    try {
      const row = await sbGet(canonical.id);
      if (row) {
        // Found in DB — use immediately
        const cityObj = rowToCity(row);
        setDbHit(true);
        setPhase("done");
        setPreviewCity({ ...canonical, saved: true, fromDB: true });
        setTimeout(() => { onClose(); onAdded(cityObj); }, 900);
        return;
      }
    } catch (e) {
      // DB unreachable — log and continue to web search fallback
      console.warn("Supabase lookup failed, falling back to web search:", e.message);
    }

    // ── Phase 2: Web search ──────────────────────────────────────────────────
    setPreviewCity(canonical);
    setPhase("searching");
    setProgressMsg(`Searching permit pages for ${canonical.displayName}...`);
    let permitPayload;
    try {
      permitPayload = await fetchCityData(canonical, msg => {
        if (msg.includes("Searching")) { setPhase("searching"); }
        else if (msg.includes("Structuring")) { setPhase("extracting"); }
        setProgressMsg(msg);
      });
    } catch (e) {
      setPhase("error"); setErrorMsg(e.message); return;
    }

    // ── Phase 3: Build city object + save to Supabase ───────────────────────
    setPhase("saving");
    setProgressMsg(`Saving ${canonical.displayName} to database...`);
    const cityObj = {
      ...permitPayload,
      id:          canonical.id,
      name:        canonical.name,
      state:       canonical.state,
      displayName: canonical.displayName,
      builtin:     false,
      addedAt:     new Date().toISOString().split("T")[0],
    };

    // Save to Supabase — single source of truth
    try {
      await sbUpsert(cityObj);
    } catch (e) {
      console.warn("Supabase write failed (city added to session only):", e.message);
    }

    setPhase("done");
    setPreviewCity({ ...canonical, saved: true });
    setTimeout(() => { onClose(); onAdded(cityObj); }, 900);
  };

  const handleExistingSwitch = () => {
    const dup = existingCities.find(c => c.id === previewCity?.existingId);
    if (dup) { onClose(); onAdded(dup); }
    else onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1rem" }}>
          <h2 className="modal-title">Add a city</h2>
          <button className="btn btn-g" style={{ padding:"6px 10px" }} onClick={onClose} disabled={busy}>
            <Icon name="ti-x" />
          </button>
        </div>

        {/* Input — idle or error */}
        {(phase === "idle" || phase === "error") && (<>
          <p className="modal-sub">
            Enter any US city and state. We'll check our permit database first — if it's already there it loads instantly. Otherwise we'll research it and save it for everyone.
          </p>
          <div className="minput-row">
            <input ref={inputRef} value={query}
              onChange={e => { setQuery(e.target.value); setPhase("idle"); setErrorMsg(""); }}
              onKeyDown={e => e.key === "Enter" && !busy && lookup()}
              placeholder="City, State  e.g. Austin, TX" />
            <button className="btn btn-p" onClick={lookup}>Look up</button>
          </div>
          {phase === "error" && (
            <div className="mstatus error">
              <Icon name="ti-alert-circle" />
              <span>{errorMsg}</span>
            </div>
          )}
        </>)}

        {/* Progress tracker */}
        {busy && (
          <div style={{ padding:"1rem 0" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {PHASES.map(p => {
                const currentIdx = PHASES.indexOf(phase);
                const thisIdx    = PHASES.indexOf(p);
                const done   = thisIdx < currentIdx;
                const active = thisIdx === currentIdx;
                return (
                  <div key={p} style={{ display:"flex", alignItems:"center", gap:10, opacity: thisIdx > currentIdx ? 0.3 : 1, transition:"opacity .2s" }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                      background: done ? "var(--g600)" : active ? "var(--b600)" : "var(--n200)", transition:"background .2s" }}>
                      {done
                        ? <Icon name="ti-check" style={{ fontSize:11, color:"#fff" }} />
                        : active
                          ? <div style={{ width:10, height:10, border:"2px solid rgba(255,255,255,.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .7s linear infinite" }} />
                          : <div style={{ width:6, height:6, borderRadius:"50%", background:"#fff" }} />}
                    </div>
                    <span style={{ fontSize:13, fontWeight: active ? 600 : 400,
                      color: done ? "var(--g800)" : active ? "var(--b800)" : "var(--n400)", transition:"color .2s" }}>
                      {PHASE_LABELS[p]}
                    </span>
                    {/* DB hit badge on db_lookup step */}
                    {p === "db_lookup" && done && dbHit && (
                      <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:20, background:"var(--g50)", color:"var(--g600)" }}>
                        Found in DB
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {progressMsg && (
              <p style={{ fontSize:12, color:"var(--n400)", marginTop:12, fontWeight:300 }}>{progressMsg}</p>
            )}
          </div>
        )}

        {/* Already in local session */}
        {phase === "done" && previewCity?.alreadyExists && (
          <div style={{ padding:"1rem 0" }}>
            <div className="mstatus success" style={{ marginBottom:"1rem" }}>
              <Icon name="ti-circle-check" />
              <span><strong>{previewCity.displayName}</strong> is already loaded!</span>
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button className="btn btn-g" onClick={onClose}>Close</button>
              <button className="btn btn-p" onClick={handleExistingSwitch}>Switch to {previewCity.displayName}</button>
            </div>
          </div>
        )}

        {/* Loaded from DB or freshly saved */}
        {phase === "done" && previewCity?.saved && (
          <div className="mstatus success">
            <Icon name="ti-circle-check" />
            <span>
              {previewCity.fromDB
                ? <>Loaded <strong>{previewCity.displayName}</strong> from database — switching now...</>
                : <>Saved <strong>{previewCity.displayName}</strong> to database — switching now...</>}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, []);
  return <div className="toast-wrap"><div className="toast">{msg}</div></div>;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
const STEPS = ["Permit type", "Prerequisites", "Documents", "Application", "Submit"];
const BLANK_FORM = { name:"", phone:"", email:"", addr:"", apn:"", lot:"", desc:"", val:"", contractor:"", arch:"" };

// Built-ins are always authoritative — storage can never overwrite them
const BUILTINS = {
  [WOODSIDE.id]: WOODSIDE,
  [PORTOLA_VALLEY.id]: PORTOLA_VALLEY,
};

export default function App() {
  const [communityCities, setCommunityCities] = useState({});
  const [cityId, setCityId] = useState(WOODSIDE.id);
  const [step, setStep] = useState(0);
  const [permitType, setPermitType] = useState("");
  const [form, setForm] = useState(BLANK_FORM);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  // Merge: built-ins always win over any stored version with the same id
  const cities = { ...communityCities, ...BUILTINS };
  const city = cities[cityId] || WOODSIDE;

  // Startup: only load built-ins — community cities are fetched on demand
  useEffect(() => { setLoading(false); }, []);

  const allCities = Object.values(cities).sort((a, b) => {
    if (a.builtin && !b.builtin) return -1;
    if (!a.builtin && b.builtin) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  const goTo = n => { setStep(n); try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {} };

  const handleCityAdded = useCallback(data => {
    if (!BUILTINS[data.id]) {
      setCommunityCities(prev => ({ ...prev, [data.id]: data }));
    }
    setCityId(data.id);
    setPermitType("");
    setStep(0);
    setToast(data.displayName + " added!");
  }, []);

  const startOver = () => { setPermitType(""); setForm(BLANK_FORM); goTo(0); };

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 12 }}>
      <div className="bspin" />
      <p style={{ fontSize: 14, color: "var(--n600)", fontWeight: 300 }}>Loading saved cities...</p>
    </div>
  );

  return (
    <div style={{ position: "relative" }}>
      <style>{G}</style>

      {/* HEADER — no city bar here anymore */}
      <header className="hdr">
        <div className="hdr-inner">
          <div className="eyebrow">{city.displayName} — Permit Guide</div>
          <h1 className="htitle">Real Estate<br /><em>Permit Assistant</em></h1>
          <p className="hsub">Step-by-step guidance based on official municipal requirements</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6, fontFamily: "monospace", letterSpacing: "0.05em" }}>v{APP_VERSION}</p>
        </div>
      </header>

      {/* CITY SELECTOR PANEL */}
      <div className="city-panel">
        <div className="city-panel-inner">
          <div className="city-panel-top">
            <span className="city-panel-label">Select a city</span>
            <button className="add-chip" onClick={() => setShowModal(m => !m)}>
              <Icon name={showModal ? "ti-x" : "ti-plus"} />
              {showModal ? "Cancel" : "Add new city"}
            </button>
          </div>
          <div className="chips">
            {allCities.map(c => (
              <button key={c.id} className={`chip ${c.id === cityId ? "active" : ""}`}
                onClick={() => { setCityId(c.id); setPermitType(""); setStep(0); setShowModal(false); }}>
                <span className="chip-dot" />
                {c.displayName}
                <span className={`chip-badge ${c.builtin ? "builtin" : "community"}`}>
                  {c.builtin ? "Official" : "Community"}
                </span>
              </button>
            ))}
          </div>
          {showModal && (
            <AddCityModal
              onClose={() => setShowModal(false)}
              onAdded={handleCityAdded}
              existingCities={allCities}
            />
          )}
        </div>
      </div>

      {/* PROGRESS NAV */}
      <nav className="pnav">
        <div className="pnav-inner">
          {STEPS.map((label, i) => (
            <div key={i} className={`ptab ${i === step ? "active" : i < step ? "done" : ""}`} onClick={() => goTo(i)}>
              <span className="ptab-num">{String(i + 1).padStart(2, "0")}</span>
              <span className="ptab-lbl">{label}</span>
            </div>
          ))}
        </div>
      </nav>

      {/* STEPS */}
      <main className="main">
        {step === 0 && <Step0 city={city} permitType={permitType} onSelectPermit={setPermitType} onNext={() => goTo(1)} />}
        {step === 1 && <Step1 city={city} permitType={permitType} onBack={() => goTo(0)} onNext={() => goTo(2)} />}
        {step === 2 && <Step2 city={city} permitType={permitType} onBack={() => goTo(1)} onNext={() => goTo(3)} />}
        {step === 3 && <Step3 form={form} onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))} onBack={() => goTo(2)} onNext={() => goTo(4)} />}
        {step === 4 && <Step4 city={city} permitType={permitType} form={form} onBack={() => goTo(3)} onStartOver={startOver} />}
      </main>

      <footer className="ftr">
        <p>Educational guide based on official municipal requirements. Always verify with your local building department. Not legal advice.</p>
      </footer>

      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
