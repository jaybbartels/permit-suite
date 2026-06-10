import React, { useState, useEffect, useCallback } from "react";
import { getUser, signIn, signUp, signOut, authHeadersAsync } from "./auth.js";
import { 
  dbGetQueue, dbGetApplication, dbUpdateApplicationStatus,
  dbGetComments, dbPostComment, dbSaveAIReview, dbGetAIReview,
  dbGetPropertyHistory, dbSavePropertyHistory,
  dbGetCodeLookup, dbSaveCodeLookup, dbGetProfile, dbSaveProfile
} from "./db.js";

// ── API proxy ─────────────────────────────────────────────────────────────────
const API = (import.meta.env.VITE_API_URL || "https://permit-suite-api.vercel.app") + "/api/claude";
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
function tryJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); } catch {}
  const s = clean.indexOf("{"); const e = clean.lastIndexOf("}");
  if (s >= 0 && e > s) try { return JSON.parse(clean.slice(s, e+1)); } catch {}
  const a = clean.indexOf("["); const b = clean.lastIndexOf("]");
  if (a >= 0 && b > a) try { return JSON.parse(clean.slice(a, b+1)); } catch {}
  return null;
}

// ── Colors ────────────────────────────────────────────────────────────────────
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
  yellow: "#F39C12",
  purple: "#7D3C98",
};

