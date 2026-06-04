import React, { useState, useEffect, useRef } from "react";
import { getUser, signIn, signUp, signOut } from "./auth.js";

var API_URL = "/api/claude";
var MDL = "claude-haiku-4-5-20251001";
var CACHE_PREFIX = "cre_v2_";
var CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function delay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

// --- Cache helpers (in-memory Map, works everywhere including Claude sandbox) ---
var _cache = new Map();
function cacheGet(key) {
  try {
    var obj = _cache.get(CACHE_PREFIX + key);
    if (!obj) return null;
    if (Date.now() - obj.ts > CACHE_TTL) { _cache.delete(CACHE_PREFIX + key); return null; }
    return obj.val;
  } catch(e) { return null; }
}
function cacheSet(key, val) {
  try { _cache.set(CACHE_PREFIX + key, {ts: Date.now(), val: val}); } catch(e) {}
}
function cacheKey() {
  return Array.prototype.slice.call(arguments).join("|").toLowerCase().replace(/\s+/g,"_").slice(0,80);
}

// --- Web search via Anthropic tool use - pulls live Zillow/Redfin/LoopNet data ---
function webSearch(query) {
  return fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MDL,
      max_tokens: 1024,
      tools: [{type:"web_search_20250305",name:"web_search"}],
      messages: [{role:"user",content:query}]
    })
  }).then(function(r){ return r.json(); }).then(function(data) {
    if (data.error) throw new Error(data.error.message);
    var text = "";
    (data.content||[]).forEach(function(b){ if(b.type==="text") text += b.text; });
    return text.trim();
  });
}

// callAI - with optional web search tool for live property data
function callAI(msgs, sys, tok, useSearch) {
  tok = tok || 600;
  var body = { model: MDL, max_tokens: tok, system: sys, messages: msgs };
  if (useSearch) body.tools = [{type:"web_search_20250305",name:"web_search"}];
  return fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(function(res) {
    return res.json();
  }).then(function(data) {
    if (data.error) throw new Error(data.error.message || "API error");
    if (!data.content || !data.content.length) throw new Error("Empty response");
    return data.content.map(function(b) { return b.text || ""; }).join("");
  });
}

// Fetch live property data from Zillow/Redfin/LoopNet then summarise in one call
function fetchPropertyData(location, acreage) {
  var ck = cacheKey("prop", location, acreage);
  var cached = cacheGet(ck);
  if (cached) return Promise.resolve(cached);

  var searchQuery = "site:zillow.com OR site:redfin.com OR site:loopnet.com OR site:crexi.com " + location + " commercial land zoning";
  var sys = "You are a CRE research analyst. Use the web search results to extract real property data for this location. Return ONLY a JSON object with these fields: zoning (string), currentUse (string), landArea (string), jurisdiction (string), marketContext (2 sentences from real data), demographics (2 sentences), infrastructure (1 sentence), constraints (1 sentence), opportunityScore (integer 1-10), opportunityRationale (1 sentence), dataSource (comma-separated list of sources used e.g. Zillow,LoopNet). No markdown.";
  var msg = "Find property and market data for: " + location + (acreage ? ", approximately " + acreage + " acres" : "") + ". Search Zillow, Redfin, LoopNet, and CREXI for comparable listings, zoning, and market conditions.";

  return callAI([{role:"user",content:msg}], sys, 800, true)
    .then(function(raw) {
      try {
        var d = tryJSON(raw);
        cacheSet(ck, d);
        return d;
      } catch(e) { return null; }
    }).catch(function(){ return null; });
}

// Fetch comparable sales/listings from real estate APIs
function fetchComparables(location, devType) {
  var ck = cacheKey("comps", location, devType);
  var cached = cacheGet(ck);
  if (cached) return Promise.resolve(cached);

  var sys = "You are a CRE appraiser. Search for recent comparable sales and active listings. Return ONLY a JSON object: {avgPricePerSqft:number, avgCapRate:number, medianLandValue:number, activeListings:number, recentSales:number, priceRange:string, dataSource:string}. All numbers plain integers/decimals, no $ signs.";
  var msg = "Search Zillow, LoopNet, CREXI, and Redfin for comparable " + devType + " properties near " + location + ". Find recent sales prices, cap rates, and land values per sqft.";

  return callAI([{role:"user",content:msg}], sys, 600, true)
    .then(function(raw) {
      try {
        var d = tryJSON(raw);
        cacheSet(ck, d);
        return d;
      } catch(e) { return null; }
    }).catch(function(){ return null; });
}

function tryJSON(raw) {
  if (!raw) throw new Error("no response");
  // strip markdown fences
  var s = raw.replace(/```[a-z]*/g,"").replace(/```/g,"").trim();
  // direct parse
  try { return JSON.parse(s); } catch(e) {}
  // find outermost object
  var a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(s.slice(a, b+1)); } catch(e) {}
    // fix trailing commas
    try { return JSON.parse(s.slice(a, b+1).replace(/,\s*([}\]])/g,"$1")); } catch(e) {}
  }
  // find outermost array
  var c = s.indexOf("["), d = s.lastIndexOf("]");
  if (c >= 0 && d > c) {
    try { return JSON.parse(s.slice(c, d+1)); } catch(e) {}
  }
  throw new Error("Cannot parse. Got: " + s.slice(0, 80));
}

function dollars(n) {
  return "$" + Number(n).toLocaleString();
}

var MONO = "DM Mono, monospace";
var SERIF = "Playfair Display, serif";
var TXT = "Crimson Text, serif";
var BROWN = "#5C4A2A";
var TAN = "#C4A882";
var CREAM = "#F7F2E8";
var DARK = "#2C1F0E";

// Default permit data used when AI cannot return specific local data
var DEFAULT_COMMERCIAL_PERMITS = {
  totalCostLow: 45000,
  totalCostHigh: 180000,
  costNote: "General commercial permit cost ranges. Actual costs vary significantly by jurisdiction, project size, and complexity.",
  permits: [
    { name: "Zoning Approval / Variance", type: "Zoning", costLow: 3000, costHigh: 15000, timelineDays: "60-120 days", notes: "Required to confirm land use is permitted or to obtain a variance for non-conforming uses." },
    { name: "Environmental Site Assessment (Phase I/II)", type: "Environmental", costLow: 3500, costHigh: 12000, timelineDays: "30-60 days", notes: "Identifies potential environmental contamination before development begins; lenders typically require Phase I." },
    { name: "Grading & Drainage Permit", type: "Building", costLow: 2000, costHigh: 8000, timelineDays: "30-45 days", notes: "Required for any earthwork, grading, or changes to site drainage and stormwater management." },
    { name: "Building Permit", type: "Building", costLow: 8000, costHigh: 50000, timelineDays: "45-90 days", notes: "Core permit covering structural, electrical, plumbing, and mechanical systems for all new construction." },
    { name: "Fire Safety & Sprinkler Permit", type: "Building", costLow: 2500, costHigh: 12000, timelineDays: "30-60 days", notes: "Required for fire suppression systems, alarms, and egress compliance in commercial buildings." },
    { name: "Utility Connection Permits", type: "Utility", costLow: 5000, costHigh: 25000, timelineDays: "30-90 days", notes: "Covers connections to municipal water, sewer, gas, and electrical grid including impact fees." },
    { name: "ADA Compliance Review", type: "Building", costLow: 1500, costHigh: 5000, timelineDays: "14-30 days", notes: "Ensures all public-facing commercial spaces meet Americans with Disabilities Act accessibility standards." },
    { name: "Occupancy Permit / Certificate of Occupancy", type: "Building", costLow: 500, costHigh: 3000, timelineDays: "14-30 days after completion", notes: "Final inspection sign-off confirming the building meets all code requirements before occupancy." }
  ]
};

