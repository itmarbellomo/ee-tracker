import { useState, useEffect, useCallback, useMemo } from "react";

const STORAGE_KEY = "ee-tracker-script-url";
const COLS = ["id","title","course","dueDate","priority","description","completed","completedAt","createdAt","subtasks"];

const DEFAULT_COURSES = ["Signals & Systems","Circuit Theory","Digital Logic","Electromagnetics","Control Systems","Power Electronics","Microprocessors","Linear Algebra","Other"];
const PRIORITIES = ["High","Medium","Low"];
const DEFAULT_COLORS = ["#7f77dd","#10b981","#3b82f6","#f97316","#d97706","#ec4899","#84cc16","#06b6d4","#888780"];

// CSS injected into the document for media queries, light/dark mode, and iOS zoom prevention
const globalStyles = `
  :root {
    --bg-main: #f3f4f6;
    --bg-card: #ffffff;
    --bg-input: #f9fafb;
    --border: #e5e7eb;
    --text-main: #111827;
    --text-sub: #6b7280;
    --text-muted: #9ca3af;
    --accent: #6366f1;
    --accent-hover: #4f46e5;
    --accent-bg: #e0e7ff;
    --success: #10b981;
    --success-bg: #d1fae5;
    --danger: #ef4444;
    --danger-bg: #fee2e2;
    --warning: #f59e0b;
    --warning-bg: #fef3c7;
    --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    --radius-lg: 16px;
    --radius-md: 12px;
    --radius-sm: 8px;
    --font-ui: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --font-mono: 'IBM Plex Mono', monospace;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg-main: #0a0a0f;
      --bg-card: #13151f;
      --bg-input: #1c1f2e;
      --border: #2a2f45;
      --text-main: #f9fafb;
      --text-sub: #9ca3af;
      --text-muted: #4b5563;
      --accent: #818cf8;
      --accent-hover: #6366f1;
      --accent-bg: rgba(99, 102, 241, 0.15);
      --success: #34d399;
      --success-bg: rgba(16, 185, 129, 0.15);
      --danger: #f87171;
      --danger-bg: rgba(239, 68, 68, 0.15);
      --warning: #fbbf24;
      --warning-bg: rgba(245, 158, 11, 0.15);
      --shadow: 0 8px 16px -4px rgba(0, 0, 0, 0.5);
    }
  }

  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; background-color: var(--bg-main); color: var(--text-main); font-family: var(--font-ui); -webkit-font-smoothing: antialiased; }
  
  /* CRITICAL: font-size 16px prevents iPhone Safari from auto-zooming on tap */
  input, select, textarea { font-family: var(--font-ui); font-size: 16px !important; touch-action: manipulation; }
  button { font-family: var(--font-ui); touch-action: manipulation; }
  
  .app-container { display: flex; flex-direction: row; min-height: 100vh; }
  .sidebar { width: 240px; background: var(--bg-card); border-right: 1px solid var(--border); padding: 1.5rem; display: flex; flex-direction: column; gap: 12px; flex-shrink: 0; }
  .main-content { flex: 1; padding: 2rem; overflow-y: auto; height: 100vh; }
  
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .controls-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

  /* Mobile Overrides */
  @media (max-width: 768px) {
    .app-container { flex-direction: column; }
    .sidebar { width: 100%; border-right: none; border-bottom: 1px solid var(--border); padding: 1rem; position: sticky; top: 0; z-index: 50; flex-direction: row; align-items: center; flex-wrap: wrap; justify-content: space-between; box-shadow: var(--shadow); }
    .sidebar-header { margin-bottom: 0 !important; width: 100%; }
    .sidebar-tabs { display: flex; gap: 8px; flex-direction: row !important; width: 100%; margin-top: 8px; overflow-x: auto; padding-bottom: 4px; }
    .sidebar-tabs button { flex: 1; white-space: nowrap; text-align: center !important; }
    .sidebar-status { display: none; } 
    .main-content { padding: 1rem; height: auto; }
    
    .grid-4 { grid-template-columns: repeat(2, 1fr); }
    .grid-3 { grid-template-columns: 1fr; }
    .form-grid { grid-template-columns: 1fr; }
    .controls-row { flex-direction: column; align-items: stretch; }
    .controls-row > div { display: flex; justify-content: space-between; width: 100%; overflow-x: auto; padding-bottom: 4px; }
  }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }
`;

function uid() { return Math.random().toString(36).slice(2,10); }
function today() { return new Date().toISOString().slice(0,10); }

// Format for input fields
function normalizeDate(d) {
  if (!d) return "";
  const str = String(d);
  if (str.includes("T")) return str.split("T")[0];
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  return str;
}

// Format for standard display (DD/MM/YYYY)
function displayDate(d) {
  if (!d) return "—";
  const parts = String(d).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

// Dynamic grouping format (Smart text vs literal dates)
function formatGroupDate(dateStr) {
  if (!dateStr || dateStr === "No date") return "No Date";
  const todayDate = new Date(); todayDate.setHours(0,0,0,0);
  const d = new Date(dateStr); d.setHours(0,0,0,0);
  const diff = Math.round((d - todayDate)/86400000);
  
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) {
     return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
  }
  return displayDate(dateStr);
}