const STATUS_COLORS = {
  draft:      { bg:"#F4F6F7", fg:C.muted },
  submitted:  { bg:"#EBF5FB", fg:C.sky },
  in_review:  { bg:"#FEF9E7", fg:C.orange },
  corrections:{ bg:"#FDEBD0", fg:"#784212" },
  approved:   { bg:"#EAFAF1", fg:C.green },
  rejected:   { bg:"#FDEDEC", fg:C.red },
};

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: ${C.gray}; color: ${C.text}; }
  input, textarea, select { font-family: inherit; font-size: 13px; color: ${C.text}; border: 1.5px solid ${C.border}; border-radius: 6px; padding: 8px 12px; width: 100%; outline: none; transition: border-color 0.15s; background: #fff; }
  input:focus, textarea:focus, select:focus { border-color: ${C.sky}; }
  button { font-family: inherit; cursor: pointer; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  .fadeUp { animation: fadeUp 0.25s ease; }
  ::-webkit-scrollbar { width: 6px; } 
  ::-webkit-scrollbar-track { background: #f0f0f0; }
  ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
`;

// ── Components ────────────────────────────────────────────────────────────────
function Spinner({ size=16, color=C.sky }) {
  return <span style={{ display:"inline-block", width:size, height:size, border:`2px solid ${color}33`, borderTopColor:color, borderRadius:"50%", animation:"spin 0.7s linear infinite", flexShrink:0 }} />;
}

function Btn({ children, onClick, disabled, variant="primary", size="md", loading, style:sx }) {
  const v = {
    primary:   { background:C.navy, color:"#fff" },
    secondary: { background:"#fff", color:C.navy, border:`1.5px solid ${C.border}` },
    success:   { background:C.green, color:"#fff" },
    danger:    { background:C.red, color:"#fff" },
    warning:   { background:C.orange, color:"#fff" },
    ghost:     { background:"transparent", color:C.sky },
  };
  const p = size==="sm" ? "6px 12px" : "9px 18px";
  const fs = size==="sm" ? 12 : 13;
  return (
    <button onClick={disabled||loading?undefined:onClick}
      style={{ display:"flex", alignItems:"center", gap:6, border:"none", borderRadius:6, fontWeight:600, cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.5:1, padding:p, fontSize:fs, transition:"opacity 0.15s", ...v[variant], ...sx }}>
      {loading && <Spinner size={13} color={variant==="primary"||variant==="success"||variant==="danger"?"#fff":C.sky} />}
      {children}
    </button>
  );
}

function StatusBadge({ status }) {
  const sc = STATUS_COLORS[status] || { bg:C.gray, fg:C.muted };
  return <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:sc.bg, color:sc.fg, fontWeight:600, whiteSpace:"nowrap" }}>{status?.replace("_"," ")}</span>;
}

function Card({ children, style:sx }) {
  return <div style={{ background:"#fff", borderRadius:10, border:`1.5px solid ${C.border}`, ...sx }}>{children}</div>;
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom:"1rem" }}>
      <h2 style={{ fontSize:17, fontWeight:700, color:C.navy }}>{title}</h2>
      {subtitle && <p style={{ fontSize:12, color:C.muted, marginTop:3 }}>{subtitle}</p>}
    </div>
  );
}

// ── Auth Modal ────────────────────────────────────────────────────────────────
function AuthModal({ onAuth }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!email.trim() || !password.trim()) return;
    setLoading(true); setError("");
    try {
      await signIn(email, password);
      onAuth();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight:"100vh", background:C.navy, display:"flex", alignItems:"center", justifyContent:"center", padding:"1rem" }}>
      <div style={{ background:"#fff", borderRadius:12, padding:"2.5rem", width:"100%", maxWidth:400, boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ textAlign:"center", marginBottom:"2rem" }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🏛️</div>
          <h1 style={{ fontSize:22, fontWeight:700, color:C.navy }}>Government Portal</h1>
          <p style={{ fontSize:12, color:C.muted, marginTop:4 }}>Permit Review & Processing</p>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Government email" onKeyDown={e=>e.key==="Enter"&&handleLogin()} />
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" onKeyDown={e=>e.key==="Enter"&&handleLogin()} />
          {error && <p style={{ fontSize:12, color:C.red, background:"#FDEDEC", padding:"8px 12px", borderRadius:6 }}>{error}</p>}
          <Btn onClick={handleLogin} loading={loading} disabled={!email.trim()||!password.trim()}>Sign in to Portal</Btn>
        </div>
        <p style={{ fontSize:11, color:C.muted, textAlign:"center", marginTop:"1.5rem" }}>Government staff access only. Contact your administrator for credentials.</p>
      </div>
    </div>
  );
}

// ── Queue View ────────────────────────────────────────────────────────────────
function QueueView({ user, onSelect, cityFilter, setCityFilter, department }) {
  const [apps, setApps]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("all");
  const [search, setSearch]   = useState("");

  useEffect(() => { loadQueue(); }, [filter, cityFilter, department?.id]);

  async function loadQueue() {
    setLoading(true);
    const data = await dbGetQueue({ status: filter === "all" ? null : filter, city: cityFilter });
    let apps = data || [];

    // For non-overall departments, filter to only permits assigned to this dept
    if (department && department.id !== 'overall') {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "https://permit-suite-api.vercel.app";
        const hdrs = await authHeadersAsync();
        const res = await fetch(`${API_URL}/api/review/queue?department=${department.id}`, { headers: hdrs });
        if (res.ok) {
          const { applicationIds } = await res.json();
          apps = apps.filter(a => applicationIds.includes(a.id));
        }
      } catch {}
    }

    setApps(apps);
    setLoading(false);
  }

  const filtered = apps.filter(a => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (a.address||"").toLowerCase().includes(s) ||
           (a.owner_name||"").toLowerCase().includes(s) ||
           (a.tracking_number||"").toLowerCase().includes(s) ||
           (a.permit_display||"").toLowerCase().includes(s);
  });

  const counts = apps.reduce((acc, a) => { acc[a.status] = (acc[a.status]||0)+1; return acc; }, {});

  function daysSince(date) {
    return Math.floor((Date.now() - new Date(date)) / 86400000);
  }

  return (
    <div className="fadeUp">
      {/* Stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:"1.5rem" }}>
        {[
          { label:"Submitted", key:"submitted", color:C.sky },
          { label:"In Review", key:"in_review", color:C.orange },
          { label:"Corrections", key:"corrections", color:"#784212" },
          { label:"Approved", key:"approved", color:C.green },
        ].map(s => (
          <Card key={s.key} style={{ padding:"1rem", cursor:"pointer", border: filter===s.key?`2px solid ${s.color}`:`1.5px solid ${C.border}` }} onClick={()=>setFilter(f=>f===s.key?"all":s.key)}>
            <p style={{ fontSize:24, fontWeight:700, color:s.color }}>{counts[s.key]||0}</p>
            <p style={{ fontSize:11, color:C.muted, marginTop:3 }}>{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Department context banner */}
      {department && department.id !== 'overall' && (
        <div style={{background:'#EBF5FB',border:'1px solid #2E86C1',borderRadius:8,padding:'10px 14px',marginBottom:'1rem',fontSize:13,color:'#1B4F82',display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:18}}>{department.icon}</span>
          <span>Showing permits assigned to <strong>{department.label}</strong></span>
        </div>
      )}

      {/* Filters */}
      <div style={{ display:"flex", gap:10, marginBottom:"1rem", flexWrap:"wrap" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search address, name, tracking #…" style={{ flex:1, minWidth:200 }} />
        <select value={cityFilter} onChange={e=>setCityFilter(e.target.value)} style={{ width:"auto", minWidth:160 }}>
          <option value="">All cities</option>
          <option value="woodside-ca">Woodside, CA</option>
          <option value="portola-valley-ca">Portola Valley, CA</option>
          <option value="atherton-ca">Atherton, CA</option>
        </select>
        <select value={filter} onChange={e=>setFilter(e.target.value)} style={{ width:"auto", minWidth:140 }}>
          <option value="all">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="in_review">In Review</option>
          <option value="corrections">Corrections</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <Btn size="sm" variant="secondary" onClick={loadQueue}>↻ Refresh</Btn>
      </div>

      {/* Queue table */}
      {loading ? (
        <div style={{ textAlign:"center", padding:"3rem", color:C.muted }}><Spinner size={24}/><p style={{marginTop:12,fontSize:13}}>Loading queue…</p></div>
      ) : filtered.length === 0 ? (
        <Card style={{ padding:"3rem", textAlign:"center", color:C.muted, fontSize:14 }}>
          No applications found.
        </Card>
      ) : (
        <Card>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ background:C.gray, borderBottom:`1.5px solid ${C.border}` }}>
                {["Tracking","Address","Permit Type","Applicant","City","Status","Age","Action"].map(h => (
                  <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => {
                const age = daysSince(a.submitted_at || a.created_at);
                const urgent = age > 14 && a.status !== "approved" && a.status !== "rejected";
                return (
                  <tr key={a.id} style={{ borderBottom:`1px solid ${C.border}`, background: i%2===0?"#fff":"#FAFAFA", cursor:"pointer" }}
                    onClick={() => onSelect(a)}>
                    <td style={{ padding:"10px 12px", fontWeight:600, color:C.navy, whiteSpace:"nowrap" }}>{a.tracking_number||"—"}</td>
                    <td style={{ padding:"10px 12px", maxWidth:200 }}>
                      <div style={{ fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.address||"No address"}</div>
                    </td>
                    <td style={{ padding:"10px 12px", color:C.muted, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.permit_display||"—"}</td>
                    <td style={{ padding:"10px 12px", whiteSpace:"nowrap" }}>{a.owner_name||"—"}</td>
                    <td style={{ padding:"10px 12px", whiteSpace:"nowrap", color:C.muted }}>{a.city_display||"—"}</td>
                    <td style={{ padding:"10px 12px" }}><StatusBadge status={a.status} /></td>
                    <td style={{ padding:"10px 12px", whiteSpace:"nowrap", color: urgent?C.red:C.muted, fontWeight:urgent?700:400 }}>{age}d {urgent?"⚠️":""}</td>
                    <td style={{ padding:"10px 12px" }}>
                      <Btn size="sm" variant="secondary" onClick={e=>{e.stopPropagation();onSelect(a);}}>Review →</Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ── Review Panel ──────────────────────────────────────────────────────────────
const ALL_DEPTS = [
  { id:'planning',             label:'Planning' },
  { id:'building',             label:'Building' },
  { id:'engineering',          label:'Engineering' },
  { id:'fire',                 label:'Woodside Fire' },
  { id:'geologist',            label:'Town Geologist' },
  { id:'environmental_health', label:'San Mateo County Environmental Health' },
  { id:'asrb',                 label:'Architecture and Site Review Board' },
];

function ReviewPanel({ appId, user, department, onBack, onStatusChange }) {
  const [app,           setApp]          = useState(null);
  const [loading,       setLoading]      = useState(true);
  const [comments,      setComments]     = useState([]);
  const [newComment,    setNewComment]   = useState("");
  const [isCorrection,  setIsCorrection] = useState(false);
  const [isInternal,    setIsInternal]   = useState(false);
  const [postingComment,setPostingComment] = useState(false);
  const [aiReview,      setAIReview]     = useState(null);
  const [aiLoading,     setAILoading]    = useState(false);
  const [history,       setHistory]      = useState([]);
  const [histLoading,   setHistLoading]  = useState(false);
  const [activeTab,     setActiveTab]    = useState("application");
  const [updating,      setUpdating]     = useState(false);
  const [reviews,        setReviews]       = useState([]);
  const [assignedDepts,  setAssignedDepts] = useState([]);
  const [assigning,      setAssigning]     = useState(false);
  const [deptComment,    setDeptComment]   = useState("");
  const [deptReviews,    setDeptReviews]   = useState([]);
  const [postingDept,    setPostingDept]   = useState(false);
  const [isCorrectDept,  setIsCorrectDept] = useState(false);
  const [reviewComments, setReviewComments] = useState([]);
  const [applicantResponses, setApplicantResponses] = useState([]);
  const [analysis,          setAnalysis]          = useState(null);
  const [analysisLoading,   setAnalysisLoading]   = useState(false);
  const [issuedReport,   setIssuedReport]   = useState(null);
  const API_URL = import.meta.env.VITE_API_URL || "https://permit-suite-api.vercel.app";

  useEffect(() => { loadAll(); }, [appId]);
  useEffect(() => { if (appId) loadReviewStatus(); }, [appId]);

  async function loadAll() {
    setLoading(true);
    const [appData, commData, aiData] = await Promise.all([
      dbGetApplication(appId),
      dbGetComments(appId),
      dbGetAIReview(appId),
    ]);
    setApp(appData);
    setComments(commData || []);
    if (aiData) setAIReview(aiData);
    setLoading(false);
    // Also load review comments and issued report from new API
    loadReviewComments();
    loadIssuedReport();
  }

  async function loadReviewComments() {
    try {
      const hdrs = await authHeadersAsync();
      const [commRes, respRes] = await Promise.all([
        fetch(`${API_URL}/api/review/comments?application_id=${appId}`, { headers: hdrs }),
        fetch(`${API_URL}/api/review/responses?application_id=${appId}`, { headers: hdrs }),
      ]);
      if (commRes.ok) {
        const { comments: c } = await commRes.json();
        setReviewComments(c || []);
      }
      if (respRes.ok) {
        const { responses: r } = await respRes.json();
        setApplicantResponses(r || []);
      }
    } catch (e) { console.error('loadReviewComments error:', e); }
  }

  async function loadHistory() {
    if (!app?.address) return;
    setHistLoading(true);
    // Check cache first
    const cached = await dbGetPropertyHistory(app.address_key || app.address);
    if (cached?.length) { setHistory(cached); setHistLoading(false); return; }
    // Live lookup
    const result = await callClaude({
      max_tokens: 1000,
      tools: [{ type:"web_search_20250305", name:"web_search" }],
      system: `You are a permit records researcher. Search for all building permits, planning applications, and code enforcement for this property. Return ONLY JSON array:
[{"permit_number":"string","permit_type":"string","description":"string","status":"string","issued_date":"YYYY-MM-DD or null","completed_date":"YYYY-MM-DD or null","valuation":number_or_null}]
No markdown. If none found return [].`,
      messages: [{ role:"user", content:`Search all permit history for: ${app.address}\nAPN: ${app.apn||"unknown"}\nCity: ${app.city_display}` }]
    });
    if (result.ok) {
      const parsed = tryJSON(extractText(result.data));
      const items = Array.isArray(parsed) ? parsed : [];
      setHistory(items);
      if (items.length) await dbSavePropertyHistory(app.address_key||app.address, app.apn, items);
    }
    setHistLoading(false);
  }

  async function runAIReview() {
    if (!app) return;
    setAILoading(true);
    setActiveTab("ai");

    // Fetch code lookups from cache or live
    const codeResult = await callClaude({
      max_tokens: 2000,
      tools: [{ type:"web_search_20250305", name:"web_search" }],
      system: `You are a permit compliance specialist. Review this permit application and return ONLY JSON:
{
  "completeness_score": 0-100,
  "compliance_flags": [{"severity":"high|medium|low","code_ref":"string","description":"string","recommendation":"string"}],
  "history_conflicts": [{"description":"string","severity":"high|medium|low"}],
  "similar_precedents": [{"summary":"string","decision":"approved|rejected|corrections"}],
  "recommendation": "approve|corrections|reject|escalate",
  "confidence_score": 0-100,
  "summary": "2-3 sentence overall assessment"
}
Search for applicable city, county, and state codes. Be thorough and specific.`,
      messages: [{ role:"user", content:`Review this permit application:

Property: ${app.address}
City: ${app.city_display}
APN: ${app.apn||"unknown"}
Zoning: ${app.parcel_data?.zoning||"unknown"}
Lot Size: ${app.parcel_data?.lot_size_sqft||"unknown"} sqft

Permit Type: ${app.permit_display}
Project Description: ${app.project_description}
Estimated Value: $${app.estimated_value||"unknown"}

Prerequisites checked: ${(app.prerequisites||[]).filter(p=>p.checked).length} of ${(app.prerequisites||[]).length}
Documents checked: ${(app.documents||[]).filter(d=>d.checked).length} of ${(app.documents||[]).length}
Documents uploaded: ${(app.documents||[]).filter(d=>d.file_name).length}

Prior permit history: ${history.length > 0 ? JSON.stringify(history.slice(0,5)) : "Not yet loaded"}

Check: 1) Document completeness 2) Code compliance for city/county/state 3) Consistency with prior permits 4) Any red flags` }]
    });

    if (codeResult.ok) {
      const parsed = tryJSON(extractText(codeResult.data));
      if (parsed) {
        const saved = await dbSaveAIReview({ applicationId:appId, userId:user.id, review:parsed });
        setAIReview(saved || parsed);
      }
    }
    setAILoading(false);
  }

  async function postComment() {
    if (!newComment.trim()) return;
    setPostingComment(true);
    const comment = await dbPostComment({
      applicationId: appId,
      authorId: user.id,
      authorRole: "government_reviewer",
      authorName: user.email,
      content: newComment,
      isCorrection,
      isInternal,
    });
    if (comment) {
      setComments(prev => [...prev, comment]);
      setNewComment("");
      setIsCorrection(false);
      setIsInternal(false);
    }
    setPostingComment(false);
  }

  async function updateStatus(newStatus) {
    setUpdating(true);
    await dbUpdateApplicationStatus(appId, newStatus);
    setApp(prev => ({ ...prev, status: newStatus }));
    onStatusChange && onStatusChange(appId, newStatus);
    setUpdating(false);
  }

  if (loading) return <div style={{ textAlign:"center", padding:"4rem" }}><Spinner size={32}/></div>;
  if (!app) return <div style={{ padding:"2rem", color:C.red }}>Application not found.</div>;

  const ALL_DEPTS = [
    { id:'planning',             label:'Planning' },
    { id:'building',             label:'Building' },
    { id:'engineering',          label:'Engineering' },
    { id:'fire',                 label:'Woodside Fire' },
    { id:'geologist',            label:'Town Geologist' },
    { id:'environmental_health', label:'San Mateo County EH' },
    { id:'asrb',                 label:'ASRB' },
  ];

  async function loadReviewStatus() {
    try {
      const hdrs = await authHeadersAsync();
      const res = await fetch(`${API_URL}/api/review/status?application_id=${appId}`, { headers: hdrs });
      if (res.ok) {
        const { reviews: r } = await res.json();
        setReviews(r || []);
        setAssignedDepts(r?.map(rv => rv.department) || []);
      }
    } catch {}
  }

  async function handleAssignDepts(depts) {
    setAssigning(true);
    try {
      const hdrs = await authHeadersAsync();
      await fetch(`${API_URL}/api/review/assign`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ application_id: appId, departments: depts }),
      });
      setAssignedDepts(depts);
      await loadReviewStatus();
    } catch {} finally { setAssigning(false); }
  }

  async function handleDeptComment() {
    if (!deptComment.trim() || !department) return;
    setPostingDept(true);
    try {
      const hdrs = await authHeadersAsync();
      const res = await fetch(`${API_URL}/api/review/comments`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({
          application_id: appId,
          department: department.id,
          content: deptComment,
          reviewer_name: user.email,
          is_correction: isCorrectDept,
        }),
      });
      if (res.ok) {
        setDeptComment('');
        setIsCorrectDept(false);
        await loadDeptComments();
      }
    } catch {} finally { setPostingDept(false); }
  }

  async function loadIssuedReport() {
    try {
      const hdrs = await authHeadersAsync();
      const res = await fetch(`${API_URL}/api/review/report?application_id=${appId}`, { headers: hdrs });
      if (res.ok) {
        const { report } = await res.json();
        setIssuedReport(report);
      }
    } catch {}
  }

  async function loadAnalysis() {
    if (analysis) return; // already loaded
    setAnalysisLoading(true);
    try {
      const hdrs = await authHeadersAsync();
      const res = await fetch(`${API_URL}/api/permit/analyze`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({
          application_id: appId,
          permit_type: app?.permit_category || 'addition-remodel',
          sub_type: app?.permit_sub_type || '',
          address: app?.address || '',
          city: app?.city_display?.split(',')[0]?.trim() || app?.parcel_data?.city || 'Woodside',
          state: app?.parcel_data?.state || 'CA',
          form_data: {
            project_valuation: app?.estimated_value || 0,
            square_footage: app?.parcel_data?.sqft || 0,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data);
      }
    } catch {} finally { setAnalysisLoading(false); }
  }

  async function loadDeptComments() {
    try {
      const hdrs = await authHeadersAsync();
      const deptId = department?.id;
      if (!deptId) return;
      const res = await fetch(`${API_URL}/api/review/comments?application_id=${appId}&department=${deptId}`, { headers: hdrs });
      if (res.ok) {
        const { comments: c } = await res.json();
        setDeptReviews(c || []);
      }
    } catch {}
  }

  async function handleIssueReport() {
    try {
      const hdrs = await authHeadersAsync();
      const res = await fetch(`${API_URL}/api/review/report`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ application_id: appId, issued_by_name: user.email }),
      });
      if (res.ok) {
        await loadIssuedReport();
        setActiveTab('viewreport');
      }
    } catch {}
  }

  const isOverall = department?.id === 'overall';
  const deptId = department?.id;

  const TABS = [
    { id:"application", label:"Application" },
    ...(isOverall ? [
      { id:"assign",   label:"Assign Depts" + (assignedDepts.length ? ` (${assignedDepts.length})` : '') },
      { id:"allcomments", label:`All Comments (${reviewComments.length})` },
      { id:"report",   label:"Issue Report" },
      { id:"viewreport", label:"View Report" + (issuedReport ? " ✓" : "") },
      { id:"analyze",    label:"Fee & Precedents" },
    ] : [
      { id:"deptreview", label:`${department?.label || 'Dept'} Review` },
    ]),
    { id:"ai",      label:"AI Review" + (aiReview ? " ✓" : "") },
    { id:"history", label:"Property History" },
  ];

  return (
    <div className="fadeUp">
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"1.5rem", flexWrap:"wrap", gap:10 }}>
        <div>
          <button onClick={onBack} style={{ background:"none", border:"none", color:C.sky, fontSize:13, cursor:"pointer", fontWeight:600, marginBottom:6, padding:0 }}>← Back to Queue</button>
          <h2 style={{ fontSize:18, fontWeight:700, color:C.navy }}>{app.address}</h2>
          <p style={{ fontSize:13, color:C.muted, marginTop:3 }}>{app.permit_display} · {app.city_display} · Tracking: <strong>{app.tracking_number}</strong></p>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <StatusBadge status={app.status} />
          {app.status === "submitted" && <Btn size="sm" variant="warning" onClick={()=>updateStatus("in_review")} loading={updating}>Start Review</Btn>}
          {app.status === "in_review" && <>
            <Btn size="sm" variant="secondary" onClick={()=>updateStatus("corrections")} loading={updating}>Request Corrections</Btn>
            <Btn size="sm" variant="danger" onClick={()=>updateStatus("rejected")} loading={updating}>Reject</Btn>
            <Btn size="sm" variant="success" onClick={()=>updateStatus("approved")} loading={updating}>Approve ✓</Btn>
          </>}
          {app.status === "corrections" && <>
            <Btn size="sm" variant="warning" onClick={()=>updateStatus("in_review")} loading={updating}>Back to Review</Btn>
            <Btn size="sm" variant="success" onClick={()=>updateStatus("approved")} loading={updating}>Approve ✓</Btn>
          </>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:`1.5px solid ${C.border}`, marginBottom:"1.5rem", gap:0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>{ setActiveTab(t.id); if(t.id==="history"&&!history.length) loadHistory(); if(t.id==="deptreview") loadDeptComments(); if(t.id==="allcomments"||t.id==="assign") loadReviewStatus(); if(t.id==="analyze") loadAnalysis(); }}
            style={{ padding:"10px 18px", border:"none", background:"none", cursor:"pointer", fontSize:13, fontWeight:activeTab===t.id?600:400,
              color:activeTab===t.id?C.navy:C.muted,
              borderBottom:activeTab===t.id?`2.5px solid ${C.navy}`:"2.5px solid transparent",
              marginBottom:-1.5 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Application tab */}
      {activeTab==="application" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1.5rem" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
            <Card style={{ padding:"1.25rem" }}>
              <p style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Property</p>
              {[["Address",app.address],["APN",app.apn],["City",app.city_display],["Zoning",app.parcel_data?.zoning],["Lot Size",app.parcel_data?.lot_size_sqft?`${Number(app.parcel_data.lot_size_sqft).toLocaleString()} sqft`:null]].filter(([,v])=>v).map(([k,v])=>(
                <div key={k} style={{ display:"flex", gap:12, fontSize:13, marginBottom:8 }}>
                  <span style={{ color:C.muted, minWidth:80 }}>{k}</span>
                  <span style={{ color:C.text, fontWeight:500 }}>{v}</span>
                </div>
              ))}
            </Card>
            <Card style={{ padding:"1.25rem" }}>
              <p style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Applicant</p>
              {[["Name",app.owner_name],["Email",app.email],["Phone",app.phone]].filter(([,v])=>v).map(([k,v])=>(
                <div key={k} style={{ display:"flex", gap:12, fontSize:13, marginBottom:8 }}>
                  <span style={{ color:C.muted, minWidth:80 }}>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </Card>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
            <Card style={{ padding:"1.25rem" }}>
              <p style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Project</p>
              <p style={{ fontSize:13, fontWeight:600, color:C.navy, marginBottom:8 }}>{app.permit_display}</p>
              <p style={{ fontSize:13, color:C.text, lineHeight:1.6, marginBottom:8 }}>{app.project_description}</p>
              {app.estimated_value && <p style={{ fontSize:13, color:C.muted }}>Est. Value: <strong style={{color:C.text}}>${Number(app.estimated_value).toLocaleString()}</strong></p>}
              {app.contractor && <p style={{ fontSize:13, color:C.muted, marginTop:4 }}>Contractor: <strong style={{color:C.text}}>{app.contractor}</strong></p>}
            </Card>
            <Card style={{ padding:"1.25rem" }}>
              <p style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Documents ({(app.documents||[]).filter(d=>d.checked).length}/{(app.documents||[]).length})</p>
              {(app.documents||[]).map(d => (
                <div key={d.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6, fontSize:13 }}>
                  <span style={{ color: d.checked?C.text:C.muted }}>{d.checked?"✓":"○"} {d.name}</span>
                  {d.file_name && <span style={{ fontSize:11, color:C.sky }}>📎 {d.file_name}</span>}
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}

      {/* AI Review tab */}
      {activeTab==="ai" && (
        <div>
          {!aiReview && !aiLoading && (
            <Card style={{ padding:"2rem", textAlign:"center" }}>
              <p style={{ fontSize:14, color:C.muted, marginBottom:"1rem" }}>Run an AI pre-review to check completeness, code compliance, and property history.</p>
              <Btn onClick={runAIReview}>
                🤖 Run AI Pre-Review
              </Btn>
              <p style={{ fontSize:11, color:C.muted, marginTop:8 }}>Searches city, county, and state codes. Takes ~30 seconds.</p>
            </Card>
          )}

          {aiLoading && (
            <Card style={{ padding:"3rem", textAlign:"center" }}>
              <Spinner size={32} />
              <p style={{ marginTop:"1rem", fontSize:13, color:C.muted }}>AI is reviewing permit application, checking codes, and searching property history…</p>
            </Card>
          )}

          {aiReview && !aiLoading && (
            <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }} className="fadeUp">
              {/* Score cards */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10 }}>
                <Card style={{ padding:"1rem", textAlign:"center" }}>
                  <p style={{ fontSize:32, fontWeight:700, color: (aiReview.completeness_score||0)>=80?C.green:(aiReview.completeness_score||0)>=60?C.orange:C.red }}>{aiReview.completeness_score||0}%</p>
                  <p style={{ fontSize:11, color:C.muted }}>Completeness</p>
                </Card>
                <Card style={{ padding:"1rem", textAlign:"center" }}>
                  <p style={{ fontSize:32, fontWeight:700, color: (aiReview.confidence_score||0)>=80?C.green:(aiReview.confidence_score||0)>=60?C.orange:C.red }}>{aiReview.confidence_score||0}%</p>
                  <p style={{ fontSize:11, color:C.muted }}>AI Confidence</p>
                </Card>
                <Card style={{ padding:"1rem", textAlign:"center" }}>
                  <p style={{ fontSize:20, fontWeight:700, color:
                    aiReview.recommendation==="approve"?C.green:
                    aiReview.recommendation==="corrections"?C.orange:
                    aiReview.recommendation==="reject"?C.red:C.purple }}>
                    {aiReview.recommendation==="approve"?"✓ Approve":
                     aiReview.recommendation==="corrections"?"⚠ Corrections":
                     aiReview.recommendation==="reject"?"✗ Reject":"↑ Escalate"}
                  </p>
                  <p style={{ fontSize:11, color:C.muted }}>Recommendation</p>
                </Card>
              </div>

              {/* Summary */}
              {aiReview.summary && (
                <Card style={{ padding:"1.25rem" }}>
                  <p style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Summary</p>
                  <p style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{aiReview.summary}</p>
                </Card>
              )}

              {/* Compliance flags */}
              {(aiReview.compliance_flags||[]).length > 0 && (
                <Card style={{ padding:"1.25rem" }}>
                  <p style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Compliance Flags ({aiReview.compliance_flags.length})</p>
                  {aiReview.compliance_flags.map((f,i) => (
                    <div key={i} style={{ borderLeft:`3px solid ${f.severity==="high"?C.red:f.severity==="medium"?C.orange:C.yellow}`, paddingLeft:12, marginBottom:12 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <p style={{ fontSize:13, fontWeight:600, color:C.text }}>{f.description}</p>
                        <span style={{ fontSize:10, padding:"2px 8px", borderRadius:4, background:f.severity==="high"?"#FDEDEC":f.severity==="medium"?"#FDEBD0":"#FEF9E7", color:f.severity==="high"?C.red:f.severity==="medium"?C.orange:C.yellow, fontWeight:600, flexShrink:0, marginLeft:8 }}>{f.severity}</span>
                      </div>
                      {f.code_ref && <p style={{ fontSize:11, color:C.sky, marginTop:3 }}>§ {f.code_ref}</p>}
                      {f.recommendation && <p style={{ fontSize:12, color:C.muted, marginTop:4 }}>→ {f.recommendation}</p>}
                    </div>
                  ))}
                </Card>
              )}

              {/* History conflicts */}
              {(aiReview.history_conflicts||[]).length > 0 && (
                <Card style={{ padding:"1.25rem" }}>
                  <p style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>History Conflicts ({aiReview.history_conflicts.length})</p>
                  {aiReview.history_conflicts.map((h,i) => (
                    <div key={i} style={{ borderLeft:`3px solid ${h.severity==="high"?C.red:C.orange}`, paddingLeft:12, marginBottom:10 }}>
                      <p style={{ fontSize:13, color:C.text }}>{h.description}</p>
                    </div>
                  ))}
                </Card>
              )}

              {/* Precedents */}
              {(aiReview.similar_precedents||[]).length > 0 && (
                <Card style={{ padding:"1.25rem" }}>
                  <p style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Similar Precedents</p>
                  {aiReview.similar_precedents.map((p,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, fontSize:13 }}>
                      <span style={{ color:C.text }}>{p.summary}</span>
                      <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4, background:p.decision==="approved"?"#EAFAF1":"#FDEDEC", color:p.decision==="approved"?C.green:C.red, fontWeight:600, flexShrink:0, marginLeft:8 }}>{p.decision}</span>
                    </div>
                  ))}
                </Card>
              )}

              <Btn size="sm" variant="secondary" onClick={runAIReview} loading={aiLoading}>↻ Re-run Review</Btn>
            </div>
          )}
        </div>
      )}

      {/* Property History tab */}
      {activeTab==="history" && (
        <div>
          {histLoading ? (
            <Card style={{ padding:"3rem", textAlign:"center" }}>
              <Spinner size={24}/>
              <p style={{ marginTop:12, fontSize:13, color:C.muted }}>Searching permit history for {app.address}…</p>
            </Card>
          ) : history.length === 0 ? (
            <Card style={{ padding:"2rem", textAlign:"center" }}>
              <p style={{ fontSize:14, color:C.muted, marginBottom:"1rem" }}>No permit history loaded yet.</p>
              <Btn onClick={loadHistory}>Search Permit History</Btn>
            </Card>
          ) : (
            <Card>
              <div style={{ padding:"1rem 1.25rem", borderBottom:`1.5px solid ${C.border}` }}>
                <p style={{ fontSize:13, fontWeight:600, color:C.navy }}>{history.length} permits found for {app.address}</p>
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:C.gray }}>
                    {["Permit #","Type","Description","Status","Issued","Value"].map(h=>(
                      <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h,i)=>(
                    <tr key={i} style={{ borderBottom:`1px solid ${C.border}`, background:i%2===0?"#fff":"#FAFAFA" }}>
                      <td style={{ padding:"8px 12px", fontWeight:600, color:C.navy }}>{h.permit_number||"—"}</td>
                      <td style={{ padding:"8px 12px", color:C.muted }}>{h.permit_type||"—"}</td>
                      <td style={{ padding:"8px 12px", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.description||"—"}</td>
                      <td style={{ padding:"8px 12px" }}><StatusBadge status={h.status?.toLowerCase()||"unknown"} /></td>
                      <td style={{ padding:"8px 12px", whiteSpace:"nowrap", color:C.muted }}>{h.issued_date||"—"}</td>
                      <td style={{ padding:"8px 12px", whiteSpace:"nowrap" }}>{h.valuation?`$${Number(h.valuation).toLocaleString()}`:"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {/* Comments tab */}
      {activeTab==="comments" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
          <Card style={{ padding:"1.25rem" }}>
            <p style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Post Comment</p>
            <textarea value={newComment} onChange={e=>setNewComment(e.target.value)} placeholder="Enter your comment or correction request…" style={{ minHeight:80, resize:"vertical", marginBottom:10 }} />
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
              <div style={{ display:"flex", gap:12, fontSize:12 }}>
                <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                  <input type="checkbox" checked={isCorrection} onChange={e=>setIsCorrection(e.target.checked)} style={{ width:14, height:14, accentColor:C.navy }} />
                  Correction request
                </label>
                <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                  <input type="checkbox" checked={isInternal} onChange={e=>setIsInternal(e.target.checked)} style={{ width:14, height:14, accentColor:C.navy }} />
                  Internal only
                </label>
              </div>
              <Btn size="sm" onClick={postComment} loading={postingComment} disabled={!newComment.trim()}>Post Comment</Btn>
            </div>
          </Card>
          {comments.length === 0 ? (
            <Card style={{ padding:"2rem", textAlign:"center", color:C.muted, fontSize:13 }}>No comments yet.</Card>
          ) : (
            comments.map(c => (
              <Card key={c.id} style={{ padding:"1rem 1.25rem", borderLeft:`3px solid ${c.is_correction_request?C.orange:c.author_role==="government_reviewer"?C.navy:C.sky}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontSize:12, fontWeight:600, color:C.text }}>{c.author_name||c.author_role}</span>
                    {c.is_correction_request && <span style={{ fontSize:10, padding:"2px 8px", borderRadius:4, background:"#FDEBD0", color:"#784212", fontWeight:600 }}>Correction Request</span>}
                  </div>
                  <span style={{ fontSize:11, color:C.muted }}>{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
                <p style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{c.content}</p>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── Assign Departments (Overall only) ── */}
      {activeTab==="assign" && isOverall && (
        <Card style={{ padding:"1.5rem" }}>
          <p style={{ fontSize:14, fontWeight:600, color:C.navy, marginBottom:4 }}>Assign Reviewing Departments</p>
          <p style={{ fontSize:12, color:C.muted, marginBottom:16 }}>Select which departments need to review this permit application.</p>
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
            {ALL_DEPTS.map(d => {
              const checked = assignedDepts.includes(d.id);
              const review = reviews.find(r => r.department === d.id);
              return (
                <label key={d.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", border:`1px solid ${checked?C.blue:C.border}`, borderRadius:8, cursor:"pointer", background:checked?"#EBF5FB":"#fff" }}>
                  <input type="checkbox" checked={checked}
                    onChange={e => {
                      const next = e.target.checked
                        ? [...assignedDepts, d.id]
                        : assignedDepts.filter(x => x !== d.id);
                      setAssignedDepts(next);
                    }}
                    style={{ width:16, height:16, accentColor:C.navy }} />
                  <span style={{ fontSize:13, fontWeight:500, flex:1 }}>{d.label}</span>
                  {review && (
                    <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4,
                      background: review.status==='submitted'?'#D5F5E3':review.status==='in_review'?'#EBF5FB':'#F4F6F7',
                      color: review.status==='submitted'?'#1E8449':review.status==='in_review'?'#1B4F82':'#7F8C8D' }}>
                      {review.status} · {review.commentCount||0} comments
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <Btn onClick={()=>handleAssignDepts(assignedDepts)} loading={assigning}>
            Save Department Assignments
          </Btn>
        </Card>
      )}

      {/* ── All Comments (Overall review) ── */}
      {activeTab==="allcomments" && isOverall && (
        <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
          {ALL_DEPTS.map(d => {
            const dComments = reviewComments.filter(c => c.department === d.id);
            if (!assignedDepts.includes(d.id)) return null;
            return (
              <Card key={d.id} style={{ padding:"1.25rem" }}>
                <p style={{ fontSize:12, fontWeight:700, color:C.navy, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.05em" }}>{d.label}</p>
                {dComments.length === 0 ? (
                  <p style={{ fontSize:12, color:C.muted }}>No comments submitted yet.</p>
                ) : dComments.map(c => (
                  <div key={c.id} style={{ borderLeft:`3px solid ${c.is_correction?C.orange:C.blue}`, paddingLeft:12, marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:600 }}>{c.reviewer_name}</span>
                      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                        {c.is_correction && <span style={{ fontSize:10, padding:"2px 6px", borderRadius:4, background:"#FDEBD0", color:"#784212" }}>Correction</span>}
                        <label style={{ fontSize:11, color:C.muted, display:"flex", alignItems:"center", gap:4, cursor:"pointer" }}>
                          <input type="checkbox" checked={c.is_included !== false}
                            onChange={async e => {
                              const newVal = e.target.checked;
                              // Update local state immediately
                              setReviewComments(prev => prev.map(rc =>
                                rc.id === c.id ? {...rc, is_included: newVal} : rc
                              ));
                              // Save to API
                              const hdrs = await authHeadersAsync();
                              await fetch(`${API_URL}/api/review/comments`, {
                                method:'PATCH', headers:hdrs,
                                body: JSON.stringify({ id: c.id, is_included: newVal }),
                              });
                            }}
                            style={{ width:14, height:14, accentColor:C.navy }} />
                          Include in report
                        </label>
                      </div>
                    </div>
                    <p style={{ fontSize:13, color:C.text, lineHeight:1.5 }}>{c.content}</p>
                    {applicantResponses.filter(r => r.comment_id === c.id).map((r, ri) => (
                      <div key={ri} style={{ marginTop:8, background:C.light, borderRadius:6, padding:'8px 12px', borderLeft:`3px solid ${C.sky}` }}>
                        <p style={{ fontSize:11, fontWeight:700, color:C.sky, marginBottom:4 }}>APPLICANT RESPONSE</p>
                        <p style={{ fontSize:12, color:C.text, lineHeight:1.5, margin:0 }}>{r.content}</p>
                        <p style={{ fontSize:10, color:C.muted, marginTop:4 }}>{new Date(r.created_at).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Issue Report (Overall) ── */}
      {activeTab==="report" && isOverall && (
        <Card style={{ padding:"1.5rem" }}>
          <p style={{ fontSize:14, fontWeight:600, color:C.navy, marginBottom:4 }}>Issue Final Report</p>
          <p style={{ fontSize:12, color:C.muted, marginBottom:16 }}>The report will include all comments marked "Include in report" from each department.</p>
          <div style={{ background:C.gray, borderRadius:8, padding:"1rem", marginBottom:16, fontSize:13 }}>
            <p style={{ fontWeight:600, marginBottom:8 }}>Summary</p>
            {ALL_DEPTS.filter(d => assignedDepts.includes(d.id)).map(d => {
              const cnt = reviewComments.filter(c => c.department===d.id && c.is_included!==false).length;
              return <p key={d.id} style={{ color:C.muted, marginBottom:4 }}>{d.label}: <strong style={{color:C.text}}>{cnt} comment{cnt!==1?'s':''} included</strong></p>;
            })}
          </div>
          <Btn onClick={handleIssueReport} style={{ background:C.green }}>
            Issue Report & Notify Applicant
          </Btn>
        </Card>
      )}

      {/* ── View Report ── */}
      {activeTab==="viewreport" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
          {!issuedReport ? (
            <Card style={{ padding:"2rem", textAlign:"center", color:C.muted, fontSize:13 }}>
              No report issued yet.
            </Card>
          ) : (
            <Card style={{ padding:"1.5rem" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                <div>
                  <p style={{ fontSize:14, fontWeight:700, color:C.navy, margin:0 }}>Official Review Report</p>
                  <p style={{ fontSize:12, color:C.muted, marginTop:4 }}>
                    Version {issuedReport.version} · Issued {new Date(issuedReport.issued_at).toLocaleDateString()} · By {issuedReport.issued_by_name}
                  </p>
                </div>
                <span style={{ fontSize:11, padding:"3px 10px", borderRadius:4, background:"#D5F5E3", color:C.green, fontWeight:600 }}>Issued</span>
              </div>
              <div style={{ display:"flex", gap:12, marginBottom:16, flexWrap:"wrap" }}>
                <div style={{ background:C.gray, borderRadius:8, padding:"10px 16px", flex:1, minWidth:120 }}>
                  <p style={{ fontSize:22, fontWeight:700, color:C.navy, margin:0 }}>{issuedReport.report_content?.totalComments || 0}</p>
                  <p style={{ fontSize:11, color:C.muted, marginTop:2 }}>Total comments</p>
                </div>
                <div style={{ background:C.gray, borderRadius:8, padding:"10px 16px", flex:1, minWidth:120 }}>
                  <p style={{ fontSize:22, fontWeight:700, color:C.orange, margin:0 }}>{issuedReport.report_content?.totalCorrections || 0}</p>
                  <p style={{ fontSize:11, color:C.muted, marginTop:2 }}>Corrections required</p>
                </div>
              </div>
              {(issuedReport.report_content?.departments || []).map(dept => (
                <div key={dept.department} style={{ marginBottom:16 }}>
                  <p style={{ fontSize:12, fontWeight:700, color:C.navy, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>{dept.label}</p>
                  {dept.comments.length === 0 ? (
                    <p style={{ fontSize:12, color:C.muted }}>No comments included.</p>
                  ) : dept.comments.map((c, i) => (
                    <div key={i} style={{ borderLeft:`3px solid ${c.is_correction?C.orange:C.blue}`, paddingLeft:12, marginBottom:10 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <span style={{ fontSize:12, fontWeight:600 }}>{c.reviewer}</span>
                        {c.is_correction && <span style={{ fontSize:10, padding:"2px 6px", borderRadius:4, background:"#FDEBD0", color:"#784212" }}>Correction required</span>}
                      </div>
                      <p style={{ fontSize:13, color:C.text, lineHeight:1.6, margin:0 }}>{c.content}</p>
                    </div>
                  ))}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* ── Fee & Precedents ── */}
      {activeTab==="analyze" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
          {analysisLoading ? (
            <Card style={{ padding:"2rem", textAlign:"center", color:C.muted }}>
              <Spinner size={24}/><p style={{marginTop:12,fontSize:13}}>Calculating fees and searching for precedents…</p>
            </Card>
          ) : !analysis ? (
            <Card style={{ padding:"2rem", textAlign:"center", color:C.muted, fontSize:13 }}>
              Click the tab to load fee estimate and similar permits.
            </Card>
          ) : (
            <>
              {/* Fee estimate */}
              <Card style={{ padding:"1.5rem" }}>
                <p style={{ fontSize:14, fontWeight:700, color:C.navy, marginBottom:4 }}>Estimated Permit Fees</p>
                <p style={{ fontSize:12, color:C.muted, marginBottom:16 }}>
                  Based on {analysis.feeEstimate?.effectiveDate} Woodside fee schedule · 
                  Confidence: <strong style={{color:analysis.feeEstimate?.confidence==='high'?C.green:C.orange}}>{analysis.feeEstimate?.confidence}</strong>
                </p>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10, marginBottom:16 }}>
                  {(analysis.feeEstimate?.breakdown || []).map((item, i) => (
                    <div key={i} style={{ background:C.gray, borderRadius:8, padding:"10px 14px" }}>
                      <p style={{ fontSize:18, fontWeight:700, color:C.navy, margin:0 }}>
                        ${item.amount?.toLocaleString()}
                      </p>
                      <p style={{ fontSize:11, color:C.muted, marginTop:2 }}>{item.label}</p>
                    </div>
                  ))}
                </div>
                <div style={{ background:"#EAFAF1", borderRadius:8, padding:"10px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:14, fontWeight:700, color:C.green }}>Total Estimate</span>
                  <span style={{ fontSize:22, fontWeight:700, color:C.green }}>${analysis.feeEstimate?.totalEstimate?.toLocaleString()}</span>
                </div>
                <p style={{ fontSize:11, color:C.muted, marginTop:10 }}>{analysis.feeEstimate?.notes}</p>
                <p style={{ fontSize:11, color:C.orange, marginTop:4 }}>{analysis.feeEstimate?.paymentNote}</p>
              </Card>

              {/* Precedents */}
              <Card style={{ padding:"1.5rem" }}>
                <p style={{ fontSize:14, fontWeight:700, color:C.navy, marginBottom:4 }}>Similar Approved Permits</p>
                <p style={{ fontSize:12, color:C.muted, marginBottom:12 }}>Recently issued permits of the same type in {app?.city_display?.split(',')[0]?.trim() || app?.parcel_data?.city || 'Woodside'}</p>
                {!analysis.precedents?.length ? (
                  <p style={{ fontSize:13, color:C.muted }}>No similar precedents found in database yet. Database builds over time as permits are analyzed.</p>
                ) : (
                  analysis.precedents.map((p, i) => (
                    <div key={i} style={{ borderLeft:`3px solid ${C.sky}`, paddingLeft:12, marginBottom:14 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{p.permit_number}</span>
                        <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4, background:"#EAFAF1", color:C.green, fontWeight:600 }}>{p.status}</span>
                      </div>
                      <p style={{ fontSize:12, color:C.muted, marginBottom:4 }}>{p.address}</p>
                      <p style={{ fontSize:12, color:C.text, marginBottom:4 }}>{p.description}</p>
                      <div style={{ display:"flex", gap:16, fontSize:11, color:C.muted }}>
                        {p.issued_date && <span>Issued: {p.issued_date}</span>}
                        {p.valuation && <span>Valuation: ${Number(p.valuation).toLocaleString()}</span>}
                      </div>
                    </div>
                  ))
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* ── Department Review (non-Overall) ── */}
      {activeTab==="deptreview" && !isOverall && (
        <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
          <Card style={{ padding:"1.25rem" }}>
            <p style={{ fontSize:12, fontWeight:700, color:C.navy, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.05em" }}>{department?.label} — Add Comment</p>
            <textarea value={deptComment} onChange={e=>setDeptComment(e.target.value)}
              placeholder={`Enter your ${department?.label} review comments…`}
              style={{ minHeight:100, resize:"vertical", marginBottom:10 }} />
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
              <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, cursor:"pointer" }}>
                <input type="checkbox" checked={isCorrectDept} onChange={e=>setIsCorrectDept(e.target.checked)} style={{ width:14, height:14, accentColor:C.navy }} />
                This is a correction request
              </label>
              <Btn size="sm" onClick={handleDeptComment} loading={postingDept} disabled={!deptComment.trim()}>
                Submit Comment
              </Btn>
            </div>
          </Card>
          {deptReviews.length === 0 ? (
            <Card style={{ padding:"2rem", textAlign:"center", color:C.muted, fontSize:13 }}>No comments from {department?.label} yet.</Card>
          ) : deptReviews.map(c => (
            <Card key={c.id} style={{ padding:"1rem 1.25rem", borderLeft:`3px solid ${c.is_correction?C.orange:C.navy}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:12, fontWeight:600 }}>{c.reviewer_name}</span>
                <div style={{ display:"flex", gap:6 }}>
                  {c.is_correction && <span style={{ fontSize:10, padding:"2px 8px", borderRadius:4, background:"#FDEBD0", color:"#784212" }}>Correction</span>}
                  <span style={{ fontSize:11, color:C.muted }}>{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <p style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{c.content}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
const DEPARTMENTS = [
  { id: 'overall',             label: 'Overall Review',                        icon: '🏛️' },
  { id: 'planning',            label: 'Planning',                              icon: '📐' },
  { id: 'building',            label: 'Building',                              icon: '🏗️' },
  { id: 'engineering',         label: 'Engineering',                           icon: '⚙️' },
  { id: 'fire',                label: 'Woodside Fire',                         icon: '🚒' },
  { id: 'geologist',           label: 'Town Geologist',                        icon: '🪨' },
  { id: 'environmental_health',label: 'San Mateo County Environmental Health', icon: '🌿' },
  { id: 'asrb',                label: 'Architecture & Site Review Board',      icon: '🏛' },
];

export default function App() {
  const [user,        setUser]       = useState(null);
  const [authReady,   setAuthReady]  = useState(false);
  const [profile,     setProfile]    = useState(null);
  const [view,        setView]       = useState("queue"); // queue | review
  const [selectedApp, setSelectedApp] = useState(null);
  const [cityFilter,  setCityFilter] = useState("");

  useEffect(() => {
    const u = getUser();
    setUser(u);
    setAuthReady(true);
    if (u) loadProfile(u.id);
  }, []);

  async function loadProfile(userId) {
    const p = await dbGetProfile(userId);
    setProfile(p);
  }

  async function handleAuth() {
    const u = getUser();
    setUser(u);
    if (u) loadProfile(u.id);
  }

  async function handleSignOut() {
    await signOut();
    setUser(null);
    setProfile(null);
  }

  function selectApp(app) {
    setSelectedApp(app);
    setView("review");
  }

  const [department, setDepartment] = useState(null);

  useEffect(() => { setView("queue"); setSelectedApp(null); }, [department?.id]);

  if (!authReady) return null;
  if (!user) return <AuthModal onAuth={handleAuth} />;

  if (!department) return (
    <div style={{minHeight:'100vh',background:C.gray,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
      <div style={{width:'100%',maxWidth:480}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontSize:40,marginBottom:8}}>🏛️</div>
          <h1 style={{fontSize:22,fontWeight:700,color:C.navy,margin:0}}>Town of Woodside</h1>
          <p style={{fontSize:13,color:C.muted,marginTop:4}}>Select your department to continue</p>
          <p style={{fontSize:12,color:C.muted,marginTop:2}}>Signed in as {user.email}</p>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {DEPARTMENTS.map(d => (
            <button key={d.id} onClick={()=>setDepartment(d)}
              style={{display:'flex',alignItems:'center',gap:12,padding:'14px 18px',background:'#fff',border:`1px solid ${C.border}`,borderRadius:8,cursor:'pointer',fontSize:14,color:C.text,textAlign:'left'}}>
              <span style={{fontSize:22,width:32,textAlign:'center'}}>{d.icon}</span>
              <span style={{fontWeight:500}}>{d.label}</span>
              <span style={{marginLeft:'auto',color:C.muted,fontSize:18}}>›</span>
            </button>
          ))}
        </div>
        <button onClick={()=>{signOut();setUser(null);setProfile(null);}}
          style={{display:'block',margin:'20px auto 0',background:'none',border:'none',color:C.muted,fontSize:12,cursor:'pointer'}}>
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.gray }}>
      <style>{css}</style>

      {/* Header */}
      <div style={{ background:C.navy, padding:"0.875rem 1.5rem", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:20 }}>🏛️</span>
          <div>
            <span style={{ fontSize:17, fontWeight:700, color:"#fff" }}>Government Portal</span>
            <span style={{ fontSize:11, color:"#8EACC9", display:"block", marginTop:-2 }}>Permit Review & Processing</span>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {view==="review" && <Btn size="sm" variant="ghost" onClick={()=>setView("queue")} style={{color:"#8EACC9"}}>← Queue</Btn>}
          <span style={{ fontSize:12, color:"#8EACC9" }}>{user.email}</span>
          {department && <span style={{ fontSize:11, padding:"3px 8px", borderRadius:4, background:"#1B4F82", color:"#fff" }}>{department.label}</span>}
          <Btn size="sm" variant="ghost" onClick={()=>setDepartment(null)} style={{color:"#8EACC9",fontSize:11}}>Switch dept</Btn>
          <Btn size="sm" variant="secondary" onClick={handleSignOut} style={{fontSize:11}}>Sign out</Btn>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth:1100, margin:"2rem auto", padding:"0 1rem" }}>
        {view==="queue" && (
          <>
            <div style={{ marginBottom:"1.5rem" }}>
              <h1 style={{ fontSize:22, fontWeight:700, color:C.navy }}>Permit Queue</h1>
              <p style={{ fontSize:13, color:C.muted, marginTop:4 }}>Review and process submitted permit applications.</p>
            </div>
            <QueueView user={user} onSelect={selectApp} cityFilter={cityFilter} setCityFilter={setCityFilter} department={department} />
          </>
        )}
        {view==="review" && selectedApp?.id && (
          <ReviewPanel key={selectedApp.id} appId={selectedApp.id} user={user} department={department} onBack={()=>setView("queue")}
            onStatusChange={(id,status)=>{ setSelectedApp(prev=>({...prev,status})); }} />
        )}
      </div>
    </div>
  );
}