var DEFAULT_RESIDENTIAL_PERMITS = {
  totalCostLow: 25000,
  totalCostHigh: 95000,
  costNote: "General residential development permit cost ranges. Actual fees vary by jurisdiction, unit count, and project size.",
  permits: [
    { name: "Subdivision / Plat Approval", type: "Zoning", costLow: 5000, costHigh: 20000, timelineDays: "90-180 days", notes: "Required to divide land into individual lots; involves public hearings and planning commission review." },
    { name: "Environmental Review", type: "Environmental", costLow: 3000, costHigh: 10000, timelineDays: "45-90 days", notes: "Assesses impact on wetlands, floodplains, wildlife habitat, and NEPA compliance if federal funding is involved." },
    { name: "Grading & Erosion Control Permit", type: "Building", costLow: 2000, costHigh: 8000, timelineDays: "30-45 days", notes: "Governs earthwork and erosion prevention during construction to protect surrounding waterways." },
    { name: "Building Permits (per unit)", type: "Building", costLow: 8000, costHigh: 30000, timelineDays: "30-60 days", notes: "Covers structural, mechanical, electrical, and plumbing for each residential unit constructed." },
    { name: "Utility & Infrastructure Permits", type: "Utility", costLow: 4000, costHigh: 18000, timelineDays: "45-90 days", notes: "Water, sewer, gas, and electrical service connections plus any required road or sidewalk improvements." },
    { name: "School & Park Impact Fees", type: "Zoning", costLow: 2000, costHigh: 8000, timelineDays: "At permit issuance", notes: "One-time fees paid to offset infrastructure demand created by new residents." },
    { name: "Certificate of Occupancy", type: "Building", costLow: 500, costHigh: 2000, timelineDays: "7-21 days after completion", notes: "Final inspection confirming each unit meets building code before residents may move in." }
  ]
};

function getDefaultPermits(title) {
  var t = (title || "").toLowerCase();
  if (t.indexOf("commercial") >= 0 || t.indexOf("retail") >= 0 || t.indexOf("office") >= 0 || t.indexOf("industrial") >= 0 || t.indexOf("mixed") >= 0) {
    return DEFAULT_COMMERCIAL_PERMITS;
  }
  return DEFAULT_RESIDENTIAL_PERMITS;
}

function Spin(props) {
  var sz = props.s ? 13 : 19;
  return React.createElement("div", {
    style: { display:"flex", alignItems:"center", gap:8, color:"#8B7355", fontFamily:TXT, fontSize:props.s?13:16 }
  },
    React.createElement("div", { style: {
      width:sz, height:sz, borderRadius:"50%",
      border:"2px solid "+TAN, borderTopColor:BROWN,
      animation:"spin 0.8s linear infinite", flexShrink:0
    }}),
    props.label || (props.s ? "Loading..." : "Analyzing...")
  );
}

function Tag(props) {
  return React.createElement("span", {
    style: { fontFamily:MONO, fontSize:9, textTransform:"uppercase", color:"#8B7355", background:"#EDE4D6", padding:"2px 7px", borderRadius:2, letterSpacing:"0.06em" }
  }, props.children);
}

function SecLabel(props) {
  return React.createElement("div", {
    style: { fontFamily:MONO, fontSize:9, textTransform:"uppercase", letterSpacing:"0.12em", color:props.color||"#8B7355", marginBottom:10 }
  }, props.children);
}

function BulletList(props) {
  return React.createElement("div", { style:{marginBottom:24} },
    React.createElement(SecLabel, {color:props.color}, props.title),
    React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:8} },
      (props.items||[]).map(function(item, i) {
        return React.createElement("div", {
          key: i,
          style: { padding:"11px 15px", background:"#FDFAF5", border:"1px solid #E8DCC8", borderLeft:"3px solid "+props.color, borderRadius:2, fontFamily:TXT, fontSize:15, color:"#3D2E18", lineHeight:1.5 }
        }, item);
      })
    )
  );
}

function PermitTable(props) {
  var pd = props.pd;
  if (!pd) return React.createElement("p", { style:{fontFamily:TXT,fontSize:14,color:"#8B7355",fontStyle:"italic"} }, "Permit details unavailable.");
  var tc = { Zoning:BROWN, Environmental:"#4A7C59", Building:"#2A5C8B", "State License":"#7C4A7C", Utility:"#7C6A2A", Other:"#8B7355" };
  return React.createElement("div", null,
    React.createElement("div", {
      style: { display:"flex", justifyContent:"space-between", alignItems:"center", background:"#F0E8D8", padding:"10px 14px", borderRadius:2, marginBottom:10, flexWrap:"wrap", gap:8 }
    },
      React.createElement("div", null,
        React.createElement("div", { style:{fontFamily:MONO,fontSize:9,textTransform:"uppercase",color:"#8B7355",marginBottom:4} }, "Estimated Permit Costs"),
        React.createElement("div", { style:{fontFamily:SERIF,fontSize:17,fontWeight:700,color:DARK} }, dollars(pd.totalCostLow) + " - " + dollars(pd.totalCostHigh))
      ),
      React.createElement("div", { style:{fontFamily:MONO,fontSize:9,color:"#8B7355",maxWidth:220,textAlign:"right",lineHeight:1.5} }, pd.costNote)
    ),
    React.createElement("table", { style:{width:"100%",borderCollapse:"collapse",fontSize:13} },
      React.createElement("thead", null,
        React.createElement("tr", { style:{background:"#EDE4D6"} },
          ["Permit","Type","Timeline","Est. Cost"].map(function(h,i) {
            return React.createElement("th", { key:h, style:{fontFamily:MONO,fontSize:9,textTransform:"uppercase",color:BROWN,padding:"7px 10px",textAlign:i===3?"right":"left"} }, h);
          })
        )
      ),
      React.createElement("tbody", null,
        (pd.permits||[]).map(function(p,i) {
          return React.createElement("tr", { key:i, style:{background:i%2===0?"#FDFAF5":"#F7F2E8",borderLeft:"3px solid "+(tc[p.type]||"#8B7355")} },
            React.createElement("td", { style:{padding:"8px 10px",fontFamily:SERIF,fontSize:14,fontWeight:600,color:DARK} },
              p.name,
              React.createElement("div", { style:{fontSize:12,color:"#6B5A3E",fontWeight:400} }, p.notes)
            ),
            React.createElement("td", { style:{padding:"8px 10px",fontFamily:MONO,fontSize:10,color:"#6B5A3E"} }, p.type),
            React.createElement("td", { style:{padding:"8px 10px",fontFamily:MONO,fontSize:10,color:"#6B5A3E"} }, p.timelineDays),
            React.createElement("td", { style:{padding:"8px 10px",textAlign:"right",fontFamily:MONO,fontSize:11,color:"#3D2E18"} },
              dollars(p.costLow),
              React.createElement("div", { style:{color:"#8B7355"} }, "to " + dollars(p.costHigh))
            )
          );
        })
      )
    )
  );
}