// Timeline categorization for "By Priority" view
function getTimelineGroup(dueDate) {
  if (!dueDate) return { key: "99_No date", label: "No Date" };
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dueDate); d.setHours(0,0,0,0);
  const diffDays = Math.round((d - today) / 86400000);
  
  if (diffDays < 0) return { key: "01_Overdue", label: "Overdue" };
  if (diffDays === 0) return { key: "02_Today", label: "Today" };
  if (diffDays === 1) return { key: "03_Tomorrow", label: "Tomorrow" };
  
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  if (diffDays === 2) return { key: "04_Due 2 Days", label: `Due ${days[d.getDay()]}` };
  
  // Find upcoming Saturday (End of week)
  const daysToSaturday = 6 - today.getDay();
  const thisSaturday = new Date(today);
  thisSaturday.setDate(today.getDate() + daysToSaturday);
  if (d <= thisSaturday) return { key: "05_Weekend", label: "Due by Weekend" };
  
  const nextSaturday = new Date(thisSaturday);
  nextSaturday.setDate(thisSaturday.getDate() + 7);
  if (d <= nextSaturday) return { key: "06_NextWeek", label: "Due in a Week" };
  
  const twoWeeksSat = new Date(nextSaturday);
  twoWeeksSat.setDate(nextSaturday.getDate() + 7);
  if (d <= twoWeeksSat) return { key: "07_TwoWeeks", label: "Due in 2 Weeks" };
  
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return { key: `08_Month_${d.getFullYear()}_${String(d.getMonth()).padStart(2,'0')}`, label: `Due in ${months[d.getMonth()]} ${d.getFullYear()}` };
}

