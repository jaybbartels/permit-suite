import { useState, useEffect, useCallback, useRef } from "react";
import { getUser, signIn, signOut, authHeadersAsync, getValidToken } from "./auth.js";

const API = import.meta.env.VITE_API_URL || "https://permit-suite-api.vercel.app";
const ACCENT = "#1B4F82";
const GREEN  = "#1D9E75";
const RED    = "#E24B4A";
const PROXIMITY_M = 50;

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function fmt(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  const now = new Date();
  const today = now.toDateString() === d.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate()+1);
  const tmrw = tomorrow.toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  if (today) return time;
  if (tmrw) return `Tomorrow ${time}`;
  return d.toLocaleDateString([],{month:'short',day:'numeric'}) + ' ' + time;
}

function StatusBadge({ status }) {
  const map = {
    scheduled:   { bg:'#EAF3DE', color:'#27500A', label:'Scheduled' },
    in_progress: { bg:'#E6F1FB', color:'#0C447C', label:'In progress' },
    completed:   { bg:'#F1EFE8', color:'#444441', label:'Done' },
    cancelled:   { bg:'#FCEBEB', color:'#791F1F', label:'Cancelled' },
  };
  const s = map[status] || map.scheduled;
  return <span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background:s.bg,color:s.color,fontWeight:500}}>{s.label}</span>;
}

function Card({ children, style={} }) {
  return <div style={{background:'var(--color-background-primary)',border:'0.5px solid var(--color-border-tertiary)',borderRadius:12,padding:'12px 14px',marginBottom:8,...style}}>{children}</div>;
}

