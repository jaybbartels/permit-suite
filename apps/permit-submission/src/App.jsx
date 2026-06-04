import React from "react";
import { useState, useEffect, useCallback } from "react";
import { getSession, getUser, signIn, signUp, signOut, saveSession } from "./auth.js";
import { dbSaveApplication, dbLoadApplications, dbLoadApplication, dbSaveDocument } from "./db.js";

// ── API proxy ─────────────────────────────────────────────────────────────────
const API = "/api/claude";
async function callClaude(payload) {
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", ...payload }),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: true, data };
  } catch { return { ok: false }; }
}
function extractText(data) {
  return (data?.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
}

// ── Permit catalogue (from permit_data in Supabase) ───────────────────────────
// Categories and sub-types
const PERMIT_CATEGORIES = [
  {
    id: "new-construction",
    label: "New Construction",
    icon: "🏗️",
    desc: "Build a new structure or dwelling",
    subTypes: [
      { id: "single-family", label: "Single Family Home" },
      { id: "adu-new", label: "New ADU (detached)" },
      { id: "garage", label: "New Garage" },
      { id: "accessory-structure", label: "Accessory Structure" },
    ]
  },
  {
    id: "addition-remodel",
    label: "Addition / Remodel",
    icon: "🔨",
    desc: "Expand or renovate existing structure",
    subTypes: [
      { id: "kitchen", label: "Kitchen Remodel" },
      { id: "bathroom", label: "Bathroom Remodel / Addition" },
      { id: "bedroom", label: "Bedroom Addition" },
      { id: "room-addition", label: "Room Addition" },
      { id: "whole-house", label: "Whole House Remodel" },
    ]
  },
  {
    id: "adu",
    label: "ADU",
    icon: "🏠",
    desc: "Accessory dwelling unit",
    subTypes: [
      { id: "detached", label: "Detached ADU" },
      { id: "attached", label: "Attached ADU" },
      { id: "garage-conversion", label: "Garage Conversion ADU" },
      { id: "jadu", label: "Junior ADU (JADU)" },
    ]
  },
  {
    id: "fence-gate-wall",
    label: "Fence / Gate / Wall",
    icon: "🚧",
    desc: "Boundary and entry structures",
    subTypes: [
      { id: "fence", label: "Fence" },
      { id: "gate", label: "Gate" },
      { id: "retaining-wall", label: "Retaining Wall" },
    ]
  },
  {
    id: "pool-spa",
    label: "Pool / Spa",
    icon: "🏊",
    desc: "New pool or large remodel",
    subTypes: [
      { id: "pool", label: "Swimming Pool" },
      { id: "spa", label: "Spa / Hot Tub" },
      { id: "pool-spa", label: "Pool + Spa Combo" },
    ]
  },
  {
    id: "mep",
    label: "MEP Work",
    icon: "⚡",
    desc: "Mechanical / electrical / plumbing",
    subTypes: [
      { id: "electrical", label: "Electrical" },
      { id: "plumbing", label: "Plumbing" },
      { id: "mechanical-hvac", label: "HVAC / Mechanical" },
      { id: "solar", label: "Solar Installation" },
      { id: "ev-charger", label: "EV Charger" },
    ]
  },
];

// ── Styles ────────────────────────────────────────────────────────────────────
const C = {
  navy:   "#0F2942",
  blue:   "#1B4F82",
  sky:    "#2E86C1",
  light:  "#EBF5FB",
  gray:   "#F4F6F7",
  border: "#D5D8DC",
  text:   "#1A252F",
  muted:  "#7F8C8D",
  green:  "#1E8449",
  red:    "#C0392B",
  orange: "#E67E22",
};

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: ${C.gray}; color: ${C.text}; }
  input, textarea, select {
    font-family: inherit; font-size: 14px; color: ${C.text};
    border: 1.5px solid ${C.border}; border-radius: 6px;
    padding: 9px 12px; width: 100%; outline: none;
    transition: border-color 0.15s;
    background: #fff;
  }
  input:focus, textarea:focus, select:focus { border-color: ${C.sky}; }
  button { font-family: inherit; cursor: pointer; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  .fadeUp { animation: fadeUp 0.3s ease; }
`;

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ size = 16, color = C.sky }) {
  return (
    <span style={{ display:"inline-block", width:size, height:size, border:`2px solid ${color}33`, borderTopColor:color, borderRadius:"50%", animation:"spin 0.7s linear infinite", flexShrink:0 }} />
  );
}

// ── Button ────────────────────────────────────────────────────────────────────
function Btn({ children, onClick, disabled, variant="primary", size="md", loading, style:sx }) {
  const base = { display:"flex", alignItems:"center", gap:6, border:"none", borderRadius:6, fontWeight:600, cursor:disabled?"not-allowed":"pointer", transition:"all 0.15s", opacity:disabled?0.55:1 };
  const variants = {
    primary:   { background: C.navy, color: "#fff", padding: size==="sm"?"7px 14px":"11px 22px", fontSize: size==="sm"?12:14 },
    secondary: { background: "#fff", color: C.navy, border:`1.5px solid ${C.border}`, padding: size==="sm"?"6px 14px":"10px 22px", fontSize: size==="sm"?12:14 },
    danger:    { background: C.red, color: "#fff", padding: size==="sm"?"7px 14px":"11px 22px", fontSize: size==="sm"?12:14 },
    ghost:     { background: "transparent", color: C.sky, padding: size==="sm"?"7px 14px":"11px 22px", fontSize: size==="sm"?12:14 },
  };
  return (
    <button onClick={disabled||loading?undefined:onClick} style={{...base,...variants[variant],...sx}}>
      {loading && <Spinner size={14} color={variant==="primary"?"#fff":C.sky} />}
      {children}
    </button>
  );
}

// ── Auth Modal ────────────────────────────────────────────────────────────────
function AuthModal({ onAuth, allowGuest, onGuest }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) return;
    setLoading(true); setError("");
    try {
      if (mode === "login") await signIn(email, password);
      else await signUp(email, password);
      onAuth();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight:"100vh", background:C.navy, display:"flex", alignItems:"center", justifyContent:"center", padding:"1rem" }}>
      <div style={{ background:"#fff", borderRadius:12, padding:"2.5rem", width:"100%", maxWidth:420, boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:"2rem" }}>
          <div style={{ fontSize:28, marginBottom:8 }}>🏛️</div>
          <h1 style={{ fontSize:22, fontWeight:700, color:C.navy, marginBottom:4 }}>Permit Assistant</h1>
          <p style={{ fontSize:13, color:C.muted }}>Step-by-step permit guidance</p>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:`1.5px solid ${C.border}`, marginBottom:"1.5rem" }}>
          {["login","signup"].map(m => (
            <button key={m} onClick={()=>{setMode(m);setError("");}}
              style={{ flex:1, padding:"10px 0", border:"none", background:"none", fontWeight:600, fontSize:14, cursor:"pointer",
                color: mode===m ? C.navy : C.muted,
                borderBottom: mode===m ? `2.5px solid ${C.navy}` : "2.5px solid transparent",
                marginBottom:-1.5 }}>
              {m==="login" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" onKeyDown={e=>e.key==="Enter"&&handleSubmit()} />
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" onKeyDown={e=>e.key==="Enter"&&handleSubmit()} />
          {error && <p style={{ fontSize:12, color:C.red, background:"#FDEDEC", padding:"8px 12px", borderRadius:6 }}>{error}</p>}
          <Btn onClick={handleSubmit} loading={loading} disabled={!email.trim()||!password.trim()}>
            {mode==="login" ? "Sign in" : "Create account"}
          </Btn>
        </div>

        {allowGuest && (
          <>
            <div style={{ textAlign:"center", margin:"1rem 0", fontSize:12, color:C.muted }}>or</div>
            <Btn variant="secondary" onClick={onGuest} style={{ width:"100%", justifyContent:"center" }}>
              Continue as guest
              <span style={{ fontSize:11, color:C.muted, fontWeight:400 }}>(progress not saved)</span>
            </Btn>
          </>
        )}
      </div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────
const STEPS = ["Property", "Permit Type", "Prerequisites", "Documents", "Application", "Submit"];

function StepBar({ current, completed }) {
  return (
    <div style={{ display:"flex", alignItems:"center", padding:"0 2rem", overflowX:"auto" }}>
      {STEPS.map((label, i) => {
        const done = completed.includes(i);
        const active = current === i;
        return (
          <div key={i} style={{ display:"flex", alignItems:"center", flexShrink:0 }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <div style={{
                width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:12, fontWeight:700,
                background: done ? C.green : active ? C.navy : "#fff",
                color: done||active ? "#fff" : C.muted,
                border: `2px solid ${done ? C.green : active ? C.navy : C.border}`,
              }}>
                {done ? "✓" : i+1}
              </div>
              <span style={{ fontSize:11, fontWeight: active?600:400, color: active?C.navy:C.muted, whiteSpace:"nowrap" }}>{label}</span>
            </div>
            {i < STEPS.length-1 && (
              <div style={{ width:40, height:2, background: done ? C.green : C.border, margin:"0 4px", marginBottom:18, flexShrink:0 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 0: Property lookup ───────────────────────────────────────────────────
function StepProperty({ app, onUpdate, onNext }) {
  const [input, setInput]     = useState(app.address || app.apn || "");
  const [loading, setLoading] = useState(false);
  const [found, setFound]     = useState(!!app.owner_name);
  const [error, setError]     = useState("");

  async function lookup() {
    if (!input.trim()) return;
    setLoading(true); setError(""); setFound(false);
    const result = await callClaude({
      max_tokens: 600,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: `You are a property data lookup assistant. Search for the property and return ONLY JSON:
{"owner_name":"string","address":"full address","apn":"parcel number","city":"city name","state":"CA","zip":"zipcode","lot_size_sqft":number_or_null,"zoning":"string","year_built":number_or_null,"bedrooms":number_or_null,"bathrooms":number_or_null,"sqft":number_or_null}
If any field is unknown use null. No markdown, no explanation.`,
      messages: [{ role:"user", content:`Look up property: ${input}\nSearch county assessor records, Zillow, Redfin, or public property records.` }]
    });
    if (result.ok) {
      const text = extractText(result.data);
      try {
        const clean = text.replace(/```json|```/g,"").trim();
        const start = clean.indexOf("{"); const end = clean.lastIndexOf("}");
        const d = JSON.parse(clean.slice(start, end+1));
        onUpdate({
          address: d.address || input,
          apn: d.apn || "",
          city: (d.city||"").toLowerCase().replace(/\s+/g,"-") + "-" + (d.state||"ca").toLowerCase(),
          city_display: `${d.city||""}, ${d.state||"CA"}`,
          owner_name: d.owner_name || "",
          parcel_data: d,
        });
        setFound(true);
      } catch {
        setError("Could not parse property data. Please fill in manually.");
      }
    } else {
      setError("Lookup failed. Please fill in manually.");
    }
    setLoading(false);
  }

  return (
    <div className="fadeUp">
      <h2 style={{ fontSize:20, fontWeight:700, color:C.navy, marginBottom:6 }}>Property & Applicant</h2>
      <p style={{ fontSize:13, color:C.muted, marginBottom:"1.5rem" }}>Enter your property address or APN to auto-fill details.</p>

      {/* Lookup input */}
      <div style={{ display:"flex", gap:8, marginBottom:"1.5rem" }}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&lookup()}
          placeholder="123 Main St, Woodside, CA 94062  —  or —  APN: 075-123-456" style={{ flex:1 }} />
        <Btn onClick={lookup} loading={loading} disabled={!input.trim()}>
          {loading ? "Looking up…" : "Look up"}
        </Btn>
      </div>

      {error && <p style={{ fontSize:13, color:C.red, marginBottom:"1rem" }}>{error}</p>}

      {/* Property details */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:"1.5rem" }}>
        <div style={{ gridColumn:"1/-1" }}>
          <label style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", display:"block", marginBottom:5 }}>Property Address *</label>
          <input value={app.address||""} onChange={e=>onUpdate({address:e.target.value})} placeholder="Full property address" />
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", display:"block", marginBottom:5 }}>APN</label>
          <input value={app.apn||""} onChange={e=>onUpdate({apn:e.target.value})} placeholder="000-000-000" />
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", display:"block", marginBottom:5 }}>City</label>
          <input value={app.city_display||""} onChange={e=>onUpdate({city_display:e.target.value})} placeholder="Woodside, CA" />
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", display:"block", marginBottom:5 }}>Owner / Applicant Name *</label>
          <input value={app.owner_name||""} onChange={e=>onUpdate({owner_name:e.target.value})} placeholder="Full legal name" />
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", display:"block", marginBottom:5 }}>Email (optional)</label>
          <input type="email" value={app.email||""} onChange={e=>onUpdate({email:e.target.value})} placeholder="your@email.com" />
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", display:"block", marginBottom:5 }}>Phone (optional)</label>
          <input type="tel" value={app.phone||""} onChange={e=>onUpdate({phone:e.target.value})} placeholder="(650) 000-0000" />
        </div>
      </div>

      {/* Parcel summary if found */}
      {found && app.parcel_data && (
        <div style={{ background:C.light, border:`1px solid ${C.sky}33`, borderRadius:8, padding:"1rem", marginBottom:"1.5rem", fontSize:13 }}>
          <p style={{ fontWeight:600, color:C.navy, marginBottom:6 }}>✓ Property data found</p>
          <div style={{ display:"flex", gap:24, flexWrap:"wrap", color:C.muted }}>
            {app.parcel_data.zoning && <span>Zoning: <strong style={{color:C.text}}>{app.parcel_data.zoning}</strong></span>}
            {app.parcel_data.lot_size_sqft && <span>Lot: <strong style={{color:C.text}}>{Number(app.parcel_data.lot_size_sqft).toLocaleString()} sqft</strong></span>}
            {app.parcel_data.year_built && <span>Built: <strong style={{color:C.text}}>{app.parcel_data.year_built}</strong></span>}
            {app.parcel_data.sqft && <span>Home: <strong style={{color:C.text}}>{Number(app.parcel_data.sqft).toLocaleString()} sqft</strong></span>}
          </div>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"flex-end" }}>
        <Btn onClick={onNext} disabled={!app.address||!app.owner_name}>
          Next: Permit Type →
        </Btn>
      </div>
    </div>
  );
}

// ── Step 1: Permit type + sub-type ────────────────────────────────────────────
function StepPermitType({ app, onUpdate, onNext, onBack }) {
  const cat = PERMIT_CATEGORIES.find(c => c.id === app.permit_category);

  return (
    <div className="fadeUp">
      <h2 style={{ fontSize:20, fontWeight:700, color:C.navy, marginBottom:6 }}>What type of permit do you need?</h2>
      <p style={{ fontSize:13, color:C.muted, marginBottom:"1.5rem" }}>
        Select the category that best describes your project. Each type has tailored requirements for {app.city_display || "your city"}.
      </p>

      {/* Category grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:10, marginBottom:"1.5rem" }}>
        {PERMIT_CATEGORIES.map(c => (
          <button key={c.id} onClick={()=>onUpdate({permit_category:c.id, permit_sub_type:"", permit_display:""})}
            style={{
              padding:"1rem", borderRadius:8, textAlign:"left", cursor:"pointer",
              border: app.permit_category===c.id ? `2px solid ${C.navy}` : `1.5px solid ${C.border}`,
              background: app.permit_category===c.id ? C.light : "#fff",
              transition:"all 0.15s",
            }}>
            <div style={{ fontSize:24, marginBottom:6 }}>{c.icon}</div>
            <div style={{ fontSize:13, fontWeight:600, color:C.navy, marginBottom:3 }}>{c.label}</div>
            <div style={{ fontSize:11, color:C.muted, lineHeight:1.4 }}>{c.desc}</div>
          </button>
        ))}
      </div>

      {/* Sub-type dropdown */}
      {cat && (
        <div style={{ marginBottom:"1.5rem" }}>
          <label style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", display:"block", marginBottom:5 }}>
            Specific type of {cat.label}
          </label>
          <select value={app.permit_sub_type||""} onChange={e=>{
            const sub = cat.subTypes.find(s=>s.id===e.target.value);
            onUpdate({ permit_sub_type:e.target.value, permit_display: sub ? `${cat.label} — ${sub.label}` : "" });
          }}>
            <option value="">Select specific type…</option>
            {cat.subTypes.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      )}

      {app.permit_display && (
        <div style={{ background:C.light, border:`1px solid ${C.sky}33`, borderRadius:8, padding:"0.75rem 1rem", marginBottom:"1.5rem", fontSize:13, color:C.navy, fontWeight:500 }}>
          ✓ Selected: {app.permit_display}
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <Btn variant="secondary" onClick={onBack}>← Back</Btn>
        <Btn onClick={onNext} disabled={!app.permit_category||!app.permit_sub_type}>
          Next: Prerequisites →
        </Btn>
      </div>
    </div>
  );
}

// ── Step 2: Prerequisites ─────────────────────────────────────────────────────
function StepPrerequisites({ app, onUpdate, onNext, onBack }) {
  const [loading, setLoading] = useState(!app.prerequisites?.length);
  const [chatOpen, setChatOpen] = useState(null);
  const [chatMsg, setChatMsg]   = useState("");
  const [chatReply, setChatReply] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    if (app.prerequisites?.length) { setLoading(false); return; }
    loadPrerequisites();
  }, []);

  async function loadPrerequisites() {
    setLoading(true);
    const result = await callClaude({
      max_tokens: 1200,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: `You are a permit specialist. Return ONLY a JSON array of prerequisites for this permit application:
[{"id":"string","category":"string","text":"string","description":"string","required":true/false,"code_ref":"string or null","plain_english":"1 sentence plain English summary"}]
Include 6-10 items covering zoning, eligibility, environmental, setbacks, etc. No markdown.`,
      messages: [{ role:"user", content:`Prerequisites for: ${app.permit_display} in ${app.city_display}\nProperty address: ${app.address}\nZoning: ${app.parcel_data?.zoning || "unknown"}` }]
    });
    if (result.ok) {
      const text = extractText(result.data);
      try {
        const clean = text.replace(/```json|```/g,"").trim();
        const s = clean.indexOf("["); const e = clean.lastIndexOf("]");
        const items = JSON.parse(clean.slice(s, e+1));
        onUpdate({ prerequisites: items.map(i=>({...i, checked:false, notes:""})) });
      } catch {
        onUpdate({ prerequisites: getDefaultPrereqs(app.permit_category) });
      }
    } else {
      onUpdate({ prerequisites: getDefaultPrereqs(app.permit_category) });
    }
    setLoading(false);
  }

  async function askQuestion(prereqId) {
    if (!chatMsg.trim()) return;
    setChatLoading(true);
    const prereq = app.prerequisites.find(p=>p.id===prereqId);
    const result = await callClaude({
      max_tokens: 400,
      system: "You are a permit specialist. Answer the applicant's question about this prerequisite in 2-3 sentences. Be specific and practical.",
      messages: [{ role:"user", content:`Prerequisite: ${prereq.text}\nCity: ${app.city_display}\nPermit: ${app.permit_display}\nQuestion: ${chatMsg}` }]
    });
    if (result.ok) setChatReply(extractText(result.data));
    setChatLoading(false);
  }

  function toggleCheck(id) {
    const updated = app.prerequisites.map(p => p.id===id ? {...p, checked:!p.checked} : p);
    onUpdate({ prerequisites: updated });
  }

  const allRequired = app.prerequisites?.filter(p=>p.required) || [];
  const allChecked = allRequired.every(p=>p.checked);

  return (
    <div className="fadeUp">
      <h2 style={{ fontSize:20, fontWeight:700, color:C.navy, marginBottom:6 }}>Project prerequisites</h2>
      <p style={{ fontSize:13, color:C.muted, marginBottom:"1.5rem" }}>
        Verify each item before preparing your application. Check off as you confirm them.
      </p>

      {loading ? (
        <div style={{ textAlign:"center", padding:"3rem", color:C.muted }}>
          <Spinner size={24} />
          <p style={{ marginTop:12, fontSize:13 }}>Loading prerequisites for {app.permit_display}…</p>
        </div>
      ) : (
        <>
          <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:"1.5rem" }}>
            {(app.prerequisites||[]).map(p => (
              <div key={p.id} style={{ background:"#fff", border:`1.5px solid ${p.checked ? C.green : C.border}`, borderRadius:8, padding:"1rem", transition:"border-color 0.15s" }}>
                <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                  <input type="checkbox" checked={p.checked||false} onChange={()=>toggleCheck(p.id)}
                    style={{ width:18, height:18, marginTop:2, flexShrink:0, accentColor:C.navy, cursor:"pointer" }} />
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, flexWrap:"wrap" }}>
                      <span style={{ fontSize:14, fontWeight:600, color:C.text }}>{p.text}</span>
                      <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                        {p.code_ref && <span style={{ fontSize:10, padding:"2px 8px", borderRadius:4, background:"#EBF5FB", color:C.sky, fontWeight:600 }}>§ Code</span>}
                        <span style={{ fontSize:10, padding:"2px 8px", borderRadius:4, background: p.required?"#FDEDEC":"#EAFAF1", color: p.required?C.red:C.green, fontWeight:600 }}>{p.required?"Required":"If applicable"}</span>
                      </div>
                    </div>
                    {p.description && <p style={{ fontSize:12, color:C.muted, marginTop:4, lineHeight:1.5 }}>{p.description}</p>}
                    {p.plain_english && <p style={{ fontSize:12, color:C.sky, marginTop:4, fontStyle:"italic" }}>💡 {p.plain_english}</p>}
                    
                    {/* Q&A toggle */}
                    <button onClick={()=>{ setChatOpen(chatOpen===p.id?null:p.id); setChatMsg(""); setChatReply(""); }}
                      style={{ fontSize:11, color:C.sky, background:"none", border:"none", cursor:"pointer", marginTop:6, padding:0, fontWeight:600 }}>
                      {chatOpen===p.id ? "▲ Hide Q&A" : "▼ Ask a question about this"}
                    </button>

                    {chatOpen===p.id && (
                      <div style={{ marginTop:10, background:C.gray, borderRadius:6, padding:"0.75rem" }}>
                        <div style={{ display:"flex", gap:8 }}>
                          <input value={chatMsg} onChange={e=>setChatMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&askQuestion(p.id)}
                            placeholder="Ask about this requirement…" style={{ flex:1, fontSize:12, padding:"7px 10px" }} />
                          <Btn size="sm" onClick={()=>askQuestion(p.id)} loading={chatLoading} disabled={!chatMsg.trim()}>Ask</Btn>
                        </div>
                        {chatReply && <p style={{ fontSize:12, color:C.text, marginTop:8, lineHeight:1.6 }}>{chatReply}</p>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!allChecked && (
            <div style={{ background:"#FEF9E7", border:`1px solid ${C.orange}33`, borderRadius:6, padding:"0.75rem 1rem", fontSize:12, color:C.orange, marginBottom:"1rem" }}>
              ⚠️ Please check off all required prerequisites before proceeding.
            </div>
          )}
        </>
      )}

      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <Btn variant="secondary" onClick={onBack}>← Back</Btn>
        <Btn onClick={onNext} disabled={loading || !allChecked}>
          Next: Documents →
        </Btn>
      </div>
    </div>
  );
}

// ── Step 3: Documents ─────────────────────────────────────────────────────────
function StepDocuments({ app, onUpdate, onNext, onBack, userId }) {
  const [loading, setLoading] = useState(!app.documents?.length);
  const [uploading, setUploading] = useState(null);

  useEffect(() => {
    if (app.documents?.length) { setLoading(false); return; }
    loadDocuments();
  }, []);

  async function loadDocuments() {
    setLoading(true);
    const result = await callClaude({
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: `You are a permit specialist. Return ONLY a JSON array of required documents:
[{"id":"string","name":"string","description":"string","required":true/false,"notes":"string"}]
Include 5-10 documents specific to this permit type. No markdown.`,
      messages: [{ role:"user", content:`Required documents for: ${app.permit_display} in ${app.city_display}` }]
    });
    if (result.ok) {
      const text = extractText(result.data);
      try {
        const clean = text.replace(/```json|```/g,"").trim();
        const s = clean.indexOf("["); const e = clean.lastIndexOf("]");
        const items = JSON.parse(clean.slice(s, e+1));
        onUpdate({ documents: items.map(i=>({...i, checked:false, storage_path:null, file_name:null})) });
      } catch {
        onUpdate({ documents: getDefaultDocuments(app.permit_category) });
      }
    } else {
      onUpdate({ documents: getDefaultDocuments(app.permit_category) });
    }
    setLoading(false);
  }

  function toggleCheck(id) {
    const updated = app.documents.map(d => d.id===id ? {...d, checked:!d.checked} : d);
    onUpdate({ documents: updated });
  }

  async function handleUpload(docId, file) {
    setUploading(docId);
    const path = await dbSaveDocument({ applicationId: app.id, userId, docId, file });
    if (path) {
      const updated = app.documents.map(d => d.id===docId ? {...d, checked:true, storage_path:path, file_name:file.name} : d);
      onUpdate({ documents: updated });
    }
    setUploading(null);
  }

  const required = app.documents?.filter(d=>d.required) || [];
  const allChecked = required.every(d=>d.checked);

  return (
    <div className="fadeUp">
      <h2 style={{ fontSize:20, fontWeight:700, color:C.navy, marginBottom:6 }}>Required documents</h2>
      <p style={{ fontSize:13, color:C.muted, marginBottom:"1.5rem" }}>
        Gather and check off each item. Upload files where available.
      </p>

      {loading ? (
        <div style={{ textAlign:"center", padding:"3rem", color:C.muted }}>
          <Spinner size={24} />
          <p style={{ marginTop:12, fontSize:13 }}>Loading document requirements…</p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:"1.5rem" }}>
          {(app.documents||[]).map(doc => (
            <div key={doc.id} style={{ background:"#fff", border:`1.5px solid ${doc.checked?C.green:C.border}`, borderRadius:8, padding:"1rem" }}>
              <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                <input type="checkbox" checked={doc.checked||false} onChange={()=>toggleCheck(doc.id)}
                  style={{ width:18, height:18, marginTop:2, flexShrink:0, accentColor:C.navy, cursor:"pointer" }} />
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, flexWrap:"wrap" }}>
                    <span style={{ fontSize:14, fontWeight:600, color:C.text }}>{doc.name}</span>
                    <span style={{ fontSize:10, padding:"2px 8px", borderRadius:4, background: doc.required?"#FDEDEC":"#EAFAF1", color: doc.required?C.red:C.green, fontWeight:600 }}>
                      {doc.required?"Required":"Optional"}
                    </span>
                  </div>
                  {doc.description && <p style={{ fontSize:12, color:C.muted, marginTop:4, lineHeight:1.5 }}>{doc.description}</p>}
                  {doc.notes && <p style={{ fontSize:11, color:C.sky, marginTop:4 }}>ℹ️ {doc.notes}</p>}
                  
                  {/* Upload */}
                  <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:8 }}>
                    {doc.file_name ? (
                      <span style={{ fontSize:11, color:C.green }}>✓ {doc.file_name}</span>
                    ) : (
                      <label style={{ fontSize:11, color:C.sky, cursor:"pointer", display:"flex", alignItems:"center", gap:4, fontWeight:600 }}>
                        {uploading===doc.id ? <><Spinner size={12}/> Uploading…</> : "📎 Upload file"}
                        <input type="file" style={{ display:"none" }} onChange={e=>e.target.files[0]&&handleUpload(doc.id,e.target.files[0])} />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <Btn variant="secondary" onClick={onBack}>← Back</Btn>
        <Btn onClick={onNext} disabled={loading||!allChecked}>
          Next: Application →
        </Btn>
      </div>
    </div>
  );
}

// ── Step 4: Application details ───────────────────────────────────────────────
function StepApplication({ app, onUpdate, onNext, onBack }) {
  return (
    <div className="fadeUp">
      <h2 style={{ fontSize:20, fontWeight:700, color:C.navy, marginBottom:6 }}>Application information</h2>
      <p style={{ fontSize:13, color:C.muted, marginBottom:"1.5rem" }}>
        Enter your project details to complete the application.
      </p>

      <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:"1.5rem" }}>
        <div style={{ borderBottom:`1.5px solid ${C.border}`, paddingBottom:12 }}>
          <p style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Applicant & Contact</p>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>Owner / Applicant Name</label>
              <input value={app.owner_name||""} onChange={e=>onUpdate({owner_name:e.target.value})} placeholder="Full legal name" />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>Phone</label>
              <input value={app.phone||""} onChange={e=>onUpdate({phone:e.target.value})} placeholder="(650) 000-0000" />
            </div>
            <div style={{ gridColumn:"1/-1" }}>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>Email</label>
              <input type="email" value={app.email||""} onChange={e=>onUpdate({email:e.target.value})} placeholder="your@email.com" />
            </div>
          </div>
        </div>

        <div style={{ borderBottom:`1.5px solid ${C.border}`, paddingBottom:12 }}>
          <p style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Property Information</p>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div style={{ gridColumn:"1/-1" }}>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>Property Address</label>
              <input value={app.address||""} onChange={e=>onUpdate({address:e.target.value})} placeholder="123 Main Street, Woodside, CA 94062" />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>APN</label>
              <input value={app.apn||""} onChange={e=>onUpdate({apn:e.target.value})} placeholder="000-000-000" />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>Lot Size (sq ft)</label>
              <input type="number" value={app.parcel_data?.lot_size_sqft||""} onChange={e=>onUpdate({parcel_data:{...app.parcel_data,lot_size_sqft:e.target.value}})} placeholder="e.g. 43560" />
            </div>
          </div>
        </div>

        <div>
          <p style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Project Scope</p>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>Project Description *</label>
              <textarea value={app.project_description||""} onChange={e=>onUpdate({project_description:e.target.value})}
                placeholder="Describe the full scope of work — include square footage, number of stories, materials, and any demolition…"
                style={{ minHeight:100, resize:"vertical" }} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>Estimated Project Value ($)</label>
                <input type="number" value={app.estimated_value||""} onChange={e=>onUpdate({estimated_value:e.target.value})} placeholder="e.g. 250000" />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>Licensed Contractor (if known)</label>
                <input value={app.contractor||""} onChange={e=>onUpdate({contractor:e.target.value})} placeholder="Company name + CA license #" />
              </div>
              <div style={{ gridColumn:"1/-1" }}>
                <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:5 }}>Architect / Engineer (if applicable)</label>
                <input value={app.architect||""} onChange={e=>onUpdate({architect:e.target.value})} placeholder="Name + CA license #" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <Btn variant="secondary" onClick={onBack}>← Back</Btn>
        <Btn onClick={onNext} disabled={!app.project_description}>
          Next: Review & Submit →
        </Btn>
      </div>
    </div>
  );
}

// ── Step 5: Review & Submit ───────────────────────────────────────────────────
function StepSubmit({ app, onSubmit, onBack, submitting, submitted }) {
  if (submitted) {
    return (
      <div className="fadeUp" style={{ textAlign:"center", padding:"2rem 0" }}>
        <div style={{ fontSize:48, marginBottom:"1rem" }}>🎉</div>
        <h2 style={{ fontSize:22, fontWeight:700, color:C.green, marginBottom:8 }}>Application Submitted!</h2>
        <p style={{ fontSize:14, color:C.muted, marginBottom:"1.5rem" }}>Your permit application has been submitted successfully.</p>
        <div style={{ background:C.light, border:`1px solid ${C.sky}33`, borderRadius:8, padding:"1.5rem", display:"inline-block", marginBottom:"1.5rem" }}>
          <p style={{ fontSize:11, color:C.muted, marginBottom:4 }}>Tracking Number</p>
          <p style={{ fontSize:28, fontWeight:700, color:C.navy, letterSpacing:"0.1em" }}>{app.tracking_number}</p>
        </div>
        <p style={{ fontSize:13, color:C.muted }}>Save this number to track your application status.</p>
      </div>
    );
  }

  return (
    <div className="fadeUp">
      <h2 style={{ fontSize:20, fontWeight:700, color:C.navy, marginBottom:6 }}>Review & Submit</h2>
      <p style={{ fontSize:13, color:C.muted, marginBottom:"1.5rem" }}>Review your application before submitting.</p>

      <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:"1.5rem" }}>
        {[
          { label:"Property", items:[
            ["Address", app.address],
            ["APN", app.apn],
            ["Owner", app.owner_name],
            ["City", app.city_display],
          ]},
          { label:"Permit", items:[
            ["Type", app.permit_display],
          ]},
          { label:"Project", items:[
            ["Description", app.project_description],
            ["Est. Value", app.estimated_value ? `$${Number(app.estimated_value).toLocaleString()}` : null],
            ["Contractor", app.contractor],
          ]},
          { label:"Documents", items:[
            ["Checked", `${app.documents?.filter(d=>d.checked).length||0} of ${app.documents?.length||0}`],
            ["Uploaded", `${app.documents?.filter(d=>d.file_name).length||0} files`],
          ]},
        ].map(section => (
          <div key={section.label} style={{ background:"#fff", border:`1.5px solid ${C.border}`, borderRadius:8, overflow:"hidden" }}>
            <div style={{ background:C.gray, padding:"8px 14px", fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>{section.label}</div>
            <div style={{ padding:"10px 14px" }}>
              {section.items.filter(([,v])=>v).map(([k,v]) => (
                <div key={k} style={{ display:"flex", gap:12, fontSize:13, marginBottom:6 }}>
                  <span style={{ color:C.muted, minWidth:100 }}>{k}</span>
                  <span style={{ color:C.text, flex:1 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background:"#FEF9E7", border:`1px solid ${C.orange}33`, borderRadius:6, padding:"0.75rem 1rem", fontSize:12, color:"#856404", marginBottom:"1.5rem" }}>
        ℹ️ This is an educational tool. Verify all requirements directly with your city's planning department before submitting official applications.
      </div>

      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <Btn variant="secondary" onClick={onBack}>← Back</Btn>
        <Btn onClick={onSubmit} loading={submitting}>
          Submit Application ✓
        </Btn>
      </div>
    </div>
  );
}

// ── Default data fallbacks ────────────────────────────────────────────────────
function getDefaultPrereqs(category) {
  return [
    { id:"p1", category:"Zoning", text:"Confirm zoning classification", description:"Verify your parcel's zoning allows this type of project.", required:true, plain_english:"Check your zoning allows this use.", checked:false },
    { id:"p2", category:"Eligibility", text:"Confirm lot eligibility", description:"Verify lot size, coverage, and setback requirements.", required:true, plain_english:"Make sure your lot meets size requirements.", checked:false },
    { id:"p3", category:"Environmental", text:"Determine if CEQA review applies", description:"Most small residential projects qualify for categorical exemptions.", required:true, plain_english:"Check if an environmental review is needed.", checked:false },
    { id:"p4", category:"Utilities", text:"Confirm utility service availability", description:"Water, sewer, gas, and electrical connections must be available.", required:true, plain_english:"Make sure utilities can serve the new space.", checked:false },
  ];
}

function getDefaultDocuments(category) {
  return [
    { id:"d1", name:"Completed Building Permit Application", description:"Download from city website.", required:true, checked:false, storage_path:null, file_name:null },
    { id:"d2", name:"Site Plan", description:"Show property lines, setbacks, and proposed improvements.", required:true, checked:false, storage_path:null, file_name:null },
    { id:"d3", name:"Floor Plans and Elevations", description:"Show square footage, room layout, and ceiling heights.", required:true, checked:false, storage_path:null, file_name:null },
    { id:"d4", name:"Structural Calculations", description:"Stamped by a licensed CA structural engineer.", required:true, checked:false, storage_path:null, file_name:null },
    { id:"d5", name:"Title 24 Energy Compliance", description:"Required for all new construction.", required:true, checked:false, storage_path:null, file_name:null },
  ];
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user,       setUser]       = useState(null);
  const [authReady,  setAuthReady]  = useState(false);
  const [step,       setStep]       = useState(0);
  const [completed,  setCompleted]  = useState([]);
  const [app,        setApp]        = useState({});
  const [saving,     setSaving]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [myApps,     setMyApps]     = useState([]);
  const [showList,   setShowList]   = useState(false);

  // Check session on load
  useEffect(() => {
    const u = getUser();
    setUser(u);
    setAuthReady(true);
    if (u) loadMyApps(u.id);
  }, []);

  async function loadMyApps(userId) {
    const apps = await dbLoadApplications(userId);
    setMyApps(apps || []);
  }

  function updateApp(updates) {
    setApp(prev => ({ ...prev, ...updates }));
  }

  async function saveProgress(updates = {}) {
    if (!user) return;
    setSaving(true);
    const merged = { ...app, ...updates, current_step: step, user_id: user.id };
    const saved = await dbSaveApplication(merged);
    if (saved?.id) updateApp({ id: saved.id });
    setSaving(false);
  }

  async function goNext() {
    setCompleted(prev => [...new Set([...prev, step])]);
    await saveProgress({ current_step: step + 1 });
    setStep(s => s + 1);
    window.scrollTo(0, 0);
  }

  function goBack() {
    setStep(s => s - 1);
    window.scrollTo(0, 0);
  }

  async function handleSubmit() {
    setSubmitting(true);
    const tracking = generateTracking();
    const final = { ...app, status:"submitted", tracking_number:tracking, submitted_at:new Date().toISOString() };
    await dbSaveApplication({ ...final, user_id:user.id });
    updateApp({ tracking_number:tracking, status:"submitted" });
    setSubmitted(true);
    setSubmitting(false);
  }

  function generateTracking() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const rand = n => Array.from({length:n}, ()=>chars[Math.floor(Math.random()*chars.length)]).join("");
    return `${rand(3)}-${rand(4)}`;
  }

  async function handleAuth() {
    const u = getUser();
    setUser(u);
    if (u) loadMyApps(u.id);
  }

  async function handleSignOut() {
    await signOut();
    setUser(null);
    setApp({});
    setStep(0);
    setCompleted([]);
    setSubmitted(false);
  }

  function resumeApp(savedApp) {
    setApp(savedApp);
    setStep(savedApp.current_step || 0);
    const done = [];
    for (let i = 0; i < (savedApp.current_step||0); i++) done.push(i);
    setCompleted(done);
    setShowList(false);
  }

  // ── Not logged in ───────────────────────────────────────────────────────────
  if (!authReady) return null;
  if (!user) return <AuthModal onAuth={handleAuth} allowGuest={false} />;

  // ── My Applications list ────────────────────────────────────────────────────
  if (showList) {
    return (
      <div style={{ minHeight:"100vh", background:C.gray }}>
        <style>{css}</style>
        <Header user={user} onSignOut={handleSignOut} saving={saving} onMyApps={()=>setShowList(false)} onNew={()=>{setApp({});setStep(0);setCompleted([]);setSubmitted(false);setShowList(false);}} showBack />
        <div style={{ maxWidth:700, margin:"2rem auto", padding:"0 1rem" }}>
          <h2 style={{ fontSize:20, fontWeight:700, color:C.navy, marginBottom:"1.5rem" }}>My Applications</h2>
          {myApps.length === 0 ? (
            <div style={{ background:"#fff", borderRadius:10, padding:"3rem", textAlign:"center", color:C.muted, fontSize:14 }}>
              No applications yet. Start a new one!
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {myApps.map(a => (
                <div key={a.id} style={{ background:"#fff", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"1rem 1.25rem", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
                  <div>
                    <p style={{ fontWeight:600, fontSize:14, color:C.navy }}>{a.address||"No address"}</p>
                    <p style={{ fontSize:12, color:C.muted, marginTop:3 }}>{a.permit_display||"No permit type"} · {a.city_display||""}</p>
                    {a.tracking_number && <p style={{ fontSize:11, color:C.green, marginTop:3 }}>✓ {a.tracking_number}</p>}
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:a.status==="submitted"?"#EAFAF1":"#EBF5FB", color:a.status==="submitted"?C.green:C.sky, fontWeight:600 }}>{a.status}</span>
                    {a.status !== "submitted" && <Btn size="sm" onClick={()=>resumeApp(a)}>Resume →</Btn>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main wizard ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:C.gray }}>
      <style>{css}</style>
      <Header user={user} onSignOut={handleSignOut} saving={saving} onMyApps={()=>{loadMyApps(user.id);setShowList(true);}} onNew={()=>{setApp({});setStep(0);setCompleted([]);setSubmitted(false);}} />

      {/* Step bar */}
      <div style={{ background:C.navy, padding:"1rem 0" }}>
        <div style={{ maxWidth:860, margin:"0 auto" }}>
          <StepBar current={step} completed={completed} />
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth:760, margin:"2rem auto", padding:"0 1rem" }}>
        <div style={{ background:"#fff", borderRadius:12, padding:"2rem", boxShadow:"0 2px 12px rgba(0,0,0,0.06)" }}>
          {step===0 && <StepProperty app={app} onUpdate={updateApp} onNext={goNext} />}
          {step===1 && <StepPermitType app={app} onUpdate={updateApp} onNext={goNext} onBack={goBack} />}
          {step===2 && <StepPrerequisites app={app} onUpdate={updateApp} onNext={goNext} onBack={goBack} />}
          {step===3 && <StepDocuments app={app} onUpdate={updateApp} onNext={goNext} onBack={goBack} userId={user?.id} />}
          {step===4 && <StepApplication app={app} onUpdate={updateApp} onNext={goNext} onBack={goBack} />}
          {step===5 && <StepSubmit app={app} onSubmit={handleSubmit} onBack={goBack} submitting={submitting} submitted={submitted} />}
        </div>
      </div>

      <footer style={{ textAlign:"center", padding:"2rem 1rem", fontSize:11, color:C.muted, lineHeight:1.6 }}>
        This is an educational guide. Verify all requirements directly with your city's planning department.<br/>
        Not legal advice.
      </footer>
    </div>
  );
}

function Header({ user, onSignOut, saving, onMyApps, onNew, showBack }) {
  return (
    <div style={{ background:C.navy, borderBottom:`1px solid ${C.blue}`, padding:"1rem 1.5rem", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
      <div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:20 }}>🏛️</span>
          <div>
            <span style={{ fontSize:18, fontWeight:700, color:"#fff" }}>Permit Assistant</span>
            <span style={{ fontSize:11, color:"#8EACC9", display:"block", marginTop:-2 }}>Step-by-step permit guidance</span>
          </div>
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        {saving && <span style={{ fontSize:11, color:"#8EACC9", display:"flex", alignItems:"center", gap:4 }}><Spinner size={12} color="#8EACC9"/>Saving…</span>}
        <Btn size="sm" variant="ghost" onClick={onMyApps} style={{ color:"#8EACC9" }}>My Applications</Btn>
        <Btn size="sm" variant="ghost" onClick={onNew} style={{ color:"#8EACC9" }}>+ New</Btn>
        <span style={{ fontSize:12, color:"#8EACC9" }}>{user?.email}</span>
        <Btn size="sm" variant="secondary" onClick={onSignOut} style={{ fontSize:11 }}>Sign out</Btn>
      </div>
    </div>
  );
}