function fmt(ts) { 
  if (!ts) return "—"; 
  const d = new Date(ts); 
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ` + d.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"}); 
}

function dayKey(ts) { return new Date(ts).toISOString().slice(0,10); }
function isOverdue(a) { return !a.completed && a.dueDate < today(); }
function isDueSoon(a) { if (a.completed || isOverdue(a)) return false; const diff = (new Date(a.dueDate) - new Date(today())) / 86400000; return diff <= 2; }
function pct(a) { if (!a.subtasks.length) return a.completed ? 100 : 0; return Math.round(a.subtasks.filter(s=>s.completed).length / a.subtasks.length * 100); }

function rowsToAssignments(rows) {
  return rows.slice(1).filter(r => r[0]).map(r => ({
    id: r[0], title: r[1], course: r[2], dueDate: normalizeDate(r[3]), priority: r[4],
    description: r[5], completed: r[6] === "true" || r[6] === true,
    completedAt: r[7] || null, createdAt: r[8],
    subtasks: (() => { try { return JSON.parse(r[9] || "[]"); } catch { return []; } })()
  }));
}

function assignmentsToRows(assignments) {
  const header = COLS;
  const rows = assignments.map(a => [
    a.id, a.title, a.course, a.dueDate, a.priority, a.description,
    String(a.completed), a.completedAt || "", a.createdAt, JSON.stringify(a.subtasks)
  ]);
  return [header, ...rows];
}

function playSound(type) {
  try {
    const ctx = window.audioCtx || (window.audioCtx = new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'task') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }
  } catch(e) { console.error("Audio error:", e); }
}

export default function App() {
  const [scriptUrl, setScriptUrl] = useState(null);
  const [urlInput, setUrlInput] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [connected, setConnected] = useState(null);
  const [tab, setTab] = useState("assignments");
  const [filter, setFilter] = useState("All"); 
  const [groupBy, setGroupBy] = useState("dueDate"); 
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [subtaskInputs, setSubtaskInputs] = useState({});

  const [courses, setCourses] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ee-courses")) || DEFAULT_COURSES; } catch { return DEFAULT_COURSES; }
  });
  const [courseColors, setCourseColors] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ee-colors")) || DEFAULT_COLORS; } catch { return DEFAULT_COLORS; }
  });
  const [form, setForm] = useState({ title:"", course: courses.length > 0 ? courses[0] : "", dueDate:"", priority:"Medium", description:"" });

  useEffect(() => { localStorage.setItem("ee-courses", JSON.stringify(courses)); }, [courses]);
  useEffect(() => { localStorage.setItem("ee-colors", JSON.stringify(courseColors)); }, [courseColors]);
  useEffect(() => { const saved = localStorage.getItem(STORAGE_KEY); if (saved) setScriptUrl(saved); }, []);

  const fetchData = useCallback(async (url) => {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error("Network response was not ok");
      const data = await res.json();
      
      if (Array.isArray(data)) {
         setAssignments(rowsToAssignments(data));
      } else {
         if (data.assignments) setAssignments(rowsToAssignments(data.assignments));
         if (data.settings && data.settings.length >= 2) {
            const fetchedCourses = data.settings[0].filter(Boolean);
            const fetchedColors = data.settings[1].filter(Boolean);
            if (fetchedCourses.length > 0) setCourses(fetchedCourses);
            if (fetchedColors.length > 0) setCourseColors(fetchedColors);
         }
      }
      setConnected(true);
    } catch { setConnected(false); }
  }, []);

  useEffect(() => { if (scriptUrl) fetchData(scriptUrl); }, [scriptUrl, fetchData]);

  const saveData = useCallback(async (newAssignments, curCourses, curColors) => {
    if (!scriptUrl) return;
    setSaveStatus("saving");
    try {
      const payload = { 
        action: "save", 
        rows: assignmentsToRows(newAssignments), 
        settings: [curCourses || courses, curColors || courseColors] 
      };
      await fetch(scriptUrl, { 
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [scriptUrl, courses, courseColors]);

  const mutate = useCallback((newList) => { setAssignments(newList); saveData(newList, courses, courseColors); }, [saveData, courses, courseColors]);

  function connectUrl() {
    const url = urlInput.trim();
    if (!url) return;
    localStorage.setItem(STORAGE_KEY, url);
    setScriptUrl(url);
  }

  function addAssignment() {
    if (!form.title || !form.dueDate) return;
    const now = new Date().toISOString();
    const a = { id: uid(), ...form, completed: false, completedAt: null, createdAt: now, subtasks: [] };
    mutate([...assignments, a]);
    setForm({ title:"", course: courses.length > 0 ? courses[0] : "", dueDate:"", priority:"Medium", description:"" });
    setShowForm(false);
  }

  function updateAssignment() {
    const updated = assignments.map(a => a.id === editId ? { ...a, ...form } : a);
    mutate(updated);
    setEditId(null);
    setShowForm(false);
  }

  function deleteAssignment(id) { 
    mutate(assignments.filter(a => a.id !== id)); 
  }

  function toggleComplete(id) {
    const now = new Date().toISOString();
    const target = assignments.find(a => a.id === id);
    if (target && !target.completed) playSound('task');
    mutate(assignments.map(a => a.id !== id ? a : {
      ...a, completed: !a.completed, completedAt: !a.completed ? now : null
    }));
  }

  function addSubtask(aId) {
    const text = (subtaskInputs[aId] || "").trim();
    if (!text) return;
    mutate(assignments.map(a => a.id !== aId ? a : {
      ...a, subtasks: [...a.subtasks, { id: uid(), title: text, completed: false, completedAt: null }]
    }));
    setSubtaskInputs(p => ({ ...p, [aId]: "" }));
  }

  function toggleSubtask(aId, sId) {
    const now = new Date().toISOString();
    const targetA = assignments.find(a => a.id === aId);
    const targetS = targetA?.subtasks.find(s => s.id === sId);
    if (targetS && !targetS.completed) playSound('subtask');

    mutate(assignments.map(a => a.id !== aId ? a : {
      ...a, subtasks: a.subtasks.map(s => s.id !== sId ? s : {
        ...s, completed: !s.completed, completedAt: !s.completed ? now : null
      })
    }));
  }

  function deleteSubtask(aId, sId) {
    mutate(assignments.map(a => a.id !== aId ? a : { ...a, subtasks: a.subtasks.filter(s => s.id !== sId) }));
  }

  const summary = useMemo(() => {
    return {
      total: assignments.length,
      pending: assignments.filter(a => !a.completed).length,
      completed: assignments.filter(a => a.completed).length,
      overdue: assignments.filter(isOverdue).length,
      thisWeek: assignments.filter(a => {
        if(a.completed) return false;
        const d = new Date(a.dueDate), now = new Date();
        const diff = (d - now) / 86400000;
        return diff >= -1 && diff <= 7;
      }).length
    };
  }, [assignments]);

  const filtered = useMemo(() => {
    return assignments.filter(a => {
      if (filter === "Pending") return !a.completed;
      if (filter === "Completed") return a.completed;
      if (filter === "Overdue") return isOverdue(a);
      if (filter === "This Week") {
        if(a.completed) return false;
        const d = new Date(a.dueDate), now = new Date();
        const diff = (d - now) / 86400000;
        return diff >= -1 && diff <= 7;
      }
      return true;
    });
  }, [assignments, filter]);

  const grouped = useMemo(() => {
    const g = {};
    if (groupBy === "course") {
      filtered.forEach(a => { 
        const cKey = a.course || "No Course";
        (g[cKey] = g[cKey] || []).push(a); 
      });
      return g;
    }
    
    // Complex Timeline + Priority Sorting
    if (groupBy === "priority") {
      const pOrder = { "High": 1, "Medium": 2, "Low": 3 };
      filtered.forEach(a => {
        const tl = getTimelineGroup(a.dueDate);
        if (!g[tl.key]) g[tl.key] = { label: tl.label, items: [] };
        g[tl.key].items.push(a);
      });
      
      // Sort inside timeline by priority (High -> Low)
      Object.values(g).forEach(group => {
        group.items.sort((a,b) => pOrder[a.priority] - pOrder[b.priority]);
      });
      
      const sortedEntries = Object.entries(g).sort((a,b) => a[0].localeCompare(b[0]));
      return Object.fromEntries(sortedEntries.map(([k, v]) => [v.label, v.items]));
    }
    
    [...filtered].sort((a,b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999")).forEach(a => {
      const key = a.dueDate || "No date";
      (g[key] = g[key] || []).push(a);
    });
    return g;
  }, [filtered, groupBy]);

  const analytics = useMemo(() => {
    const allTimestamps = [];
    assignments.forEach(a => {
      if (a.completedAt) allTimestamps.push({ ts: a.completedAt, course: a.course, type: "task" });
      a.subtasks.forEach(s => { if (s.completedAt) allTimestamps.push({ ts: s.completedAt, course: a.course, type: "subtask" }); });
    });

    const dayMap = {};
    allTimestamps.forEach(({ ts }) => {
      const k = dayKey(ts);
      dayMap[k] = (dayMap[k] || 0) + 1;
    });

    const last14 = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - 13 + i);
      const k = d.toISOString().slice(0,10);
      return { date: k, label: `${d.getDate()}/${d.getMonth()+1}`, count: dayMap[k] || 0 };
    });

    const hourMap = Array(24).fill(0);
    allTimestamps.forEach(({ ts }) => { hourMap[new Date(ts).getHours()]++; });

    const dowMap = Array(7).fill(0);
    allTimestamps.forEach(({ ts }) => { dowMap[new Date(ts).getDay()]++; });

    const courseMap = {};
    allTimestamps.forEach(({ course }) => { 
      const cKey = course || "No Course";
      courseMap[cKey] = (courseMap[cKey] || 0) + 1; 
    });

    const thisWeekTotal = last14.slice(7).reduce((s,d) => s + d.count, 0);
    const lastWeekTotal = last14.slice(0,7).reduce((s,d) => s + d.count, 0);
    const weekChange = lastWeekTotal === 0 ? null : Math.round((thisWeekTotal - lastWeekTotal) / lastWeekTotal * 100);

    const procScore = (() => {
      const scores = assignments.filter(a => a.completed && a.completedAt && a.dueDate).map(a => {
        const total = new Date(a.dueDate) - new Date(a.createdAt);
        const used = new Date(a.completedAt) - new Date(a.createdAt);
        return total > 0 ? used / total : 1;
      });
      if (!scores.length) return null;
      const avg = scores.reduce((s,v) => s + v, 0) / scores.length;
      if (avg < 0.4) return { label: "Early Bird", emoji: "🐦", color: "var(--success)", pct: avg };
      if (avg < 0.7) return { label: "On Track", emoji: "✅", color: "var(--accent)", pct: avg };
      if (avg < 0.9) return { label: "Last Minute", emoji: "⚡", color: "var(--warning)", pct: avg };
      return { label: "Danger Zone", emoji: "🔥", color: "var(--danger)", pct: avg };
    })();

    const avgPerDay = allTimestamps.length ? (allTimestamps.length / Math.max(Object.keys(dayMap).length, 1)).toFixed(1) : 0;
    const peakHour = hourMap.indexOf(Math.max(...hourMap));
    const peakDay = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dowMap.indexOf(Math.max(...dowMap))];

    return { last14, hourMap, dowMap, courseMap, thisWeekTotal, lastWeekTotal, weekChange, procScore, avgPerDay, peakHour, peakDay, insight: null };
  }, [assignments]);

  if (!scriptUrl) return <Setup urlInput={urlInput} setUrlInput={setUrlInput} onConnect={connectUrl} />;

  return (
    <>
      <style>{globalStyles}</style>
      <div className="app-container">
        {/* Sidebar / Top Nav */}
        <div className="sidebar">
          <div className="sidebar-header" style={{ marginBottom:"1rem" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
              <div style={{ fontSize:14, fontWeight:800, color:"var(--accent)", letterSpacing:1.5, fontFamily:"var(--font-mono)" }}>EE TRACKER</div>
              <div style={{ fontSize:11, fontWeight:600, color:"var(--text-sub)", background:"var(--bg-input)", padding:"4px 8px", borderRadius:"6px" }}>TOTAL: {summary.total}</div>
            </div>
            <div className="sidebar-status" style={{ fontSize:11, color: connected ? "var(--success)" : "var(--danger)", display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background: connected ? "var(--success)" : "var(--danger)" }} />
              {connected ? "Sheets connected" : "Disconnected"}
            </div>
          </div>
          <div className="sidebar-tabs" style={{ display:"flex", flexDirection:"column", gap:8, width:"100%" }}>
            {[["assignments", "📋 Tasks"], ["analytics", "📊 Analytics"], ["settings", "⚙️ Settings"]].map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)} style={{ background: tab===t ? "var(--bg-input)" : "transparent", border: tab===t ? "1px solid var(--border)" : "1px solid transparent", borderRadius:"var(--radius-md)", padding:"12px 14px", color: tab===t ? "var(--text-main)" : "var(--text-sub)", fontSize:14, fontWeight:500, cursor:"pointer", textAlign:"left", textTransform:"capitalize", width:"100%", transition:"all 0.2s" }}>
                {label}
              </button>
            ))}
          </div>
          <div className="sidebar-status" style={{ marginTop:"auto", fontSize:12, color:"var(--text-sub)", textAlign:"center", fontWeight:500 }}>
            {saveStatus === "saving" && <span style={{ color:"var(--warning)" }}>Saving…</span>}
            {saveStatus === "saved" && <span style={{ color:"var(--success)" }}>Saved ✓</span>}
            {saveStatus === "error" && <span style={{ color:"var(--danger)" }}>Save failed</span>}
          </div>
          <button 
          onClick={() => { localStorage.removeItem(STORAGE_KEY); window.location.reload(); }} 
          style={{ background:"transparent", border:"none", color:"var(--danger)", fontSize:12, cursor:"pointer", marginTop:12 }}
        >
          Disconnect Sheet
        </button>
        </div>

        {/* Main Content */}
        <div className="main-content">
          {tab === "assignments" ? (
            <>
              {/* Filter Stat Cards */}
              <div className="grid-4" style={{ marginBottom:"2rem" }}>
                {[
                  { id: "Pending", l: "Pending", v: summary.pending, c: "var(--accent)" },
                  { id: "Completed", l: "Done", v: summary.completed, c: "var(--success)" },
                  { id: "Overdue", l: "Overdue", v: summary.overdue, c: "var(--danger)" },
                  { id: "This Week", l: "This Week", v: summary.thisWeek, c: "var(--warning)" }
                ].map(({ id, l, v, c }) => (
                  <div key={id} onClick={() => setFilter(filter === id ? "All" : id)} style={{ background: filter === id ? `${c}15` : "var(--bg-card)", border:`2px solid ${filter === id ? c : "var(--border)"}`, borderRadius:"var(--radius-lg)", padding:"16px", boxShadow:"var(--shadow)", cursor:"pointer", transition:"all 0.2s" }}>
                    <div style={{ fontSize:12, color:"var(--text-sub)", marginBottom:4, fontWeight:600 }}>{l}</div>
                    <div style={{ fontSize:28, fontWeight:700, color:c, fontFamily:"var(--font-mono)" }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Controls */}
              <div className="controls-row" style={{ marginBottom:"1.5rem" }}>
                <button onClick={() => { setShowForm(true); setEditId(null); setForm({ title:"", course:courses.length > 0 ? courses[0] : "", dueDate:"", priority:"Medium", description:"" }); }}
                  style={{ background:"var(--accent)", border:"none", borderRadius:"var(--radius-md)", padding:"12px 20px", color:"#fff", fontSize:14, cursor:"pointer", fontWeight:600, boxShadow:"var(--shadow)", flexShrink:0 }}>
                  + New Assignment
                </button>
                <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
                  {["dueDate","priority","course"].map(g => (
                    <button key={g} onClick={() => setGroupBy(g)} style={{ background: groupBy===g ? "var(--bg-input)" : "transparent", border:`1px solid ${groupBy===g ? "var(--border)" : "transparent"}`, borderRadius:"var(--radius-md)", padding:"8px 14px", color: groupBy===g ? "var(--text-main)" : "var(--text-sub)", fontSize:13, fontWeight:500, cursor:"pointer", whiteSpace:"nowrap" }}>
                      {g === "dueDate" ? "By Date" : g === "priority" ? "By Priority" : "By Course"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add/Edit Form */}
              {showForm && (
                <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:"1.5rem", marginBottom:"2rem", boxShadow:"var(--shadow)" }}>
                  <div style={{ fontSize:16, fontWeight:600, color:"var(--text-main)", marginBottom:16 }}>{editId ? "Edit Assignment" : "New Assignment"}</div>
                  <div className="form-grid" style={{ marginBottom:12 }}>
                    <input value={form.title} onChange={e => setForm(p => ({...p,title:e.target.value}))} placeholder="Title*" style={inputStyle} />
                    <select value={form.course} onChange={e => setForm(p => ({...p,course:e.target.value}))} style={inputStyle}>
                      <option value="">No Course</option>
                      {courses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="date" value={form.dueDate} onChange={e => setForm(p => ({...p,dueDate:e.target.value}))} style={inputStyle} />
                    <select value={form.priority} onChange={e => setForm(p => ({...p,priority:e.target.value}))} style={inputStyle}>
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <textarea value={form.description} onChange={e => setForm(p => ({...p,description:e.target.value}))} placeholder="Description (optional)" rows={3} style={{ ...inputStyle, resize:"vertical" }} />
                  <div style={{ display:"flex", gap:12, marginTop:16 }}>
                    <button onClick={editId ? updateAssignment : addAssignment} style={{ background:"var(--accent)", border:"none", borderRadius:"var(--radius-md)", padding:"12px 24px", color:"#fff", fontSize:14, cursor:"pointer", fontWeight:600, flex:1 }}>
                      {editId ? "Update Task" : "Save Task"}
                    </button>
                    <button onClick={() => { setShowForm(false); setEditId(null); }} style={{ background:"transparent", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:"12px 24px", color:"var(--text-sub)", fontSize:14, cursor:"pointer", fontWeight:500, flex:1 }}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Assignment groups */}
              {Object.keys(grouped).length === 0 && (
                <div style={{ textAlign:"center", color:"var(--text-muted)", fontSize:15, padding:"4rem 1rem" }}>No assignments match this filter. 🎉</div>
              )}
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group} style={{ marginBottom:"2rem" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"var(--text-sub)", letterSpacing:1.5, marginBottom:12, textTransform:"uppercase", borderBottom:"1px solid var(--border)", paddingBottom:8 }}>
                    {groupBy === "dueDate" ? formatGroupDate(group) : group}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    {items.map(a => <AssignmentCard key={a.id} a={a}
                      expanded={expandedId === a.id}
                      courses={courses}
                      courseColors={courseColors}
                      onExpand={() => setExpandedId(expandedId === a.id ? null : a.id)}
                      onToggle={() => toggleComplete(a.id)}
                      onEdit={() => { setEditId(a.id); setForm({ title:a.title, course:a.course, dueDate:a.dueDate, priority:a.priority, description:a.description }); setShowForm(true); window.scrollTo({top:0, behavior:'smooth'}); }}
                      onDelete={() => { if(window.confirm("Are you sure you want to delete this task?")) deleteAssignment(a.id); }}
                      subtaskInput={subtaskInputs[a.id] || ""}
                      onSubtaskInput={v => setSubtaskInputs(p => ({...p,[a.id]:v}))}
                      onAddSubtask={() => addSubtask(a.id)}
                      onToggleSubtask={sId => toggleSubtask(a.id, sId)}
                      onDeleteSubtask={sId => deleteSubtask(a.id, sId)}
                    />)}
                  </div>
                </div>
              ))}
            </>
          ) : tab === "settings" ? (
            <SettingsTab 
              courses={courses} 
              courseColors={courseColors} 
              setCourses={setCourses} 
              setCourseColors={setCourseColors} 
              assignments={assignments}
              mutate={mutate}
              saveData={saveData}
            />
          ) : (
            <Analytics data={{...analytics, courses, courseColors}} />
          )}
        </div>
      </div>
    </>
  );
}

const inputStyle = { background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:"12px 14px", color:"var(--text-main)", outline:"none", width:"100%", transition:"border 0.2s", minHeight:"44px" };

function AssignmentCard({ a, expanded, onExpand, onToggle, onEdit, onDelete, subtaskInput, onSubtaskInput, onAddSubtask, onToggleSubtask, onDeleteSubtask, courses, courseColors }) {
  const p = pct(a);
  const courseIdx = courses.indexOf(a.course);
  const courseColor = courseIdx >= 0 ? courseColors[courseIdx % courseColors.length] : "#888780";
  const prioritySymbols = { High: "↑", Medium: "•", Low: "↓" };

  return (
    <div style={{ background:"var(--bg-card)", border:`1px solid ${isOverdue(a) ? "var(--danger)" : isDueSoon(a) ? "var(--warning)" : "var(--border)"}`, borderRadius:"var(--radius-lg)", overflow:"hidden", opacity: a.completed ? 0.65 : 1, boxShadow:"var(--shadow)", transition:"all 0.2s" }}>
      <div style={{ padding:"16px" }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:14 }}>
          <button onClick={onToggle} style={{ width:26, height:26, borderRadius:"50%", border:`2px solid ${a.completed ? "var(--success)" : "var(--text-muted)"}`, background: a.completed ? "var(--success)" : "transparent", cursor:"pointer", flexShrink:0, marginTop:2, display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>
            {a.completed && <span style={{ color:"#fff", fontSize:14, lineHeight:1, fontWeight:800 }}>✓</span>}
          </button>
          
          <div style={{ flex:1, minWidth:0 }} onClick={onExpand} style={{cursor:"pointer", flex:1}}>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:6 }}>
              <span style={{ fontSize:16, fontWeight:600, color: a.completed ? "var(--text-sub)" : "var(--text-main)", textDecoration: a.completed ? "line-through" : "none", lineHeight:1.3 }}>{a.title}</span>
            </div>
            
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
              <span style={{ fontSize:11, fontWeight:600, padding:"4px 8px", borderRadius:"6px", background: `${courseColor}22`, color: courseColor }}>{a.course || "No Course"}</span>
              <span style={{ fontSize:11, fontWeight:600, padding:"3px 8px", borderRadius:"6px", background: "var(--bg-main)", color: "var(--text-sub)", border: "1px solid var(--border)" }}>{prioritySymbols[a.priority]} {a.priority}</span>
              {isOverdue(a) && <span style={{ fontSize:11, fontWeight:700, color:"var(--danger)", padding:"4px 0" }}>OVERDUE</span>}
              {isDueSoon(a) && <span style={{ fontSize:11, fontWeight:700, color:"var(--warning)", padding:"4px 0" }}>DUE SOON</span>}
            </div>
            
            <div style={{ fontSize:13, color:"var(--text-sub)", fontFamily:"var(--font-mono)" }}>Due: {displayDate(a.dueDate)}</div>
            
            {a.subtasks.length > 0 && (
              <div style={{ marginTop:12 }}>
                <div style={{ height:6, background:"var(--bg-input)", borderRadius:99, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${p}%`, background: p === 100 ? "var(--success)" : "var(--accent)", borderRadius:99, transition:"width 0.4s ease" }} />
                </div>
                <div style={{ fontSize:12, color:"var(--text-sub)", marginTop:6, fontWeight:500 }}>{p}% · {a.subtasks.filter(s=>s.completed).length}/{a.subtasks.length} tasks</div>
              </div>
            )}
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:8, flexShrink:0 }}>
            <button onClick={onExpand} style={iconBtn}>{expanded ? "▲" : "▼"}</button>
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop:"1px solid var(--border)", padding:"16px", background:"var(--bg-input)" }}>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:12, marginBottom:16 }}>
            <button onClick={onEdit} style={{...actionBtn, color:"var(--accent)"}}>✏ Edit</button>
            <button onClick={onDelete} style={{...actionBtn, color:"var(--danger)"}}>✕ Delete</button>
          </div>
          
          {a.description && <p style={{ fontSize:14, color:"var(--text-main)", marginBottom:16, lineHeight:1.5, whiteSpace:"pre-wrap" }}>{a.description}</p>}
          {a.completedAt && <p style={{ fontSize:12, color:"var(--success)", marginBottom:16, fontFamily:"var(--font-mono)" }}>Completed: {fmt(a.completedAt)}</p>}
          
          <div style={{ fontSize:12, fontWeight:700, color:"var(--text-sub)", marginBottom:10, letterSpacing:1 }}>SUBTASKS</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {a.subtasks.map(s => (
              <div key={s.id} style={{ display:"flex", alignItems:"center", gap:12, background:"var(--bg-card)", padding:"10px 12px", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)" }}>
                <button onClick={() => onToggleSubtask(s.id)} style={{ width:20, height:20, borderRadius:"50%", border:`2px solid ${s.completed ? "var(--success)" : "var(--text-muted)"}`, background: s.completed ? "var(--success)" : "transparent", cursor:"pointer", flexShrink:0, padding:0 }} />
                <span style={{ flex:1, fontSize:14, color: s.completed ? "var(--text-sub)" : "var(--text-main)", textDecoration: s.completed ? "line-through" : "none" }}>{s.title}</span>
                <button onClick={() => onDeleteSubtask(s.id)} style={{ background:"transparent", border:"none", color:"var(--text-muted)", fontSize:14, padding:"8px" }}>✕</button>
              </div>
            ))}
          </div>
          
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <input value={subtaskInput} onChange={e => onSubtaskInput(e.target.value)} onKeyDown={e => e.key === "Enter" && onAddSubtask()} placeholder="Add subtask…" style={{ ...inputStyle, flex:1, minHeight:"40px" }} />
            <button onClick={onAddSubtask} style={{ background:"var(--accent-bg)", border:"none", borderRadius:"var(--radius-md)", padding:"0 16px", color:"var(--accent)", fontSize:14, fontWeight:600, cursor:"pointer" }}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Settings Component
function SettingsTab({ courses, courseColors, setCourses, setCourseColors, assignments, mutate, saveData }) {
  
  const updateName = (index, val) => {
    const newC = [...courses];
    const oldName = newC[index];
    newC[index] = val;
    setCourses(newC);
    
    // Automatically update existing tasks to match the renamed course and instantly sync
    const updatedAssignments = assignments.map(a => a.course === oldName ? {...a, course: val} : a);
    mutate(updatedAssignments);
    saveData(updatedAssignments, newC, courseColors);
  };

  const updateColor = (index, val) => {
    const newCol = [...courseColors];
    newCol[index] = val;
    setCourseColors(newCol);
    saveData(assignments, courses, newCol);
  };

  const deleteCourse = (index) => {
    if(!window.confirm(`Are you sure you want to delete ${courses[index]}? Its existing tasks will have a blank course.`)) return;
    const oldName = courses[index];
    const newC = courses.filter((_, i) => i !== index);
    const newCol = courseColors.filter((_, i) => i !== index);
    
    setCourses(newC);
    setCourseColors(newCol);
    
    const updatedAssignments = assignments.map(a => a.course === oldName ? {...a, course: ""} : a);
    mutate(updatedAssignments);
    saveData(updatedAssignments, newC, newCol);
  };

  const addCourse = () => {
    const newC = [...courses, "New Course"];
    const newCol = [...courseColors, "#6366f1"];
    setCourses(newC);
    setCourseColors(newCol);
    saveData(assignments, newC, newCol);
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ fontSize:20, fontWeight:700, color:"var(--text-main)", marginBottom:20 }}>Course Settings</div>
      <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:"20px", boxShadow:"var(--shadow)" }}>
        <p style={{ fontSize:14, color:"var(--text-sub)", marginBottom:20 }}>Manage your courses and colors. They will automatically sync to your Google Sheet.</p>
        
        <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:20 }}>
          {courses.map((c, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12 }}>
              <input type="color" value={courseColors[i]} onChange={e => updateColor(i, e.target.value)} style={{ width:40, height:40, padding:0, border:"none", borderRadius:8, cursor:"pointer", background:"transparent" }} />
              <input value={c} onChange={e => updateName(i, e.target.value)} style={{ ...inputStyle, flex:1 }} />
              <button onClick={() => deleteCourse(i)} style={{ background:"var(--danger-bg)", border:"none", borderRadius:8, color:"var(--danger)", width:40, height:40, fontWeight:700, cursor:"pointer" }}>✕</button>
            </div>
          ))}
        </div>
        
        <button onClick={addCourse} style={{ background:"var(--accent-bg)", color:"var(--accent)", border:"none", borderRadius:"var(--radius-md)", padding:"12px 20px", fontSize:14, fontWeight:600, cursor:"pointer", width:"100%" }}>
          + Add Course
        </button>
      </div>
    </div>
  );
}