function ImplDetail(props) {
  var s1 = useState(false);
  var s2 = useState(null);
  var s3 = useState(false);
  var s4 = useState(null);
  var open = s1[0], setOpen = s1[1];
  var data = s2[0], setData = s2[1];
  var loading = s3[0], setLoading = s3[1];
  var err = s4[0], setErr = s4[1];

  function load(e) {
    e.stopPropagation();
    if (data) { setOpen(!open); return; }
    setOpen(true); setLoading(true); setErr(null);
    var ck = cacheKey("impl", props.location, props.opt.title, props.acreage||"");
    var hit = cacheGet(ck);
    if (hit) { setData(hit); setLoading(false); return; }
    var sys = "CRE permit specialist. Return ONLY JSON: {permits:[{name,type,costLow,costHigh,timelineDays,notes}],totalCostLow,totalCostHigh,costNote}. type=Zoning|Environmental|Building|State License|Utility|Other. Plain integers.";
    var msg = props.location+(props.acreage?", "+props.acreage+" acres":"")+". "+props.opt.title+". List 5-8 permits with costs.";
    callAI([{role:"user",content:msg}], sys, 900).then(function(raw) {
      try {
        var d = tryJSON(raw);
        d.totalCostLow = Math.abs(Number(d.totalCostLow)||0);
        d.totalCostHigh = Math.abs(Number(d.totalCostHigh)||0);
        d.permits = (d.permits||[]).map(function(p){return Object.assign({},p,{costLow:Math.abs(Number(p.costLow)||0),costHigh:Math.abs(Number(p.costHigh)||0)});});
        cacheSet(ck, d);
        setData(d);
      } catch(e) { setData(getDefaultPermits(props.opt.title)); }
      setLoading(false);
    }).catch(function(e) { setData(getDefaultPermits(props.opt.title)); setLoading(false); });
  }

  return React.createElement("div", { onClick:function(e){e.stopPropagation();} },
    React.createElement("button", {
      onClick: load,
      style: { background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:MONO,fontSize:10,textTransform:"uppercase",color:BROWN,textDecoration:"underline",marginTop:14,display:"inline-block" }
    }, (open?"[hide]":"[show]") + " Implementation Details & Permit Costs"),
    open && React.createElement("div", { style:{marginTop:12,borderTop:"1px dashed #D4C4A8",paddingTop:14} },
      loading && React.createElement(Spin, {s:true}),
      err && React.createElement("div", null,
        React.createElement("div", { style:{fontFamily:MONO,fontSize:11,color:"#8B1A1A"} }, err),
        React.createElement("button", {
          onClick: function(e) { e.stopPropagation(); setData(null); setErr(null); setOpen(false); setTimeout(function(){load(e);},100); },
          style: { marginTop:6,background:"none",border:"1px solid "+TAN,color:BROWN,padding:"4px 10px",fontFamily:MONO,fontSize:10,textTransform:"uppercase",cursor:"pointer",borderRadius:2 }
        }, "Retry")
      ),
      data && React.createElement(PermitTable, {pd:data})
    )
  );
}

function OptionCard(props) {
  var sel = props.selected === props.index;
  var opt = props.opt;
  return React.createElement("div", {
    style: { border:sel?"2px solid "+BROWN:"1.5px solid #D4C4A8", borderRadius:2, padding:"22px 26px", background:sel?"#F5EFE4":"#FDFAF5", boxShadow:sel?"0 6px 20px rgba(92,74,42,0.12)":"none", transition:"all 0.2s" }
  },
    React.createElement("div", { onClick:function(){props.onSelect(props.index);}, style:{display:"flex",alignItems:"flex-start",gap:16,cursor:"pointer"} },
      React.createElement("div", { style:{width:32,height:32,borderRadius:"50%",background:sel?BROWN:TAN,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:SERIF,fontSize:13,fontWeight:700,flexShrink:0} },
        ["A","B","C"][props.index]
      ),
      React.createElement("div", { style:{flex:1} },
        React.createElement("div", { style:{fontFamily:SERIF,fontSize:18,fontWeight:600,color:DARK,marginBottom:6} }, opt.title),
        React.createElement("div", { style:{fontFamily:TXT,fontSize:15,color:"#6B5A3E",lineHeight:1.55} }, opt.summary),
        React.createElement("div", { style:{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"} },
          (opt.tags||[]).map(function(t) { return React.createElement(Tag, {key:t}, t); })
        )
      )
    ),
    React.createElement("div", { style:{marginLeft:48} },
      React.createElement(ImplDetail, { location:props.location, acreage:props.acreage, opt:opt })
    )
  );
}

function buildPDFHtml(ranked, location, acreage) {
  var date = new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});
  var loc = location + (acreage ? " - " + acreage + " acres" : "");
  var rc = ["#4A7C59",BROWN,"#8B7355"];
  var tc = {Zoning:BROWN,Environmental:"#4A7C59",Building:"#2A5C8B","State License":"#7C4A7C",Utility:"#7C6A2A",Other:"#8B7355"};

  function pblock(pd) {
    if (!pd) return "<p style='color:#8B7355'>Permit details unavailable.</p>";
    var rows = "";
    for (var i=0;i<pd.permits.length;i++) {
      var p=pd.permits[i];
      rows += "<tr style='border-left:3px solid "+(tc[p.type]||"#8B7355")+"'><td style='padding:8px'>"+p.name+"<br><small style='color:#6B5A3E'>"+p.notes+"</small></td><td style='padding:8px;font-size:10px'>"+p.type+"</td><td style='padding:8px;font-size:10px'>"+p.timelineDays+"</td><td style='padding:8px;text-align:right'>"+dollars(p.costLow)+" to "+dollars(p.costHigh)+"</td></tr>";
    }
    return "<p><b>Permit Costs: "+dollars(pd.totalCostLow)+" - "+dollars(pd.totalCostHigh)+"</b> - "+pd.costNote+"</p><table style='width:100%;border-collapse:collapse;font-size:12px;margin-top:8px'><thead><tr style='background:#EDE4D6'><th style='padding:6px;text-align:left'>Permit</th><th style='padding:6px;text-align:left'>Type</th><th style='padding:6px;text-align:left'>Timeline</th><th style='padding:6px;text-align:right'>Cost</th></tr></thead><tbody>"+rows+"</tbody></table>";
  }

  var srows = "";
  for (var i=0;i<ranked.length;i++) {
    var r=ranked[i];
    srows += "<tr style='border-left:4px solid "+rc[i]+"'><td style='padding:10px'>"+(i+1)+"</td><td style='padding:10px;font-weight:600'>"+r.opt.title+"</td><td style='padding:10px;text-align:right'>"+dollars(r.estimatedValue)+"</td><td style='padding:10px;text-align:right'>"+dollars(r.estimatedCost)+"</td><td style='padding:10px;text-align:right;font-weight:700;color:"+rc[i]+"'>"+dollars(r.netValue)+"</td><td style='padding:10px;text-align:right;color:"+rc[i]+"'>"+r.roi+"%</td></tr>";
  }

  var cards = "";
  for (var j=0;j<ranked.length;j++) {
    var r=ranked[j];
    var hbg=j===0?BROWN:"#F0E8D8", tcol=j===0?"#F7F2E8":DARK, scol=j===0?"#D4C4A8":"#6B5A3E", lcol=j===0?TAN:"#8B7355", ncol=j===0?"#F7F2E8":rc[j];
    var tags="";
    (r.opt.tags||[]).forEach(function(t){tags+="<span style='font-family:monospace;font-size:9px;text-transform:uppercase;background:#EDE4D6;color:"+BROWN+";padding:2px 6px;border-radius:2px;margin-right:4px'>"+t+"</span>";});
    cards += "<div style='margin-bottom:28px;border:1.5px solid #D4C4A8;border-radius:3px;overflow:hidden;page-break-inside:avoid'>"
      +"<div style='background:"+hbg+";padding:16px 22px'>"
      +"<div style='font-size:9px;text-transform:uppercase;color:"+lcol+";margin-bottom:4px'>Rank "+(j+1)+" by Net Value</div>"
      +"<div style='font-family:Georgia,serif;font-size:20px;font-weight:700;color:"+tcol+"'>"+r.opt.title+"</div>"
      +"<div style='font-size:13px;color:"+scol+";margin-top:4px'>"+r.opt.summary+"</div>"
      +"<div style='margin-top:6px;font-weight:700;color:"+ncol+"'>Net: "+dollars(r.netValue)+" | ROI: "+r.roi+"%</div></div>"
      +"<div style='padding:16px 22px;background:#FDFAF5'>"
      +"<p><b>Completed Value:</b> "+dollars(r.estimatedValue)+" - "+r.valuationBasis+"</p>"
      +"<p style='margin-top:6px'><b>Dev. Cost:</b> "+dollars(r.estimatedCost)+"</p>"
      +"<p style='margin-top:6px'>"+r.implOverview+"</p>"
      +"<div style='margin-top:12px'>"+pblock(r.permitData)+"</div></div></div>";
  }

  return "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Land Use Report</title>"
    +"<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Georgia,serif;color:"+DARK+";background:"+CREAM+";padding:40px;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{.np{display:none}}</style>"
    +"</head><body><div style='max-width:820px;margin:0 auto'>"
    +"<h1 style='font-size:28px;margin-bottom:6px'>Development Evaluation Report</h1>"
    +"<p style='color:"+BROWN+";margin-bottom:28px'>"+loc+" - "+date+"</p>"
    +"<h2 style='font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:#8B7355;margin-bottom:12px'>Options Ranked by Net Value</h2>"
    +"<table style='width:100%;border-collapse:collapse;font-size:13px;margin-bottom:32px'><thead><tr style='background:"+BROWN+";color:"+CREAM+"'>"
    +"<th style='padding:9px;text-align:left'>Rank</th><th style='padding:9px;text-align:left'>Development</th><th style='padding:9px;text-align:right'>Value</th><th style='padding:9px;text-align:right'>Cost</th><th style='padding:9px;text-align:right'>Net</th><th style='padding:9px;text-align:right'>ROI</th>"
    +"</tr></thead><tbody>"+srows+"</tbody></table>"
    +cards
    +"<div style='padding:12px;background:#EDE4D6;font-size:10px;color:#8B7355;margin-top:16px'>Informational only. Consult a licensed real estate attorney before making decisions.</div>"
    +"<div class='np' style='margin-top:24px'><button onclick='window.print()' style='background:"+BROWN+";color:"+CREAM+";border:none;padding:12px 24px;font-size:13px;cursor:pointer;border-radius:2px'>Print / Save as PDF</button></div>"
    +"</div></body></html>";
}