function Btn({ children, onClick, color=ACCENT, outline=false, style={} }) {
  return <button onClick={onClick} style={{border:outline?`0.5px solid var(--color-border-secondary)`:'none',borderRadius:8,padding:'9px 16px',background:outline?'var(--color-background-primary)':color,color:outline?'var(--color-text-secondary)':'#fff',fontSize:13,fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',gap:6,...style}}>{children}</button>;
}

// ── Login screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!email || !password) return;
    setLoading(true); setError('');
    try {
      await signIn(email, password);
      onLogin();
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem',background:'var(--color-background-tertiary)'}}>
      <div style={{width:'100%',maxWidth:360}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{width:56,height:56,borderRadius:14,background:ACCENT,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
            <i className="ti ti-clipboard-check" style={{fontSize:28,color:'#fff'}}/>
          </div>
          <h1 style={{fontSize:22,fontWeight:500,margin:0}}>Property Inspection</h1>
          <p style={{fontSize:13,color:'var(--color-text-secondary)',marginTop:4}}>Sign in to view your assignments</p>
        </div>
        <Card>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="Email" onKeyDown={e=>e.key==='Enter'&&handleLogin()}
              style={{width:'100%'}} />
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
              placeholder="Password" onKeyDown={e=>e.key==='Enter'&&handleLogin()}
              style={{width:'100%'}} />
            {error && <p style={{fontSize:12,color:RED,margin:0,padding:'6px 10px',background:'#FCEBEB',borderRadius:6}}>{error}</p>}
            <Btn onClick={handleLogin} style={{width:'100%',justifyContent:'center'}}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Queue tab ────────────────────────────────────────────────────────────────
function QueueTab({ inspections, activeId, onSelect, onStart, inspectorLat, inspectorLng }) {
  const today = [], upcoming = [], done = [];
  const now = new Date();
  inspections.forEach(i => {
    if (i.status === 'completed' || i.status === 'cancelled') { done.push(i); return; }
    const d = i.scheduled_at ? new Date(i.scheduled_at) : null;
    if (!d || d.toDateString() === now.toDateString()) today.push(i);
    else upcoming.push(i);
  });

  function InspCard({ insp }) {
    const dist = (inspectorLat && insp.lat)
      ? Math.round(distanceMeters(inspectorLat, inspectorLng, insp.lat, insp.lng))
      : null;
    const nearby = dist !== null && dist <= PROXIMITY_M;
    const isActive = insp.id === activeId;
    return (
      <Card style={isActive ? {border:`1.5px solid ${ACCENT}`} : {}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:500,color:'var(--color-text-primary)'}}>{insp.address}</div>
            <div style={{fontSize:11,color:'var(--color-text-secondary)',marginTop:2}}>{insp.inspection_type || 'General inspection'}</div>
          </div>
          <StatusBadge status={insp.status} />
        </div>
        <div style={{display:'flex',gap:12,marginTop:8,fontSize:11,color:'var(--color-text-tertiary)',alignItems:'center',flexWrap:'wrap'}}>
          {insp.scheduled_at && <span><i className="ti ti-clock" style={{fontSize:13,verticalAlign:-2}}/> {fmt(insp.scheduled_at)}</span>}
          {dist !== null && <span style={{color:nearby?GREEN:'inherit'}}><i className="ti ti-map-pin" style={{fontSize:13,verticalAlign:-2}}/> {dist < 1000 ? `${dist}m` : `${(dist/1000).toFixed(1)}km`}{nearby?' · Arrived!':''}</span>}
        </div>
        <div style={{display:'flex',gap:8,marginTop:10}}>
          <Btn outline onClick={()=>onSelect(insp)} style={{flex:1,justifyContent:'center',fontSize:12,padding:'7px 0'}}>
            <i className="ti ti-eye" style={{fontSize:14}}/> View
          </Btn>
          {insp.status === 'scheduled' && (
            <Btn onClick={()=>onStart(insp)} style={{flex:1,justifyContent:'center',fontSize:12,padding:'7px 0',background:nearby?GREEN:ACCENT}}>
              <i className="ti ti-player-play" style={{fontSize:14}}/> Start
            </Btn>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div style={{padding:'12px',background:'var(--color-background-tertiary)',minHeight:400}}>
      {today.length > 0 && <>
        <p style={{fontSize:11,color:'var(--color-text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>Today</p>
        {today.map(i => <InspCard key={i.id} insp={i} />)}
      </>}
      {upcoming.length > 0 && <>
        <p style={{fontSize:11,color:'var(--color-text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8,marginTop:12}}>Upcoming</p>
        {upcoming.map(i => <InspCard key={i.id} insp={i} />)}
      </>}
      {today.length === 0 && upcoming.length === 0 && (
        <div style={{textAlign:'center',padding:'40px 20px',color:'var(--color-text-secondary)'}}>
          <i className="ti ti-circle-check" style={{fontSize:40,display:'block',marginBottom:12,color:GREEN}}/>
          <p style={{margin:0,fontSize:14}}>All inspections complete</p>
        </div>
      )}
    </div>
  );
}

// ── Active inspection tab ────────────────────────────────────────────────────
function ActiveTab({ inspection, onUpdateNotes, onComplete, onStartVoice, isRecording, transcript }) {
  const [localNotes, setLocalNotes] = useState(inspection?.notes || '');

  useEffect(() => { setLocalNotes(inspection?.notes || ''); }, [inspection?.id]);

  if (!inspection) {
    return (
      <div style={{padding:'40px 20px',textAlign:'center',color:'var(--color-text-secondary)',background:'var(--color-background-tertiary)',minHeight:400}}>
        <i className="ti ti-map-pin-off" style={{fontSize:40,display:'block',marginBottom:12}}/>
        <p style={{margin:0,fontSize:14}}>No active inspection</p>
        <p style={{margin:'4px 0 0',fontSize:12}}>Start an inspection from the Queue tab</p>
      </div>
    );
  }

  return (
    <div style={{padding:'12px',background:'var(--color-background-tertiary)',minHeight:400}}>
      <Card style={{border:`1.5px solid ${ACCENT}`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
          <div>
            <div style={{fontSize:14,fontWeight:500}}>{inspection.address}</div>
            <div style={{fontSize:12,color:'var(--color-text-secondary)',marginTop:2}}>{inspection.inspection_type}</div>
          </div>
          <StatusBadge status={inspection.status} />
        </div>

        {inspection.started_at && (
          <div style={{fontSize:11,color:'var(--color-text-tertiary)',marginBottom:10}}>
            <i className="ti ti-clock" style={{fontSize:13,verticalAlign:-2}}/> Started {fmt(inspection.started_at)}
          </div>
        )}

        <div style={{marginBottom:10}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
            <span style={{fontSize:12,fontWeight:500,color:'var(--color-text-secondary)'}}>Inspection notes</span>
            <button
              onClick={onStartVoice}
              style={{
                display:'flex',alignItems:'center',gap:5,
                background:isRecording?RED:ACCENT,
                border:'none',borderRadius:20,padding:'5px 12px',
                color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer'
              }}>
              <i className={`ti ti-${isRecording?'player-stop':'microphone'}`} style={{fontSize:14}}/>
              {isRecording ? 'Stop' : 'Record'}
            </button>
          </div>
          {isRecording && transcript && (
            <div style={{fontSize:12,color:ACCENT,background:'#E6F1FB',borderRadius:6,padding:'6px 10px',marginBottom:6,fontStyle:'italic'}}>
              <i className="ti ti-waveform" style={{fontSize:13,verticalAlign:-2,marginRight:4}}/>
              {transcript}
            </div>
          )}
          <textarea
            value={localNotes}
            onChange={e=>setLocalNotes(e.target.value)}
            onBlur={()=>onUpdateNotes(inspection.id, localNotes)}
            placeholder="Tap the microphone to record voice notes, or type here…"
            style={{width:'100%',minHeight:120,borderRadius:8,border:'0.5px solid var(--color-border-secondary)',padding:'8px 10px',fontSize:13,resize:'vertical',background:'var(--color-background-primary)',color:'var(--color-text-primary)',fontFamily:'var(--font-sans)'}}
          />
        </div>

        <div style={{display:'flex',gap:8}}>
          <Btn outline onClick={()=>onUpdateNotes(inspection.id, localNotes)} style={{flex:1,justifyContent:'center',fontSize:12,padding:'8px 0'}}>
            <i className="ti ti-device-floppy" style={{fontSize:14}}/> Save
          </Btn>
          <Btn onClick={()=>onComplete(inspection.id)} style={{flex:1,justifyContent:'center',fontSize:12,padding:'8px 0',background:GREEN}}>
            <i className="ti ti-circle-check" style={{fontSize:14}}/> Complete
          </Btn>
        </div>
      </Card>
    </div>
  );
}

// ── Reports tab ──────────────────────────────────────────────────────────────
function ReportsTab({ inspections }) {
  const done = inspections.filter(i => i.status === 'completed');
  if (!done.length) return (
    <div style={{padding:'40px 20px',textAlign:'center',color:'var(--color-text-secondary)',background:'var(--color-background-tertiary)',minHeight:400}}>
      <i className="ti ti-file-off" style={{fontSize:40,display:'block',marginBottom:12}}/>
      <p style={{margin:0,fontSize:14}}>No completed inspections yet</p>
    </div>
  );
  return (
    <div style={{padding:'12px',background:'var(--color-background-tertiary)',minHeight:400}}>
      {done.map(i => (
        <Card key={i.id}>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <div style={{width:36,height:36,borderRadius:8,background:'#E6F1FB',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <i className="ti ti-file-check" style={{fontSize:18,color:ACCENT}}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:500}}>{i.address}</div>
              <div style={{fontSize:11,color:'var(--color-text-secondary)',marginTop:2}}>
                {i.inspection_type} · {fmt(i.completed_at)}
              </div>
            </div>
            <i className="ti ti-chevron-right" style={{fontSize:16,color:'var(--color-text-tertiary)'}}/>
          </div>
          {i.notes && (
            <div style={{marginTop:8,fontSize:12,color:'var(--color-text-secondary)',background:'var(--color-background-secondary)',borderRadius:6,padding:'6px 10px',lineHeight:1.5}}>
              {i.notes.slice(0,120)}{i.notes.length>120?'…':''}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(getUser());
  const [tab, setTab] = useState('queue');
  const [inspections, setInspections] = useState([]);
  const [activeInspection, setActiveInspection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [inspectorLat, setInspectorLat] = useState(null);
  const [inspectorLng, setInspectorLng] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);
  const watchRef = useRef(null);

  // Load inspections
  async function loadInspections() {
    const hdrs = await authHeadersAsync();
    if (!hdrs.Authorization) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/inspection/list`, { headers: hdrs });
      if (res.ok) {
        const { inspections: list } = await res.json();
        setInspections(list || []);
        // Restore active inspection
        const active = list?.find(i => i.status === 'in_progress');
        if (active) setActiveInspection(active);
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { if (user) loadInspections(); }, [user]);

  // GPS tracking
  function startTracking() {
    if (!navigator.geolocation) return;
    setTracking(true);
    watchRef.current = navigator.geolocation.watchPosition(
      async pos => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setInspectorLat(lat); setInspectorLng(lng);
        const hdrs = await authHeadersAsync();
        if (hdrs.Authorization) {
          fetch(`${API}/api/inspection/location`, {
            method: 'POST', headers: hdrs,
            body: JSON.stringify({ lat, lng, accuracy }),
          }).catch(()=>{});
        }
      },
      () => setTracking(false),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }

  function stopTracking() {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    setTracking(false);
  }

  useEffect(() => {
    if (user) startTracking();
    return () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current); };
  }, [user]);

  // Start inspection
  async function handleStart(insp) {
    const hdrs = await authHeadersAsync();
    const res = await fetch(`${API}/api/inspection/update`, {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ id: insp.id, status: 'in_progress', started_at: new Date().toISOString() }),
    });
    if (res.ok) {
      const { inspection } = await res.json();
      setInspections(prev => prev.map(i => i.id === insp.id ? inspection : i));
      setActiveInspection(inspection);
      setTab('active');
    }
  }

  // Update notes
  async function handleUpdateNotes(id, notes) {
    const hdrs = await authHeadersAsync();
    const res = await fetch(`${API}/api/inspection/update`, {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ id, notes }),
    });
    if (res.ok) {
      const { inspection } = await res.json();
      setInspections(prev => prev.map(i => i.id === id ? inspection : i));
      setActiveInspection(prev => prev?.id === id ? inspection : prev);
      // Also save as a note record
      fetch(`${API}/api/inspection/notes`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ inspection_id: id, content: notes, source: 'text' }),
      }).catch(()=>{});
    }
  }

  // Complete inspection
  async function handleComplete(id) {
    const hdrs = await authHeadersAsync();
    const res = await fetch(`${API}/api/inspection/update`, {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ id, status: 'completed', completed_at: new Date().toISOString() }),
    });
    if (res.ok) {
      const { inspection } = await res.json();
      setInspections(prev => prev.map(i => i.id === id ? inspection : i));
      setActiveInspection(null);
      setTab('reports');
    }
  }

  // Voice recording
  function handleVoice() {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      // Save transcript as note
      if (transcript && activeInspection) {
        const newNotes = (activeInspection.notes ? activeInspection.notes + '\n' : '') + transcript;
        handleUpdateNotes(activeInspection.id, newNotes);
        setTranscript('');
      }
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Voice recording not supported in this browser. Try Chrome or Safari on iOS.'); return; }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = e => {
      const t = Array.from(e.results).map(r => r[0].transcript).join(' ');
      setTranscript(t);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
    setTranscript('');
  }

  if (!user) return <LoginScreen onLogin={() => setUser(getUser())} />;

  const TABS = [
    { id: 'queue',   icon: 'ti-list-check',    label: 'Queue' },
    { id: 'active',  icon: 'ti-map-pin',        label: 'Active' },
    { id: 'reports', icon: 'ti-file-text',      label: 'Reports' },
  ];

  return (
    <div style={{maxWidth:480,margin:'0 auto',fontFamily:'var(--font-sans)'}}>
      {/* Header */}
      <div style={{background:ACCENT,padding:'10px 16px 14px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
          <div>
            <h1 style={{color:'#fff',fontSize:16,fontWeight:500,margin:0}}>
              Good {new Date().getHours()<12?'morning':new Date().getHours()<17?'afternoon':'evening'}, {user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0]}
            </h1>
            <p style={{color:'#B5D4F4',fontSize:12,margin:0}}>
              {inspections.filter(i=>i.status==='scheduled'||i.status==='in_progress').length} inspections pending
            </p>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button
              onClick={tracking ? stopTracking : startTracking}
              style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:20,padding:'4px 10px',color:'#fff',fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:tracking?'#5DCAA5':'#F09595',display:'inline-block'}}/>
              {tracking ? 'GPS on' : 'GPS off'}
            </button>
            <button onClick={()=>{signOut();setUser(null);}} style={{background:'none',border:'none',color:'#B5D4F4',fontSize:11,cursor:'pointer'}}>
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'0.5px solid var(--color-border-tertiary)',background:'var(--color-background-primary)'}}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{flex:1,padding:'10px 4px',textAlign:'center',fontSize:11,
              color:tab===t.id?ACCENT:'var(--color-text-secondary)',
              borderBottom:tab===t.id?`2px solid ${ACCENT}`:'2px solid transparent',
              background:'none',border:'none',borderBottom:tab===t.id?`2px solid ${ACCENT}`:'2px solid transparent',
              cursor:'pointer',fontWeight:tab===t.id?500:400}}>
            <i className={`ti ${t.icon}`} style={{display:'block',fontSize:18,marginBottom:2}}/>
            {t.label}
            {t.id==='active' && activeInspection && (
              <span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:ACCENT,marginLeft:3,verticalAlign:2}}/>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <div style={{padding:'40px',textAlign:'center',color:'var(--color-text-secondary)'}}>
          <i className="ti ti-refresh" style={{fontSize:24,display:'block',marginBottom:8}}/>
          Loading inspections…
        </div>
      )}
      {!loading && tab === 'queue' && (
        <QueueTab
          inspections={inspections}
          activeId={activeInspection?.id}
          onSelect={i=>{setActiveInspection(i);setTab('active');}}
          onStart={handleStart}
          inspectorLat={inspectorLat}
          inspectorLng={inspectorLng}
        />
      )}
      {!loading && tab === 'active' && (
        <ActiveTab
          inspection={activeInspection}
          onUpdateNotes={handleUpdateNotes}
          onComplete={handleComplete}
          onStartVoice={handleVoice}
          isRecording={isRecording}
          transcript={transcript}
        />
      )}
      {!loading && tab === 'reports' && (
        <ReportsTab inspections={inspections} />
      )}
    </div>
  );
}
