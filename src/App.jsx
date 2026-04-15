import { useState, useEffect, useCallback, useMemo } from "react";

const STORAGE_KEY = "ee-tracker-script-url";
const COLS = ["id","title","course","dueDate","priority","description","completed","completedAt","createdAt","subtasks"];

const COURSES = ["Signals & Systems","Circuit Theory","Digital Logic","Electromagnetics","Control Systems","Power Electronics","Microprocessors","Linear Algebra","Other"];
const PRIORITIES = ["High","Medium","Low"];
const COURSE_COLORS = ["#7f77dd","#10b981","#3b82f6","#f97316","#d97706","#ec4899","#84cc16","#06b6d4","#888780"];

// CSS injected into the document for media queries and light/dark mode variables
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
  
  input, select, textarea, button { font-family: var(--font-ui); }
  
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
    .sidebar-header { margin-bottom: 0 !important; }
    .sidebar-tabs { display: flex; gap: 8px; flex-direction: row !important; }
    .sidebar-status { display: none; } /* Hide on mobile to save space */
    .main-content { padding: 1rem; height: auto; }
    
    .grid-4 { grid-template-columns: repeat(2, 1fr); }
    .grid-3 { grid-template-columns: 1fr; }
    .form-grid { grid-template-columns: 1fr; }
    .controls-row { flex-direction: column; align-items: stretch; }
    .controls-row > div { display: flex; justify-content: space-between; width: 100%; overflow-x: auto; padding-bottom: 4px; }
  }

  /* Custom Scrollbar */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }
`;

function uid() { return Math.random().toString(36).slice(2,10); }
function today() { return new Date().toISOString().slice(0,10); }
function fmt(ts) { if (!ts) return "—"; const d = new Date(ts); return d.toLocaleDateString(undefined,{month:"short",day:"numeric"}) + " " + d.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"}); }
function dayKey(ts) { return new Date(ts).toISOString().slice(0,10); }
function isOverdue(a) { return !a.completed && a.dueDate < today(); }
function isDueSoon(a) { if (a.completed || isOverdue(a)) return false; const diff = (new Date(a.dueDate) - new Date(today())) / 86400000; return diff <= 2; }
function pct(a) { if (!a.subtasks.length) return a.completed ? 100 : 0; return Math.round(a.subtasks.filter(s=>s.completed).length / a.subtasks.length * 100); }

function rowsToAssignments(rows) {
  return rows.slice(1).filter(r => r[0]).map(r => ({
    id: r[0], title: r[1], course: r[2], dueDate: r[3], priority: r[4],
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
  const [form, setForm] = useState({ title:"", course: COURSES[0], dueDate:"", priority:"Medium", description:"" });
  const [expandedId, setExpandedId] = useState(null);
  const [subtaskInputs, setSubtaskInputs] = useState({});

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setScriptUrl(saved);
  }, []);

  const fetchData = useCallback(async (url) => {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error("Network response was not ok");
      const data = await res.json();
      setAssignments(rowsToAssignments(data));
      setConnected(true);
    } catch { setConnected(false); }
  }, []);

  useEffect(() => { if (scriptUrl) fetchData(scriptUrl); }, [scriptUrl, fetchData]);

  const saveData = useCallback(async (newAssignments) => {
    if (!scriptUrl) return;
    setSaveStatus("saving");
    try {
      const rows = assignmentsToRows(newAssignments);
      await fetch(scriptUrl, { 
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "save", rows: rows })
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [scriptUrl]);

  const mutate = useCallback((newList) => { setAssignments(newList); saveData(newList); }, [saveData]);

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
    setForm({ title:"", course: COURSES[0], dueDate:"", priority:"Medium", description:"" });
    setShowForm(false);
  }

  function updateAssignment() {
    const updated = assignments.map(a => a.id === editId ? { ...a, ...form } : a);
    mutate(updated);
    setEditId(null);
    setShowForm(false);
  }

  function deleteAssignment(id) { mutate(assignments.filter(a => a.id !== id)); }

  function toggleComplete(id) {
    const now = new Date().toISOString();
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
    mutate(assignments.map(a => a.id !== aId ? a : {
      ...a, subtasks: a.subtasks.map(s => s.id !== sId ? s : {
        ...s, completed: !s.completed, completedAt: !s.completed ? now : null
      })
    }));
  }

  function deleteSubtask(aId, sId) {
    mutate(assignments.map(a => a.id !== aId ? a : { ...a, subtasks: a.subtasks.filter(s => s.id !== sId) }));
  }

  const filtered = useMemo(() => {
    return assignments.filter(a => {
      if (filter === "Pending") return !a.completed;
      if (filter === "Completed") return a.completed;
      if (filter === "Overdue") return isOverdue(a);
      return true;
    });
  }, [assignments, filter]);

  const grouped = useMemo(() => {
    if (groupBy === "course") {
      const g = {};
      filtered.forEach(a => { (g[a.course] = g[a.course] || []).push(a); });
      return g;
    }
    const g = {};
    [...filtered].sort((a,b) => a.dueDate.localeCompare(b.dueDate)).forEach(a => {
      const key = a.dueDate || "No date";
      (g[key] = g[key] || []).push(a);
    });
    return g;
  }, [filtered, groupBy]);

  const summary = useMemo(() => ({
    total: assignments.length,
    completed: assignments.filter(a => a.completed).length,
    overdue: assignments.filter(isOverdue).length,
    thisWeek: assignments.filter(a => {
      const d = new Date(a.dueDate), now = new Date();
      const diff = (d - now) / 86400000;
      return diff >= 0 && diff <= 7;
    }).length
  }), [assignments]);

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
      return { date: k, label: d.toLocaleDateString(undefined,{month:"short",day:"numeric"}), count: dayMap[k] || 0 };
    });

    const hourMap = Array(24).fill(0);
    allTimestamps.forEach(({ ts }) => { hourMap[new Date(ts).getHours()]++; });

    const dowMap = Array(7).fill(0);
    allTimestamps.forEach(({ ts }) => { dowMap[new Date(ts).getDay()]++; });

    const courseMap = {};
    allTimestamps.forEach(({ course }) => { courseMap[course] = (courseMap[course] || 0) + 1; });

    const thisWeekTotal = last14.slice(7).reduce((s,d) => s + d.count, 0);
    const lastWeekTotal = last14.slice(0,7).reduce((s,d) => s + d.count, 0);
    const weekChange = lastWeekTotal === 0 ? null : Math.round((thisWeekTotal - lastWeekTotal) / lastWeekTotal * 100);

    const streaks = (() => {
      const days = Object.keys(dayMap).sort();
      let cur = 0, max = 0, prev = null;
      days.forEach(d => {
        const expected = prev ? new Date(new Date(prev).getTime() + 86400000).toISOString().slice(0,10) : null;
        cur = (d === expected) ? cur + 1 : 1;
        if (cur > max) max = cur;
        prev = d;
      });
      const todayKey = today();
      const ystKey = new Date(new Date().getTime() - 86400000).toISOString().slice(0,10);
      const currentStreak = dayMap[todayKey] ? cur : (dayMap[ystKey] ? cur : 0);
      return { max, current: currentStreak };
    })();

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

    const insightParts = [];
    if (peakHour >= 20) insightParts.push("You're a night owl — most work happens after 8 PM.");
    else if (peakHour < 12) insightParts.push("You're a morning person — tasks get done early in the day.");
    else insightParts.push(`You tend to work in the ${peakHour < 17 ? "afternoon" : "evening"}.`);
    if (procScore) insightParts.push(`Your completion style: ${procScore.label}.`);
    const topCourse = Object.entries(courseMap).sort((a,b) => b[1]-a[1])[0];
    if (topCourse) insightParts.push(`Most active course: ${topCourse[0]}.`);

    return { last14, hourMap, dowMap, courseMap, thisWeekTotal, lastWeekTotal, weekChange, streaks, procScore, avgPerDay, peakHour, peakDay, insight: insightParts.join(" ") };
  }, [assignments]);

  if (!scriptUrl) return <Setup urlInput={urlInput} setUrlInput={setUrlInput} onConnect={connectUrl} />;

  return (
    <>
      <style>{globalStyles}</style>
      <div className="app-container">
        {/* Sidebar / Top Nav */}
        <div className="sidebar">
          <div className="sidebar-header" style={{ marginBottom:"1rem" }}>
            <div style={{ fontSize:13, fontWeight:700, color:"var(--accent)", letterSpacing:1.5, marginBottom:4, fontFamily:"var(--font-mono)" }}>EE TRACKER</div>
            <div className="sidebar-status" style={{ fontSize:11, color: connected ? "var(--success)" : "var(--danger)", display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background: connected ? "var(--success)" : "var(--danger)" }} />
              {connected ? "Sheets connected" : "Disconnected"}
            </div>
          </div>
          <div className="sidebar-tabs" style={{ display:"flex", flexDirection:"column", gap:8, width:"100%" }}>
            {["assignments","analytics"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ background: tab===t ? "var(--bg-input)" : "transparent", border: tab===t ? "1px solid var(--border)" : "1px solid transparent", borderRadius:"var(--radius-md)", padding:"12px 14px", color: tab===t ? "var(--text-main)" : "var(--text-sub)", fontSize:14, fontWeight:500, cursor:"pointer", textAlign:"left", textTransform:"capitalize", width:"100%", transition:"all 0.2s" }}>
                {t === "assignments" ? "📋 Assignments" : "📊 Analytics"}
              </button>
            ))}
          </div>
          <div className="sidebar-status" style={{ marginTop:"auto", fontSize:12, color:"var(--text-sub)", textAlign:"center", fontWeight:500 }}>
            {saveStatus === "saving" && <span style={{ color:"var(--warning)" }}>Saving…</span>}
            {saveStatus === "saved" && <span style={{ color:"var(--success)" }}>Saved ✓</span>}
            {saveStatus === "error" && <span style={{ color:"var(--danger)" }}>Save failed</span>}
          </div>
      
        </div>

        {/* Main */}
        <div className="main-content">
          {tab === "assignments" ? (
            <>
              {/* Summary bar */}
              <div className="grid-4" style={{ marginBottom:"2rem" }}>
                {[["Total", summary.total, "var(--accent)"],["Done", summary.completed, "var(--success)"],["Overdue", summary.overdue, "var(--danger)"],["This Week", summary.thisWeek, "var(--warning)"]].map(([l,v,c]) => (
                  <div key={l} style={{ background:"var(--bg-card)", border:`1px solid var(--border)`, borderRadius:"var(--radius-lg)", padding:"16px", boxShadow:"var(--shadow)" }}>
                    <div style={{ fontSize:12, color:"var(--text-sub)", marginBottom:4, fontWeight:500 }}>{l}</div>
                    <div style={{ fontSize:28, fontWeight:700, color:c, fontFamily:"var(--font-mono)" }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Controls */}
              <div className="controls-row" style={{ marginBottom:"1.5rem" }}>
                <button onClick={() => { setShowForm(true); setEditId(null); setForm({ title:"", course:COURSES[0], dueDate:"", priority:"Medium", description:"" }); }}
                  style={{ background:"var(--accent)", border:"none", borderRadius:"var(--radius-md)", padding:"12px 20px", color:"#fff", fontSize:14, cursor:"pointer", fontWeight:600, boxShadow:"var(--shadow)", flexShrink:0 }}>
                  + New Assignment
                </button>
                <div style={{ display:"flex", gap:6 }}>
                  {["All","Pending","Completed","Overdue"].map(f => (
                    <button key={f} onClick={() => setFilter(f)} style={{ background: filter===f ? "var(--bg-input)" : "transparent", border:`1px solid ${filter===f ? "var(--border)" : "transparent"}`, borderRadius:"var(--radius-md)", padding:"8px 14px", color: filter===f ? "var(--text-main)" : "var(--text-sub)", fontSize:13, fontWeight:500, cursor:"pointer", whiteSpace:"nowrap" }}>{f}</button>
                  ))}
                </div>
                <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
                  {["dueDate","course"].map(g => (
                    <button key={g} onClick={() => setGroupBy(g)} style={{ background: groupBy===g ? "var(--bg-input)" : "transparent", border:`1px solid ${groupBy===g ? "var(--border)" : "transparent"}`, borderRadius:"var(--radius-md)", padding:"8px 14px", color: groupBy===g ? "var(--text-main)" : "var(--text-sub)", fontSize:13, fontWeight:500, cursor:"pointer", whiteSpace:"nowrap" }}>
                      {g === "dueDate" ? "By Date" : "By Course"}
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
                      {COURSES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <input type="date" value={form.dueDate} onChange={e => setForm(p => ({...p,dueDate:e.target.value}))} style={inputStyle} />
                    <select value={form.priority} onChange={e => setForm(p => ({...p,priority:e.target.value}))} style={inputStyle}>
                      {PRIORITIES.map(p => <option key={p}>{p}</option>)}
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
                <div style={{ textAlign:"center", color:"var(--text-muted)", fontSize:15, padding:"4rem 1rem" }}>No assignments here yet. 🎉</div>
              )}
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group} style={{ marginBottom:"2rem" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"var(--text-sub)", letterSpacing:1.5, marginBottom:12, textTransform:"uppercase", borderBottom:"1px solid var(--border)", paddingBottom:8 }}>
                    {groupBy === "dueDate" ? (group === today() ? "Today" : group) : group}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    {items.map(a => <AssignmentCard key={a.id} a={a}
                      expanded={expandedId === a.id}
                      onExpand={() => setExpandedId(expandedId === a.id ? null : a.id)}
                      onToggle={() => toggleComplete(a.id)}
                      onEdit={() => { setEditId(a.id); setForm({ title:a.title, course:a.course, dueDate:a.dueDate, priority:a.priority, description:a.description }); setShowForm(true); window.scrollTo({top:0, behavior:'smooth'}); }}
                      onDelete={() => deleteAssignment(a.id)}
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
          ) : (
            <Analytics data={analytics} />
          )}
        </div>
      </div>
    </>
  );
}

const inputStyle = { background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:"12px 14px", color:"var(--text-main)", fontSize:15, outline:"none", width:"100%", transition:"border 0.2s", minHeight:"44px" };

function AssignmentCard({ a, expanded, onExpand, onToggle, onEdit, onDelete, subtaskInput, onSubtaskInput, onAddSubtask, onToggleSubtask, onDeleteSubtask }) {
  const p = pct(a);
  const courseIdx = COURSES.indexOf(a.course) % COURSE_COLORS.length;
  const courseColor = COURSE_COLORS[courseIdx];
  const priorityColor = a.priority === "High" ? "var(--danger)" : a.priority === "Medium" ? "var(--warning)" : "var(--success)";
  const priorityBg = a.priority === "High" ? "var(--danger-bg)" : a.priority === "Medium" ? "var(--warning-bg)" : "var(--success-bg)";

  return (
    <div style={{ background:"var(--bg-card)", border:`1px solid ${isOverdue(a) ? "var(--danger)" : isDueSoon(a) ? "var(--warning)" : "var(--border)"}`, borderRadius:"var(--radius-lg)", overflow:"hidden", opacity: a.completed ? 0.65 : 1, boxShadow:"var(--shadow)", transition:"all 0.2s" }}>
      <div style={{ padding:"16px" }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:14 }}>
          {/* Enhanced Touch Target for Checkbox */}
          <button onClick={onToggle} style={{ width:26, height:26, borderRadius:"50%", border:`2px solid ${a.completed ? "var(--success)" : "var(--text-muted)"}`, background: a.completed ? "var(--success)" : "transparent", cursor:"pointer", flexShrink:0, marginTop:2, display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>
            {a.completed && <span style={{ color:"#fff", fontSize:14, lineHeight:1, fontWeight:800 }}>✓</span>}
          </button>
          
          <div style={{ flex:1, minWidth:0 }} onClick={onExpand} style={{cursor:"pointer", flex:1}}>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:6 }}>
              <span style={{ fontSize:16, fontWeight:600, color: a.completed ? "var(--text-sub)" : "var(--text-main)", textDecoration: a.completed ? "line-through" : "none", lineHeight:1.3 }}>{a.title}</span>
            </div>
            
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
              <span style={{ fontSize:11, fontWeight:600, padding:"4px 8px", borderRadius:"6px", background: `${courseColor}22`, color: courseColor }}>{a.course}</span>
              <span style={{ fontSize:11, fontWeight:600, padding:"4px 8px", borderRadius:"6px", background: priorityBg, color: priorityColor }}>{a.priority}</span>
              {isOverdue(a) && <span style={{ fontSize:11, fontWeight:700, color:"var(--danger)", padding:"4px 0" }}>OVERDUE</span>}
              {isDueSoon(a) && <span style={{ fontSize:11, fontWeight:700, color:"var(--warning)", padding:"4px 0" }}>DUE SOON</span>}
            </div>
            
            <div style={{ fontSize:13, color:"var(--text-sub)", fontFamily:"var(--font-mono)" }}>Due: {a.dueDate}</div>
            
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

const iconBtn = { background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:"8px", color:"var(--text-sub)", cursor:"pointer", fontSize:12, padding:"8px 12px", display:"flex", alignItems:"center", justifyContent:"center" };
const actionBtn = { background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"6px", fontSize:13, fontWeight:600, padding:"6px 12px", cursor:"pointer" };

function Analytics({ data }) {
  const { last14, hourMap, dowMap, courseMap, thisWeekTotal, lastWeekTotal, weekChange, streaks, procScore, avgPerDay, peakHour, peakDay, insight } = data;
  const maxDay = Math.max(...last14.map(d => d.count), 1);
  const maxHour = Math.max(...hourMap, 1);
  const maxDow = Math.max(...dowMap, 1);
  const dowLabels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const courseEntries = Object.entries(courseMap).sort((a,b) => b[1]-a[1]);
  const courseTotal = courseEntries.reduce((s,[,v]) => s+v, 0);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"1.5rem" }}>
      {/* Insight card */}
      {insight && (
        <div style={{ background:"var(--accent-bg)", border:"1px solid var(--accent)", borderRadius:"var(--radius-lg)", padding:"20px" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"var(--accent)", letterSpacing:1.5, marginBottom:8 }}>AI INSIGHT</div>
          <div style={{ fontSize:15, color:"var(--text-main)", lineHeight:1.6, fontWeight:500 }}>{insight}</div>
        </div>
      )}

      {/* Top stats */}
      <div className="grid-3">
        <StatCard label="This Week" value={thisWeekTotal} sub={weekChange !== null ? `${weekChange >= 0 ? "+" : ""}${weekChange}% vs last week` : "—"} color="var(--accent)" />
        <StatCard label="Avg / Day" value={avgPerDay} sub="rolling 7-day" color="var(--success)" />
        <StatCard label="Best Streak" value={`${streaks.max}d`} sub={`Current: ${streaks.current}d`} color="#3b82f6" />
      </div>

      {/* Procrastination */}
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

      {/* Daily bar chart */}
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
        {/* Day of week heatmap */}
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

        {/* Peak hour */}
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

      {/* Course breakdown */}
      {courseEntries.length > 0 && (
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-lg)", padding:"20px", boxShadow:"var(--shadow)" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"var(--text-sub)", letterSpacing:1.5, marginBottom:20 }}>COURSE LOAD BREAKDOWN</div>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {courseEntries.map(([c,v]) => {
              const color = COURSE_COLORS[COURSES.indexOf(c) % COURSE_COLORS.length];
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

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background:"var(--bg-card)", border:`1px solid var(--border)`, borderRadius:"var(--radius-lg)", padding:"16px", boxShadow:"var(--shadow)" }}>
      <div style={{ fontSize:11, fontWeight:700, color:"var(--text-sub)", marginBottom:8, textTransform:"uppercase" }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:700, color, fontFamily:"var(--font-mono)" }}>{value}</div>
      <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:6 }}>{sub}</div>
    </div>
  );
}

function Setup({ urlInput, setUrlInput, onConnect }) {
  const script = `const SHEET_NAME = "assignments";\n\nfunction doGet(e) {\n  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);\n  const data = sheet.getDataRange().getValues();\n  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);\n}\n\nfunction doPost(e) {\n  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);\n  try {\n    const payload = JSON.parse(e.postData.contents);\n    if (payload.action === "save") {\n      sheet.clearContents();\n      sheet.getRange(1, 1, payload.rows.length, payload.rows[0].length).setValues(payload.rows);\n      return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);\n    }\n  } catch(err) {\n    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);\n  }\n}`;

  return (
    <>
      <style>{globalStyles}</style>
      <div style={{ minHeight:"100vh", background:"var(--bg-main)", display:"flex", alignItems:"center", justifyContent:"center", padding:"1.5rem" }}>
        <div style={{ maxWidth:600, width:"100%", background:"var(--bg-card)", padding:"2.5rem", borderRadius:"var(--radius-lg)", boxShadow:"var(--shadow)", border:"1px solid var(--border)" }}>
          <div style={{ fontSize:12, fontWeight:700, color:"var(--accent)", letterSpacing:2, marginBottom:12, fontFamily:"var(--font-mono)" }}>SETUP</div>
          <h1 style={{ fontSize:28, fontWeight:800, color:"var(--text-main)", marginBottom:8 }}>EE Assignment Tracker</h1>
          <p style={{ fontSize:15, color:"var(--text-sub)", marginBottom:"2.5rem", lineHeight:1.6 }}>Connect to Google Sheets for cross-device sync. Follow the steps below to get started.</p>

          {[
            ["1", "Create a Google Sheet", "Open Google Sheets and create a new spreadsheet. Rename the first tab to exactly: assignments"],
            ["2", "Add the Apps Script", "In the sheet, go to Extensions → Apps Script. Replace any existing code with the script below, then click Save."],
            ["3", "Deploy as Web App", 'Click Deploy → New Deployment → Web App. Set "Who has access" to Anyone. Click Deploy and copy the URL.'],
          ].map(([n, title, desc]) => (
            <div key={n} style={{ display:"flex", gap:16, marginBottom:20 }}>
              <div style={{ width:32, height:32, borderRadius:"50%", background:"var(--accent-bg)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"var(--accent)", flexShrink:0 }}>{n}</div>
              <div>
                <div style={{ fontSize:15, fontWeight:600, color:"var(--text-main)", marginBottom:4 }}>{title}</div>
                <div style={{ fontSize:14, color:"var(--text-sub)", lineHeight:1.6 }}>{desc}</div>
              </div>
            </div>
          ))}

          <pre style={{ background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:16, fontSize:12, color:"var(--text-muted)", overflow:"auto", marginBottom:"2rem", lineHeight:1.5, fontFamily:"var(--font-mono)" }}>{script}</pre>

          <div style={{ display:"flex", gap:12, flexDirection: window.innerWidth < 600 ? "column" : "row" }}>
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="Paste your Apps Script Web App URL here…" style={{ flex:1, background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)", padding:"14px 16px", color:"var(--text-main)", fontSize:14, outline:"none", minHeight:"48px" }} />
            <button onClick={onConnect} style={{ background:"var(--accent)", border:"none", borderRadius:"var(--radius-md)", padding:"14px 28px", color:"#fff", fontSize:15, cursor:"pointer", fontWeight:600, whiteSpace:"nowrap", minHeight:"48px" }}>Connect</button>
          </div>
        </div>
      </div>
    </>
  );
}