function openPDF(ranked, location, acreage) {
  var html = buildPDFHtml(ranked, location, acreage);
  // Try Blob URL first, fall back to data URI, then document.write
  try {
    if (window.Blob && URL.createObjectURL) {
      var blob = new Blob([html], {type:"text/html"});
      var url = URL.createObjectURL(blob);
      var win = window.open(url, "_blank");
      if (win) {
        win.onload = function() { setTimeout(function(){ win.focus(); win.print(); }, 800); };
        setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
        return;
      }
    }
  } catch(e) {}
  // Fallback: open blank window and write HTML directly
  try {
    var win2 = window.open("", "_blank");
    if (win2) {
      win2.document.open();
      win2.document.write(html);
      win2.document.close();
      setTimeout(function(){ win2.focus(); win2.print(); }, 800);
      return;
    }
  } catch(e) {}
  // Last resort: data URI
  try {
    var encoded = "data:text/html;charset=utf-8," + encodeURIComponent(html);
    window.open(encoded, "_blank");
  } catch(e) {
    alert("Could not open PDF. Please try again or use your browser's print function.");
  }
}

function ReportView(props) {
  var ranked = props.ranked;
  var rc = ["#4A7C59",BROWN,"#8B7355"];

  return React.createElement("div", { style:{minHeight:"100vh",background:CREAM,fontFamily:TXT} },
    React.createElement("div", { style:{background:BROWN,padding:"24px 32px"} },
      React.createElement("div", { style:{maxWidth:820,margin:"0 auto"} },
        React.createElement("h1", { style:{fontFamily:SERIF,fontSize:28,fontWeight:700,color:CREAM,margin:"0 0 6px 0"} }, "Development Evaluation Report"),
        React.createElement("div", { style:{fontFamily:MONO,fontSize:11,color:TAN} }, props.location + (props.acreage ? " - " + props.acreage + " acres" : ""))
      )
    ),
    React.createElement("div", { style:{maxWidth:820,margin:"0 auto",padding:"32px 32px 80px"} },
      React.createElement("div", { style:{display:"flex",gap:10,marginBottom:28,flexWrap:"wrap"} },
        React.createElement("button", { onClick:props.onBack, style:{fontFamily:MONO,fontSize:11,textTransform:"uppercase",background:"none",border:"1.5px solid #D4C4A8",color:BROWN,padding:"10px 20px",cursor:"pointer",borderRadius:2} }, "Back"),
        React.createElement("button", { onClick:function(){openPDF(ranked,props.location,props.acreage);}, style:{fontFamily:MONO,fontSize:11,textTransform:"uppercase",background:BROWN,color:CREAM,border:"none",padding:"10px 20px",cursor:"pointer",borderRadius:2} }, "Save as PDF")
      ),
      props.warnings && props.warnings.length > 0 && React.createElement("div", { style:{marginBottom:20,padding:"12px 16px",background:"#FFF8EC",border:"1.5px solid #D4A847",borderRadius:2} },
        React.createElement("div", { style:{fontFamily:MONO,fontSize:9,textTransform:"uppercase",color:"#8B6914",marginBottom:6} }, "Partial Report"),
        props.warnings.map(function(w,i){ return React.createElement("div", {key:i,style:{fontFamily:TXT,fontSize:13,color:"#7A5C10"}}, "- " + w); })
      ),
      React.createElement("div", { style:{marginBottom:32} },
        React.createElement(SecLabel, null, "Options Ranked by Net Value"),
        React.createElement("table", { style:{width:"100%",borderCollapse:"collapse",fontSize:13} },
          React.createElement("thead", null,
            React.createElement("tr", { style:{background:BROWN} },
              ["Rank","Development","Est. Value","Est. Cost","Net Value","ROI"].map(function(h,i) {
                return React.createElement("th", {key:h,style:{fontFamily:MONO,fontSize:9,textTransform:"uppercase",color:CREAM,padding:"10px 12px",textAlign:i>1?"right":"left"}}, h);
              })
            )
          ),
          React.createElement("tbody", null,
            ranked.map(function(r,i) {
              return React.createElement("tr", {key:i,style:{background:i===0?"#F0EAD8":i%2===0?"#FDFAF5":"#F7F2E8",borderLeft:"4px solid "+rc[i]}},
                React.createElement("td", {style:{padding:"10px 12px",fontFamily:MONO,fontSize:13}}, "#"+(i+1)),
                React.createElement("td", {style:{padding:"10px 12px",fontFamily:SERIF,fontWeight:600,color:DARK}}, r.opt.title),
                React.createElement("td", {style:{padding:"10px 12px",textAlign:"right",fontFamily:MONO,fontSize:12,color:"#3D2E18"}}, dollars(r.estimatedValue)),
                React.createElement("td", {style:{padding:"10px 12px",textAlign:"right",fontFamily:MONO,fontSize:12,color:"#3D2E18"}}, dollars(r.estimatedCost)),
                React.createElement("td", {style:{padding:"10px 12px",textAlign:"right",fontFamily:MONO,fontSize:13,fontWeight:700,color:rc[i]}}, dollars(r.netValue)),
                React.createElement("td", {style:{padding:"10px 12px",textAlign:"right",fontFamily:MONO,fontSize:12,color:rc[i],fontWeight:600}}, r.roi+"%")
              );
            })
          )
        )
      ),
      ranked.map(function(r,rank) {
        return React.createElement("div", {key:rank,style:{marginBottom:28,border:"1.5px solid "+(rank===0?BROWN:"#D4C4A8"),borderRadius:3,overflow:"hidden"}},
          React.createElement("div", {style:{background:rank===0?BROWN:"#F0E8D8",padding:"16px 22px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}},
            React.createElement("div", {style:{flex:1}},
              React.createElement("div", {style:{fontFamily:MONO,fontSize:9,textTransform:"uppercase",color:rank===0?TAN:"#8B7355",marginBottom:5}}, "Rank "+(rank+1)+" by Net Value"),
              React.createElement("div", {style:{fontFamily:SERIF,fontSize:21,fontWeight:700,color:rank===0?CREAM:DARK}}, r.opt.title),
              React.createElement("div", {style:{fontFamily:TXT,fontSize:14,color:rank===0?"#D4C4A8":"#6B5A3E",marginTop:5,lineHeight:1.5}}, r.opt.summary)
            ),
            React.createElement("div", {style:{textAlign:"right"}},
              React.createElement("div", {style:{fontFamily:MONO,fontSize:9,textTransform:"uppercase",color:rank===0?TAN:"#8B7355",marginBottom:3}}, "Net Value"),
              React.createElement("div", {style:{fontFamily:SERIF,fontSize:24,fontWeight:700,color:rank===0?CREAM:rc[rank]}}, dollars(r.netValue)),
              React.createElement("div", {style:{fontFamily:MONO,fontSize:11,color:rank===0?TAN:"#8B7355"}}, "ROI "+r.roi+"%")
            )
          ),
          React.createElement("div", {style:{padding:"16px 22px",background:"#FDFAF5",borderBottom:"1px solid #D4C4A8"}},
            React.createElement(SecLabel, {color:BROWN}, "Financial Summary"),
            React.createElement("div", {style:{display:"flex",gap:24,flexWrap:"wrap",marginBottom:10}},
              React.createElement("div", null,
                React.createElement("div", {style:{fontFamily:MONO,fontSize:9,textTransform:"uppercase",color:"#8B7355",marginBottom:3}}, "Completed Value"),
                React.createElement("div", {style:{fontFamily:SERIF,fontSize:15,fontWeight:600,color:DARK}}, dollars(r.estimatedValue)),
                React.createElement("div", {style:{fontFamily:MONO,fontSize:9,color:"#8B7355",marginTop:2}}, r.valuationBasis)
              ),
              React.createElement("div", null,
                React.createElement("div", {style:{fontFamily:MONO,fontSize:9,textTransform:"uppercase",color:"#8B7355",marginBottom:3}}, "Total Dev. Cost"),
                React.createElement("div", {style:{fontFamily:SERIF,fontSize:15,fontWeight:600,color:DARK}}, dollars(r.estimatedCost))
              )
            ),
            React.createElement("p", {style:{fontFamily:TXT,fontSize:14,color:"#3D2E18",lineHeight:1.6}}, r.implOverview)
          ),
          React.createElement("div", {style:{padding:"16px 22px",background:"#FDFAF5"}},
            React.createElement(SecLabel, {color:BROWN}, "Permit Requirements & Costs"),
            React.createElement(PermitTable, {pd:r.permitData})
          )
        );
      }),
      React.createElement("div", {style:{padding:"14px 18px",background:"#EDE4D6",borderRadius:2,fontFamily:MONO,fontSize:10,color:"#8B7355",lineHeight:1.7}},
        "Informational only. AI-generated estimates. Consult a licensed real estate attorney and financial advisor before making development decisions."
      ),
      React.createElement("div", {style:{marginTop:28,paddingTop:24,borderTop:"2px solid #D4C4A8",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16}},
        React.createElement("div", null,
          React.createElement("div", {style:{fontFamily:SERIF,fontSize:17,fontWeight:600,color:DARK,marginBottom:4}}, "Save this report"),
          React.createElement("div", {style:{fontFamily:TXT,fontSize:14,color:"#6B5A3E"}}, "Opens print dialog - choose Save as PDF.")
        ),
        React.createElement("button", {onClick:function(){openPDF(ranked,props.location,props.acreage);},style:{background:BROWN,color:CREAM,border:"none",padding:"13px 28px",fontFamily:MONO,fontSize:11,textTransform:"uppercase",cursor:"pointer",borderRadius:2}}, "Save Report as PDF")
      )
    )
  );
}

export default function App() {
  var us = useState(getUser()); var user = us[0]; var setUser = us[1];
  var sa = useState(false); var showAuth = sa[0]; var setShowAuth = sa[1];
  var st = useState(0); var step = st[0]; var setStep = st[1];
  var lo = useState(""); var location = lo[0]; var setLocation = lo[1];
  var ac = useState(""); var acreage = ac[0]; var setAcreage = ac[1];
  var ld = useState(false); var loading = ld[0]; var setLoading = ld[1];
  var op = useState(null); var options = op[0]; var setOptions = op[1];
  var si = useState(null); var selIdx = si[0]; var setSelIdx = si[1];
  var pe = useState(null); var permits = pe[0]; var setPermits = pe[1];
  var er = useState(""); var error = er[0]; var setError = er[1];
  var gr = useState(false); var genRep = gr[0]; var setGenRep = gr[1];
  var rd = useState(null); var reportData = rd[0]; var setReportData = rd[1];
  var rs = useState(null); var repStatus = rs[0]; var setRepStatus = rs[1];
  var pi = useState(null); var propInfo = pi[0]; var setPropInfo = pi[1];
  var inputRef = useRef();

  useEffect(function() {
    var el = document.createElement("style");
    el.textContent = "@keyframes spin{to{transform:rotate(360deg)}} @keyframes fu{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}} .fu{animation:fu 0.4s ease forwards} input:focus{outline:none;border-color:"+BROWN+"!important} button:hover{opacity:0.82}";
    document.head.appendChild(el);
    return function() { try{document.head.removeChild(el);}catch(e){} };
  }, []);

  useEffect(function() {
    if (step === 0 && inputRef.current) inputRef.current.focus();
  }, [step]);

  function reset() {
    setStep(0); setLocation(""); setAcreage(""); setOptions(null);
    setSelIdx(null); setPermits(null); setError(""); setReportData(null);
    setRepStatus(null); setPropInfo(null);
  }

  function submitLocation() {
    if (!location.trim()) { setError("Please enter a location."); return; }
    setError(""); setLoading(true);

    // Check cache first - free
    var optCk = cacheKey("opts", location, acreage);
    var propCk = cacheKey("prop", location, acreage);
    var cachedOpts = cacheGet(optCk);
    var cachedProp = cacheGet(propCk);
    if (cachedOpts) {
      setOptions(cachedOpts);
      if (cachedProp) setPropInfo(cachedProp);
      setStep(1); setLoading(false);
      // Still fetch prop in background if missing
      if (!cachedProp) fetchPropertyData(location, acreage).then(function(d){ if(d){setPropInfo(d);} });
      return;
    }

    // Step 1: fetch live property data from Zillow/LoopNet/Redfin via web search
    fetchPropertyData(location, acreage).then(function(propData) {
      if (propData) setPropInfo(propData);

      // Step 2: generate options - pass property context so prompt is shorter
      var ctx = propData ? ("Zoning:" + (propData.zoning||"unknown") + " Market:" + (propData.marketContext||"").slice(0,80)) : "";
      var optSys = "CRE expert. Return ONLY JSON array of 3 objects: [{title,summary,tags}]. summary=2 sentences. tags=3 strings. No markdown.";
      var msg = location + (acreage?", "+acreage+" acres":"") + ". " + ctx + ". Top 3 highest-value development options?";
      var tries = 0;
      function attempt() {
        callAI([{role:"user",content:msg}], optSys, 700).then(function(raw) {
          try {
            var d = tryJSON(raw);
            if (!Array.isArray(d)) throw new Error("not array");
            cacheSet(optCk, d);
            setOptions(d); setStep(1); setLoading(false);
          } catch(e) {
            tries++;
            if (tries < 3) { delay(1200).then(attempt); } else { setError("Could not load options: " + e.message); setLoading(false); }
          }
        }).catch(function(e) {
          tries++;
          if (tries < 3) { delay(1200).then(attempt); } else { setError("API error: " + e.message); setLoading(false); }
        });
      }
      attempt();
    });
  }

  function selectOption(idx) {
    setSelIdx(idx); setPermits(null); setLoading(true); setStep(2);
    var chosen = options[idx];
    var ck = cacheKey("road", location, chosen.title);
    var cached = cacheGet(ck);
    if (cached) { setPermits(cached); setLoading(false); return; }
    var sys = "Land use attorney. Return ONLY JSON, no markdown. Schema:{overview:string,permits:string[],timeline:string[],risks:string[],effort:string,totalEstimate:string}";
    callAI([{role:"user",content:location+(acreage?", "+acreage+" acres":"")+". "+chosen.title+". Permit roadmap."}], sys, 800).then(function(raw) {
      try { var d=tryJSON(raw); cacheSet(ck,d); setPermits(d); } catch(e) { setError("Parse error: "+e.message); }
      setLoading(false);
    }).catch(function(e) { setError(e.message); setLoading(false); });
  }

  function generateReport() {
    setGenRep(true); setError(""); setRepStatus(null);
    var warnings = [];
    var locStr = location + (acreage ? ", " + acreage + " acres" : "");

    // Check if whole report is cached
    var repCk = cacheKey("report", location, acreage, (options||[]).map(function(o){return o.title;}).join(","));
    var cachedRep = cacheGet(repCk);
    if (cachedRep) { setReportData(cachedRep); setGenRep(false); return; }

    // Fetch live comparables from LoopNet/Zillow for each option type (runs in parallel, cached)
    var compPromises = options.map(function(opt) { return fetchComparables(location, opt.title); });

    Promise.all(compPromises).then(function(comps) {
      var valSys = "CRE analyst. Return ONLY JSON: {estimatedValue:integer,estimatedCost:integer,netValue:integer,roi:integer,valuationBasis:string,implOverview:string}. Plain integers, no $ signs.";
      var valuations = [];
      var valIdx = 0;

      function nextVal() {
        if (valIdx >= options.length) { doPermits(); return; }
        var i = valIdx; valIdx++;
        var opt = options[i];
        var ck = cacheKey("val", location, opt.title, acreage);
        var cached = cacheGet(ck);
        if (cached) { valuations[i] = cached; delay(0).then(nextVal); return; }
        var comp = comps[i];
        // Feed real market data into prompt - dramatically reduces hallucination and token waste
        var mktCtx = comp ? ("Live market data: avg $"+comp.avgPricePerSqft+"/sqft, cap rate "+comp.avgCapRate+"%, land ~$"+comp.medianLandValue+"/sqft, "+comp.activeListings+" active listings. Source:"+comp.dataSource+".") : "";
        var msg = locStr + ". " + opt.title + ": " + opt.summary + ". " + mktCtx + " Estimate value, cost, net, ROI, basis, 2-sentence overview.";
        callAI([{role:"user",content:msg}], valSys, 500).then(function(raw) {
        try {
          var v = tryJSON(raw);
          var vobj = {
            index: i,
            estimatedValue: Math.abs(Number(v.estimatedValue)||Number(v.value)||0),
            estimatedCost: Math.abs(Number(v.estimatedCost)||Number(v.cost)||0),
            netValue: Math.abs(Number(v.netValue)||Number(v.net)||0),
            roi: Math.abs(Number(v.roi)||Number(v.ROI)||0),
            valuationBasis: v.valuationBasis||v.basis||"",
            implOverview: v.implOverview||v.overview||""
          };
          if (!vobj.netValue && vobj.estimatedValue && vobj.estimatedCost) vobj.netValue = vobj.estimatedValue - vobj.estimatedCost;
          if (!vobj.roi && vobj.estimatedCost) vobj.roi = Math.round(vobj.netValue/vobj.estimatedCost*100);
          cacheSet(cacheKey("val",location,opt.title,acreage), vobj);
          valuations[i] = vobj;
        } catch(e) {
          warnings.push("Valuation unavailable for " + opt.title);
          valuations[i] = { index:i, estimatedValue:0, estimatedCost:0, netValue:0, roi:0, valuationBasis:"", implOverview:"" };
        }
        delay(300).then(nextVal);
        }).catch(function(e) {
          warnings.push("Valuation failed for " + opt.title + ": " + e.message);
          valuations[i] = { index:i, estimatedValue:0, estimatedCost:0, netValue:0, roi:0, valuationBasis:"", implOverview:"" };
          delay(300).then(nextVal);
        });
      }

      function doPermits() {
      var pSys = "CRE permit specialist. Return ONLY JSON: {permits:[{name,type,costLow,costHigh,timelineDays,notes}],totalCostLow,totalCostHigh,costNote}. type=Zoning|Environmental|Building|State License|Utility|Other. Plain integers, no $ signs.";
      var details = new Array(options.length).fill(null);
      var pIdx = 0;
      function nextPermit() {
        if (pIdx >= options.length) {
          var ranked = valuations
            .map(function(v) { return Object.assign({}, v, { opt: options[v.index], permitData: details[v.index] || null }); })
            .sort(function(a,b) { return b.netValue - a.netValue; });
          cacheSet(repCk, ranked);
          if (warnings.length) setRepStatus(warnings);
          setReportData(ranked);
          setGenRep(false);
          return;
        }
        var i = pIdx; pIdx++;
        var opt = options[i];
        var pCk = cacheKey("perm", location, opt.title, acreage);
        var pCached = cacheGet(pCk);
        if (pCached) { details[i] = pCached; delay(0).then(nextPermit); return; }
        callAI([{role:"user",content:locStr+". "+opt.title+". List 5-8 permits with costs and timelines."}], pSys, 800).then(function(pr) {
          try {
            var pd = tryJSON(pr);
            pd.totalCostLow = Math.abs(Number(pd.totalCostLow) || Number(pd.totalLow) || 0);
            pd.totalCostHigh = Math.abs(Number(pd.totalCostHigh) || Number(pd.totalHigh) || 0);
            pd.permits = (pd.permits || []).map(function(p) {
              return Object.assign({}, p, { costLow: Math.abs(Number(p.costLow)||0), costHigh: Math.abs(Number(p.costHigh)||0) });
            });
            cacheSet(cacheKey("perm",location,opt.title,acreage), pd);
            details[i] = pd;
          } catch(e) { details[i] = getDefaultPermits(opt.title); warnings.push("Using standard permit template for " + opt.title); }
          delay(400).then(nextPermit);
        }).catch(function(e) { details[i] = getDefaultPermits(opt.title); delay(400).then(nextPermit); });
      }
      nextPermit();
    }

      nextVal();
    }).catch(function(e) { setError("Report failed: " + e.message); setGenRep(false); });
  }

  var effortCol = {Low:"#4A7C59",Moderate:"#8B7355",High:"#B85C2A","Very High":"#8B1A1A"};

  if (reportData) {
    return React.createElement(ReportView, {ranked:reportData,location:location,acreage:acreage,onBack:function(){setReportData(null);},warnings:repStatus});
  }

  return React.createElement("div", { style:{minHeight:"100vh",background:CREAM,fontFamily:TXT} },
    React.createElement("link", {rel:"stylesheet",href:"https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=DM+Mono:wght@400;500&display=swap"}),

    React.createElement("div", {style:{borderBottom:"1px solid #D4C4A8",background:"rgba(253,250,245,0.95)",position:"sticky",top:0,zIndex:10}},
      React.createElement("div", {style:{maxWidth:760,margin:"0 auto",padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}},
        React.createElement("span", {style:{fontFamily:SERIF,fontSize:15,fontWeight:600,color:DARK}}, "Land Use Evaluator"),
        React.createElement("div", {style:{display:"flex",alignItems:"center",gap:8}},
          ["Location","Options","Roadmap"].map(function(lbl,i){
            return React.createElement("div", {key:i,style:{display:"flex",alignItems:"center",gap:6}},
              React.createElement("div", {style:{display:"flex",alignItems:"center",gap:4,opacity:i>step?0.35:1}},
                React.createElement("div", {style:{width:20,height:20,borderRadius:"50%",background:i<step?BROWN:i===step?TAN:"#E8DCC8",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:MONO,fontSize:9,color:i<step?"#fff":BROWN}}, i<step?"v":i+1),
                React.createElement("span", {style:{fontFamily:MONO,fontSize:9,textTransform:"uppercase",color:i===step?DARK:"#8B7355"}}, lbl)
              ),
              i<2 && React.createElement("div", {style:{width:12,height:1,background:"#D4C4A8"}})
            );
          })
        )
      )
    ),

    React.createElement("div", {style:{maxWidth:720,margin:"0 auto",padding:"48px 24px 80px"}},

      step===0 && React.createElement("div", {className:"fu"},
        React.createElement("div", {style:{marginBottom:48}},
          React.createElement("div", {style:{fontFamily:MONO,fontSize:10,textTransform:"uppercase",color:"#8B7355",marginBottom:12,letterSpacing:"0.15em"}}, "Step 1 of 3"),
          React.createElement("h1", {style:{fontFamily:SERIF,fontSize:36,fontWeight:700,color:DARK,margin:0,lineHeight:1.2}}, "Where is your parcel?"),
          React.createElement("p", {style:{color:"#6B5A3E",fontSize:17,marginTop:12,lineHeight:1.6}}, "Enter an address, city, or region with approximate acreage to identify the top 3 development opportunities.")
        ),
        React.createElement("div", {style:{display:"flex",flexDirection:"column",gap:16}},
          React.createElement("div", null,
            React.createElement("label", {style:{fontFamily:MONO,fontSize:10,textTransform:"uppercase",color:"#8B7355",display:"block",marginBottom:8}}, "Location"),
            React.createElement("input", {ref:inputRef,value:location,onChange:function(e){setLocation(e.target.value);},onKeyDown:function(e){if(e.key==="Enter")submitLocation();},placeholder:"e.g. Scottsdale AZ or 700 Bennet St Cedar Hill TX",style:{width:"100%",boxSizing:"border-box",padding:"14px 18px",fontSize:16,fontFamily:TXT,border:"1.5px solid #D4C4A8",borderRadius:2,background:"#FDFAF5",color:DARK}})
          ),
          React.createElement("div", null,
            React.createElement("label", {style:{fontFamily:MONO,fontSize:10,textTransform:"uppercase",color:"#8B7355",display:"block",marginBottom:8}}, "Acreage (optional)"),
            React.createElement("input", {value:acreage,onChange:function(e){setAcreage(e.target.value);},onKeyDown:function(e){if(e.key==="Enter")submitLocation();},placeholder:"e.g. 12.5",style:{width:180,padding:"14px 18px",fontSize:16,fontFamily:TXT,border:"1.5px solid #D4C4A8",borderRadius:2,background:"#FDFAF5",color:DARK}})
          ),
          error && React.createElement("div", {style:{color:"#8B1A1A",fontFamily:MONO,fontSize:12}}, error),
          React.createElement("div", {style:{marginTop:8}},
            loading ? React.createElement(Spin, null) :
            React.createElement("button", {onClick:submitLocation,style:{background:BROWN,color:CREAM,border:"none",padding:"14px 36px",fontFamily:MONO,fontSize:12,textTransform:"uppercase",cursor:"pointer",borderRadius:2}}, "Evaluate Location")
          )
        )
      ),

      step>=1 && options && React.createElement("div", {className:"fu"},
        React.createElement("div", {style:{marginBottom:20}},
          React.createElement("div", {style:{fontFamily:MONO,fontSize:10,textTransform:"uppercase",color:"#8B7355",marginBottom:8}}, "Step 2 of 3 - "+location+(acreage?" - "+acreage+" acres":"")),
          React.createElement("h2", {style:{fontFamily:SERIF,fontSize:28,fontWeight:700,color:DARK,margin:0}}, "Property Overview")
        ),

        propInfo && React.createElement("div", {style:{marginBottom:28,border:"1.5px solid #D4C4A8",borderRadius:3,overflow:"hidden"}},
          React.createElement("div", {style:{background:BROWN,padding:"14px 22px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}},
            React.createElement("div", null,
              React.createElement("div", {style:{fontFamily:MONO,fontSize:9,textTransform:"uppercase",color:TAN,marginBottom:4}}, "Opportunity Score"),
              React.createElement("div", {style:{display:"flex",alignItems:"baseline",gap:6}},
                React.createElement("span", {style:{fontFamily:SERIF,fontSize:36,fontWeight:700,color:CREAM,lineHeight:1}}, propInfo.opportunityScore),
                React.createElement("span", {style:{fontFamily:MONO,fontSize:12,color:TAN}}, "/10")
              ),
              React.createElement("div", {style:{fontFamily:TXT,fontSize:13,color:"#D4C4A8",marginTop:4}}, propInfo.opportunityRationale)
            ),
            React.createElement("div", {style:{textAlign:"right"}},
              React.createElement("div", {style:{fontFamily:MONO,fontSize:11,color:TAN}}, propInfo.jurisdiction),
              acreage && React.createElement("div", {style:{fontFamily:MONO,fontSize:11,color:TAN}}, propInfo.landArea||acreage+" acres"),
              React.createElement("div", {style:{fontFamily:MONO,fontSize:11,color:TAN}}, propInfo.zoning)
            )
          ),
          React.createElement("div", {style:{display:"grid",gridTemplateColumns:"1fr 1fr",borderBottom:"1px solid #E8DCC8"}},
            [{l:"Market Context",v:propInfo.marketContext},{l:"Demographics",v:propInfo.demographics}].map(function(x,i){
              return React.createElement("div", {key:i,style:{padding:"14px 18px",borderRight:i===0?"1px solid #E8DCC8":"none",background:"#FDFAF5"}},
                React.createElement("div", {style:{fontFamily:MONO,fontSize:9,textTransform:"uppercase",color:"#8B7355",marginBottom:5}}, x.l),
                React.createElement("div", {style:{fontFamily:TXT,fontSize:14,color:"#3D2E18",lineHeight:1.6}}, x.v)
              );
            })
          ),
          React.createElement("div", {style:{display:"grid",gridTemplateColumns:"1fr 1fr"}},
            [{l:"Infrastructure",v:propInfo.infrastructure},{l:"Constraints",v:propInfo.constraints}].map(function(x,i){
              return React.createElement("div", {key:i,style:{padding:"14px 18px",borderRight:i===0?"1px solid #E8DCC8":"none",background:"#F7F2E8"}},
                React.createElement("div", {style:{fontFamily:MONO,fontSize:9,textTransform:"uppercase",color:"#8B7355",marginBottom:5}}, x.l),
                React.createElement("div", {style:{fontFamily:TXT,fontSize:14,color:"#3D2E18",lineHeight:1.6}}, x.v)
              );
            })
          )
        ),

        React.createElement("h3", {style:{fontFamily:SERIF,fontSize:22,fontWeight:700,color:DARK,margin:"0 0 8px 0"}}, "Top 3 Development Options"),
        React.createElement("p", {style:{color:"#6B5A3E",fontSize:15,margin:"0 0 20px 0"}}, "Click a card to generate a permit roadmap."),

        React.createElement("div", {style:{display:"flex",flexDirection:"column",gap:14,marginBottom:20}},
          options.map(function(opt,i){ return React.createElement(OptionCard,{key:i,opt:opt,index:i,onSelect:selectOption,selected:selIdx,location:location,acreage:acreage}); })
        ),

        loading && step===2 && React.createElement(Spin, null),

        React.createElement("div", {style:{display:"flex",alignItems:"center",gap:12,paddingTop:16,borderTop:"1px solid #E8DCC8",marginBottom:16,flexWrap:"wrap"}},
          genRep ? React.createElement(Spin, {s:true,label:"Building report..."}) :
          React.createElement("button", {onClick:generateReport,style:{background:"#4A7C59",color:CREAM,border:"none",padding:"13px 22px",fontFamily:MONO,fontSize:11,textTransform:"uppercase",cursor:"pointer",borderRadius:2}}, "Generate Full Report (All 3 Options)"),
          error && React.createElement("div", {style:{color:"#8B1A1A",fontFamily:MONO,fontSize:11}}, error)
        ),
        React.createElement("button", {onClick:reset,style:{background:"none",border:"none",color:"#8B7355",fontFamily:MONO,fontSize:11,textTransform:"uppercase",cursor:"pointer",padding:0,textDecoration:"underline"}}, "Start Over")
      ),

      step===2 && permits && !loading && React.createElement("div", {className:"fu",style:{marginTop:40,borderTop:"1px solid #D4C4A8",paddingTop:40}},
        React.createElement("div", {style:{marginBottom:22}},
          React.createElement("div", {style:{fontFamily:MONO,fontSize:10,textTransform:"uppercase",color:"#8B7355",marginBottom:8}}, "Step 3 of 3 - Permit Roadmap"),
          React.createElement("h2", {style:{fontFamily:SERIF,fontSize:28,fontWeight:700,color:DARK,margin:0}}, options[selIdx].title),
          React.createElement("p", {style:{color:"#6B5A3E",fontSize:16,marginTop:10,lineHeight:1.6}}, permits.overview)
        ),
        React.createElement("div", {style:{display:"flex",marginBottom:24,border:"1.5px solid #D4C4A8",borderRadius:2,overflow:"hidden"}},
          React.createElement("div", {style:{flex:1,padding:"14px 18px",background:"#F0E8D8",borderRight:"1px solid #D4C4A8"}},
            React.createElement(SecLabel, null, "Total Timeline"),
            React.createElement("div", {style:{fontFamily:SERIF,fontSize:15,color:DARK,fontWeight:600}}, permits.totalEstimate)
          ),
          React.createElement("div", {style:{padding:"14px 20px",background:"#F0E8D8"}},
            React.createElement(SecLabel, null, "Effort"),
            React.createElement("div", {style:{fontFamily:SERIF,fontSize:15,fontWeight:700,color:effortCol[permits.effort]||BROWN}}, permits.effort)
          )
        ),
        React.createElement(BulletList, {title:"Required Permits & Approvals",items:permits.permits,color:BROWN}),
        React.createElement(BulletList, {title:"Development Timeline",items:permits.timeline,color:"#4A7C59"}),
        React.createElement(BulletList, {title:"Key Risks & Challenges",items:permits.risks,color:"#B85C2A"}),
        React.createElement("div", {style:{padding:"14px 18px",background:"#EDE4D6",borderRadius:2,fontFamily:MONO,fontSize:10,color:"#8B7355",lineHeight:1.6}}, "Informational only. Permit requirements vary by jurisdiction. Consult a licensed land use attorney."),
        error && React.createElement("div", {style:{marginTop:10,color:"#8B1A1A",fontFamily:MONO,fontSize:12}}, error),
        React.createElement("div", {style:{marginTop:22,display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}},
          React.createElement("button", {onClick:function(){setStep(1);setSelIdx(null);setPermits(null);},style:{background:BROWN,color:CREAM,border:"none",padding:"12px 22px",fontFamily:MONO,fontSize:11,textTransform:"uppercase",cursor:"pointer",borderRadius:2}}, "Compare Other Options"),
          React.createElement("button", {onClick:reset,style:{background:"none",border:"1.5px solid #D4C4A8",color:BROWN,padding:"12px 22px",fontFamily:MONO,fontSize:11,textTransform:"uppercase",cursor:"pointer",borderRadius:2}}, "New Evaluation"),
          React.createElement("div", {style:{width:1,height:20,background:"#D4C4A8"}}),
          genRep ? React.createElement(Spin,{s:true,label:"Building report..."}) :
          React.createElement("button", {onClick:generateReport,style:{background:"#4A7C59",color:CREAM,border:"none",padding:"12px 22px",fontFamily:MONO,fontSize:11,textTransform:"uppercase",cursor:"pointer",borderRadius:2}}, "Generate Full Report")
        )
      )
    )
  );
}