const iconBtn = { background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:"8px", color:"var(--text-sub)", cursor:"pointer", fontSize:12, padding:"8px 12px", display:"flex", alignItems:"center", justifyContent:"center" };
const actionBtn = { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"6px", fontSize:13, fontWeight:600, padding:"6px 12px", cursor:"pointer" };

function Analytics({ data }) {
  const { last14, hourMap, dowMap, courseMap, procScore, avgPerDay, peakHour, peakDay, courses, courseColors } = data;
  const maxDay = Math.max(...last14.map(d => d.count), 1);
  const maxHour = Math.max(...hourMap, 1);
  const maxDow = Math.max(...dowMap, 1);
  const dowLabels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const courseEntries = Object.entries(courseMap).sort((a,b) => b[1]-a[1]);
  const courseTotal = courseEntries.reduce((s,[,v]) => s+v, 0);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"1.5rem" }}>
      <div className="grid-3">
        <div style={{ background:"var(--bg-card)", border:`1px solid var(--border)`, borderRadius:"var(--radius-lg)", padding:"16px", boxShadow:"var(--shadow)" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"var(--text-sub)", marginBottom:8, textTransform:"uppercase" }}>Avg / Day</div>
          <div style={{ fontSize:28, fontWeight:700, color:"var(--success)", fontFamily:"var(--font-mono)" }}>{avgPerDay}</div>
          <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:6 }}>rolling 7-day</div>
        </div>
      </div>

      {procScore && (
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:"20px", boxShadow:"var(--shadow)" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"var(--text-sub)", letterSpacing:1.5, marginBottom:16 }}>PROCRASTINATION SCORE</div>
          <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
            <span style={{ fontSize:36 }}>{procScore.emoji}</span>
            <div style={{ flex:1, minWidth:"200px" }}>
              <div style={{ fontSize:18, fontWeight:700, color: procScore.color, marginBottom:4 }}>{procScore.label}</div>
              <div style={{ fontSize:13, color:"var(--text-muted)", marginBottom:10 }}>You use {Math.round(procScore.pct * 100)}% of available time on average</div>
              <div style={{ height:8, background:"var(--bg-input)", borderRadius:99, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${Math.round(procScore.pct * 100)}%`, background: procScore.color, borderRadius:99 }} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:"20px", boxShadow:"var(--shadow)" }}>
        <div style={{ fontSize:11, fontWeight:700, color:"var(--text-sub)", letterSpacing:1.5, marginBottom:20 }}>DAILY COMPLETIONS (14 DAYS)</div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:100 }}>
          {last14.map((d,i) => (
            <div key={d.date} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
              <div style={{ width:"100%", height: `${(d.count / maxDay) * 90}px`, minHeight: d.count ? 4 : 0, background: i >= 7 ? "var(--accent)" : "var(--border)", borderRadius:"4px 4px 0 0", transition:"height 0.3s" }} />
              {i % 3 === 0 && <div style={{ fontSize:10, color:"var(--text-muted)", writingMode:"vertical-rl", transform:"rotate(180deg)", height:30, overflow:"hidden", fontFamily:"var(--font-mono)" }}>{d.label}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="form-grid">
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:"20px", boxShadow:"var(--shadow)" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"var(--text-sub)", letterSpacing:1.5, marginBottom:20 }}>MOST PRODUCTIVE DAY</div>
          <div style={{ display:"flex", gap:6 }}>
            {dowLabels.map((d,i) => {
              const intensity = dowMap[i] / maxDow;
              return (
                <div key={d} style={{ flex:1, textAlign:"center" }}>
                  <div style={{ height:50, borderRadius:8, background: intensity > 0 ? `rgba(99, 102, 241, ${0.15 + intensity * 0.85})` : "var(--bg-input)", marginBottom:8, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <span style={{ fontSize:13, color: intensity > 0.5 ? "#fff" : "var(--text-main)", fontWeight:600 }}>{dowMap[i]}</span>
                  </div>
                  <div style={{ fontSize:11, fontWeight:600, color: d === peakDay ? "var(--accent)" : "var(--text-muted)" }}>{d}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:"20px", boxShadow:"var(--shadow)" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"var(--text-sub)", letterSpacing:1.5, marginBottom:20 }}>PEAK PRODUCTIVITY HOUR</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:50 }}>
            {hourMap.map((v,h) => (
              <div key={h} title={`${h}:00`} style={{ flex:1, height: `${(v / maxHour) * 46}px`, minHeight: v ? 4 : 0, background: h === peakHour ? "var(--success)" : "var(--bg-input)", borderRadius:"3px 3px 0 0" }} />
            ))}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:8 }}>
            {[0,6,12,18,23].map(h => <span key={h} style={{ fontSize:10, color:"var(--text-muted)", fontFamily:"var(--font-mono)" }}>{h}:00</span>)}
          </div>
          <div style={{ fontSize:13, fontWeight:600, color:"var(--success)", marginTop:12 }}>Peak: {peakHour}:00 – {peakHour+1}:00</div>
        </div>
      </div>

      {courseEntries.length > 0 && (
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:"20px", boxShadow:"var(--shadow)" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"var(--text-sub)", letterSpacing:1.5, marginBottom:20 }}>COURSE LOAD BREAKDOWN</div>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {courseEntries.map(([c,v]) => {
              const idx = courses.indexOf(c);
              const color = idx >= 0 ? courseColors[idx % courseColors.length] : "#888780";
              return (
                <div key={c}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, fontWeight:600, marginBottom:8 }}>
                    <span style={{ color:"var(--text-main)" }}>{c}</span>
                    <span style={{ color:"var(--text-sub)" }}>{v} tasks · {Math.round(v/courseTotal*100)}%</span>
                  </div>
                  <div style={{ height:8, background:"var(--bg-input)", borderRadius:99, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${v/courseTotal*100}%`, background:color, borderRadius:99 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Setup({ urlInput, setUrlInput, onConnect }) {
  const script = `const SHEET_NAME = "assignments";
const SETTINGS_NAME = "settings";

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  let setSheet = ss.getSheetByName(SETTINGS_NAME);
  if (!setSheet) setSheet = ss.insertSheet(SETTINGS_NAME);
  
  return ContentService.createTextOutput(JSON.stringify({
    assignments: sheet.getDataRange().getValues(),
    settings: setSheet.getDataRange().getValues()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.action === "save") {
      if (payload.rows) {
        let sheet = ss.getSheetByName(SHEET_NAME);
        if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
        sheet.clearContents();
        if(payload.rows.length > 0) sheet.getRange(1, 1, payload.rows.length, payload.rows[0].length).setValues(payload.rows);
      }
      if (payload.settings) {
        let setSheet = ss.getSheetByName(SETTINGS_NAME);
        if (!setSheet) setSheet = ss.insertSheet(SETTINGS_NAME);
        setSheet.clearContents();
        if(payload.settings.length > 0) setSheet.getRange(1, 1, payload.settings.length, payload.settings[0].length).setValues(payload.settings);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

  return (
    <>
      <style>{globalStyles}</style>
      <div style={{ minHeight:"100vh", background:"var(--bg-main)", display:"flex", alignItems:"center", justifyContent:"center", padding:"1.5rem" }}>
        <div style={{ maxWidth:600, width:"100%", background:"var(--bg-card)", padding:"2.5rem", borderRadius:"var(--radius-lg)", boxShadow:"var(--shadow)", border:"1px solid var(--border)" }}>
          <div style={{ fontSize:12, fontWeight:700, color:"var(--accent)", letterSpacing:2, marginBottom:12, fontFamily:"var(--font-mono)" }}>SETUP REQUIRED</div>
          <h1 style={{ fontSize:28, fontWeight:800, color:"var(--text-main)", marginBottom:8 }}>Update Your Connection</h1>
          <p style={{ fontSize:15, color:"var(--text-sub)", marginBottom:"2.5rem", lineHeight:1.6 }}>To sync your new custom Course Settings, you must update your Google Apps Script using the code below, and create a <strong>New Deployment</strong>.</p>

          <pre style={{ background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:16, fontSize:12, color:"var(--text-muted)", overflow:"auto", marginBottom:"2rem", lineHeight:1.5, fontFamily:"var(--font-mono)" }}>{script}</pre>

          <div style={{ display:"flex", gap:12, flexDirection: window.innerWidth < 600 ? "column" : "row" }}>
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="Paste your NEW Apps Script Web App URL here…" style={{ flex:1, background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:"14px 16px", color:"var(--text-main)", fontSize:14, outline:"none", minHeight:"48px" }} />
            <button onClick={onConnect} style={{ background:"var(--accent)", border:"none", borderRadius:"var(--radius-md)", padding:"14px 28px", color:"#fff", fontSize:15, cursor:"pointer", fontWeight:600, whiteSpace:"nowrap", minHeight:"48px" }}>Connect</button>
          </div>
        </div>
      </div>
    </>
  );
}
