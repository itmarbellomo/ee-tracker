import { useState, useEffect, useCallback, useMemo } from "react";

const STORAGE_KEY = "ee-tracker-script-url";
const COLS = ["id","title","course","dueDate","priority","description","completed","completedAt","createdAt","subtasks"];

const COURSES = ["Signals & Systems","Circuit Theory","Digital Logic","Electromagnetics","Control Systems","Power Electronics","Microprocessors","Linear Algebra","Other"];
const PRIORITIES = ["High","Medium","Low"];
const PRIORITY_COLOR = { High: "#e24b4a", Medium: "#ef9f27", Low: "#1d9e75" };
const COURSE_COLORS = ["#7f77dd","#1d9e75","#378add","#d85a30","#ba7517","#d4537e","#639922","#4a8fb5","#888780"];

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
      const res = await fetch(url);
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
      await fetch(scriptUrl, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", rows: assignmentsToRows(newAssignments) })
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch { setSaveStatus("error"); setTimeout(() => setSaveStatus("idle"), 3000); }
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
      if (avg < 0.4) return { label: "Early Bird", emoji: "🐦", color: "#1d9e75", pct: avg };
      if (avg < 0.7) return { label: "On Track", emoji: "✅", color: "#378add", pct: avg };
      if (avg < 0.9) return { label: "Last Minute", emoji: "⚡", color: "#ef9f27", pct: avg };
      return { label: "Danger Zone", emoji: "🔥", color: "#e24b4a", pct: avg };
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
    <div style={{ display:"flex", minHeight:"100vh", fontFamily:"'IBM Plex Mono', monospace", background:"var(--color-background-tertiary)" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Sidebar */}
      <div style={{ width:200, background:"#0f1117", display:"flex", flexDirection:"column", padding:"1.5rem 1rem", gap:8, flexShrink:0 }}>
        <div style={{ marginBottom:"1rem" }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#4ade80", letterSpacing:2, marginBottom:4 }}>EE TRACKER</div>
          <div style={{ fontSize:10, color: connected ? "#4ade80" : "#e24b4a", display:"flex", alignItems:"center", gap:4 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background: connected ? "#4ade80" : "#e24b4a" }} />
            {connected ? "Sheets connected" : "Disconnected"}
          </div>
        </div>
        {["assignments","analytics"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background: tab===t ? "#1e2130" : "transparent", border: tab===t ? "1px solid #2a2f45" : "1px solid transparent", borderRadius:6, padding:"8px 10px", color: tab===t ? "#fff" : "#6b7280", fontSize:12, cursor:"pointer", textAlign:"left", textTransform:"capitalize", fontFamily:"inherit" }}>
            {t === "assignments" ? "📋 Assignments" : "📊 Analytics"}
          </button>
        ))}
        <div style={{ marginTop:"auto", fontSize:10, color:"#374151", textAlign:"center" }}>
          {saveStatus === "saving" && <span style={{ color:"#ef9f27" }}>Saving…</span>}
          {saveStatus === "saved" && <span style={{ color:"#4ade80" }}>Saved ✓</span>}
          {saveStatus === "error" && <span style={{ color:"#e24b4a" }}>Save failed</span>}
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, overflowY:"auto", padding:"1.5rem" }}>
        {tab === "assignments" ? (
          <>
            {/* Summary bar */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:"1.5rem" }}>
              {[["Total", summary.total, "#7f77dd"],["Done", summary.completed, "#1d9e75"],["Overdue", summary.overdue, "#e24b4a"],["This Week", summary.thisWeek, "#ef9f27"]].map(([l,v,c]) => (
                <div key={l} style={{ background:"#0f1117", border:`1px solid ${c}33`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ fontSize:10, color:"#6b7280", marginBottom:4 }}>{l}</div>
                  <div style={{ fontSize:24, fontWeight:600, color:c }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Controls */}
            <div style={{ display:"flex", gap:8, marginBottom:"1rem", flexWrap:"wrap", alignItems:"center" }}>
              <button onClick={() => { setShowForm(true); setEditId(null); setForm({ title:"", course:COURSES[0], dueDate:"", priority:"Medium", description:"" }); }}
                style={{ background:"#7f77dd", border:"none", borderRadius:8, padding:"8px 16px", color:"#fff", fontSize:12, cursor:"pointer", fontFamily:"inherit", fontWeight:500 }}>
                + New Assignment
              </button>
              <div style={{ display:"flex", gap:4 }}>
                {["All","Pending","Completed","Overdue"].map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={{ background: filter===f ? "#1e2130" : "transparent", border:`1px solid ${filter===f ? "#2a2f45" : "#1e2130"}`, borderRadius:6, padding:"6px 12px", color: filter===f ? "#fff" : "#6b7280", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>{f}</button>
                ))}
              </div>
              <div style={{ marginLeft:"auto", display:"flex", gap:4 }}>
                {["dueDate","course"].map(g => (
                  <button key={g} onClick={() => setGroupBy(g)} style={{ background: groupBy===g ? "#1e2130" : "transparent", border:`1px solid ${groupBy===g ? "#2a2f45" : "transparent"}`, borderRadius:6, padding:"6px 12px", color: groupBy===g ? "#fff" : "#6b7280", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>
                    {g === "dueDate" ? "By Date" : "By Course"}
                  </button>
                ))}
              </div>
            </div>

            {/* Add/Edit Form */}
            {showForm && (
              <div style={{ background:"#0f1117", border:"1px solid #2a2f45", borderRadius:12, padding:"1.25rem", marginBottom:"1rem" }}>
                <div style={{ fontSize:13, fontWeight:500, color:"#fff", marginBottom:12 }}>{editId ? "Edit Assignment" : "New Assignment"}</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                  <input value={form.title} onChange={e => setForm(p => ({...p,title:e.target.value}))} placeholder="Title*" style={inputStyle} />
                  <select value={form.course} onChange={e => setForm(p => ({...p,course:e.target.value}))} style={inputStyle}>
                    {COURSES.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input type="date" value={form.dueDate} onChange={e => setForm(p => ({...p,dueDate:e.target.value}))} style={inputStyle} />
                  <select value={form.priority} onChange={e => setForm(p => ({...p,priority:e.target.value}))} style={inputStyle}>
                    {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <textarea value={form.description} onChange={e => setForm(p => ({...p,description:e.target.value}))} placeholder="Description (optional)" rows={2} style={{ ...inputStyle, width:"100%", resize:"vertical", boxSizing:"border-box" }} />
                <div style={{ display:"flex", gap:8, marginTop:10 }}>
                  <button onClick={editId ? updateAssignment : addAssignment} style={{ background:"#7f77dd", border:"none", borderRadius:8, padding:"8px 16px", color:"#fff", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                    {editId ? "Update" : "Add"}
                  </button>
                  <button onClick={() => { setShowForm(false); setEditId(null); }} style={{ background:"transparent", border:"1px solid #2a2f45", borderRadius:8, padding:"8px 16px", color:"#6b7280", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
                </div>
              </div>
            )}

            {/* Assignment groups */}
            {Object.keys(grouped).length === 0 && (
              <div style={{ textAlign:"center", color:"#4b5563", fontSize:13, padding:"3rem" }}>No assignments here yet.</div>
            )}
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group} style={{ marginBottom:"1.5rem" }}>
                <div style={{ fontSize:10, fontWeight:600, color:"#4b5563", letterSpacing:2, marginBottom:8, textTransform:"uppercase" }}>
                  {groupBy === "dueDate" ? (group === today() ? "Today" : group) : group}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {items.map(a => <AssignmentCard key={a.id} a={a}
                    expanded={expandedId === a.id}
                    onExpand={() => setExpandedId(expandedId === a.id ? null : a.id)}
                    onToggle={() => toggleComplete(a.id)}
                    onEdit={() => { setEditId(a.id); setForm({ title:a.title, course:a.course, dueDate:a.dueDate, priority:a.priority, description:a.description }); setShowForm(true); }}
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
  );
}

const inputStyle = { background:"#1a1f2e", border:"1px solid #2a2f45", borderRadius:8, padding:"8px 12px", color:"#e5e7eb", fontSize:12, fontFamily:"'IBM Plex Mono', monospace", outline:"none", width:"100%", boxSizing:"border-box" };

function AssignmentCard({ a, expanded, onExpand, onToggle, onEdit, onDelete, subtaskInput, onSubtaskInput, onAddSubtask, onToggleSubtask, onDeleteSubtask }) {
  const p = pct(a);
  const courseIdx = COURSES.indexOf(a.course) % COURSE_COLORS.length;
  const courseColor = COURSE_COLORS[courseIdx];

  return (
    <div style={{ background:"#0f1117", border:`1px solid ${isOverdue(a) ? "#e24b4a44" : isDueSoon(a) ? "#ef9f2744" : "#1e2130"}`, borderRadius:10, overflow:"hidden", opacity: a.completed ? 0.6 : 1 }}>
      <div style={{ padding:"12px 14px" }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
          <button onClick={onToggle} style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${a.completed ? "#1d9e75" : "#374151"}`, background: a.completed ? "#1d9e75" : "transparent", cursor:"pointer", flexShrink:0, marginTop:2, display:"flex", alignItems:"center", justifyContent:"center" }}>
            {a.completed && <span style={{ color:"#fff", fontSize:10, lineHeight:1 }}>✓</span>}
          </button>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
              <span style={{ fontSize:13, fontWeight:500, color: a.completed ? "#4b5563" : "#e5e7eb", textDecoration: a.completed ? "line-through" : "none" }}>{a.title}</span>
              <span style={{ fontSize:10, padding:"1px 6px", borderRadius:4, background: courseColor + "22", color: courseColor }}>{a.course}</span>
              <span style={{ fontSize:10, padding:"1px 6px", borderRadius:4, background: PRIORITY_COLOR[a.priority] + "22", color: PRIORITY_COLOR[a.priority] }}>{a.priority}</span>
              {isOverdue(a) && <span style={{ fontSize:10, color:"#e24b4a" }}>OVERDUE</span>}
              {isDueSoon(a) && <span style={{ fontSize:10, color:"#ef9f27" }}>DUE SOON</span>}
            </div>
            <div style={{ fontSize:11, color:"#4b5563", marginTop:3 }}>Due: {a.dueDate}</div>
            {a.subtasks.length > 0 && (
              <div style={{ marginTop:8 }}>
                <div style={{ height:3, background:"#1e2130", borderRadius:99, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${p}%`, background: p === 100 ? "#1d9e75" : "#7f77dd", borderRadius:99, transition:"width 0.3s" }} />
                </div>
                <div style={{ fontSize:10, color:"#4b5563", marginTop:3 }}>{p}% · {a.subtasks.filter(s=>s.completed).length}/{a.subtasks.length} subtasks</div>
              </div>
            )}
          </div>
          <div style={{ display:"flex", gap:4, flexShrink:0 }}>
            <button onClick={onExpand} style={iconBtn}>{expanded ? "▲" : "▼"}</button>
            <button onClick={onEdit} style={iconBtn}>✏</button>
            <button onClick={onDelete} style={{ ...iconBtn, color:"#e24b4a" }}>✕</button>
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop:"1px solid #1e2130", padding:"12px 14px" }}>
          {a.description && <p style={{ fontSize:12, color:"#6b7280", marginBottom:10 }}>{a.description}</p>}
          {a.completedAt && <p style={{ fontSize:11, color:"#1d9e75", marginBottom:10 }}>Completed: {fmt(a.completedAt)}</p>}
          <div style={{ fontSize:11, fontWeight:500, color:"#4b5563", marginBottom:6 }}>SUBTASKS</div>
          {a.subtasks.map(s => (
            <div key={s.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
              <button onClick={() => onToggleSubtask(s.id)} style={{ width:14, height:14, borderRadius:"50%", border:`1.5px solid ${s.completed ? "#1d9e75" : "#374151"}`, background: s.completed ? "#1d9e75" : "transparent", cursor:"pointer", flexShrink:0 }} />
              <span style={{ flex:1, fontSize:12, color: s.completed ? "#4b5563" : "#d1d5db", textDecoration: s.completed ? "line-through" : "none" }}>{s.title}</span>
              {s.completedAt && <span style={{ fontSize:10, color:"#374151" }}>{fmt(s.completedAt)}</span>}
              <button onClick={() => onDeleteSubtask(s.id)} style={{ ...iconBtn, fontSize:10, color:"#4b5563" }}>✕</button>
            </div>
          ))}
          <div style={{ display:"flex", gap:6, marginTop:8 }}>
            <input value={subtaskInput} onChange={e => onSubtaskInput(e.target.value)} onKeyDown={e => e.key === "Enter" && onAddSubtask()} placeholder="Add subtask…" style={{ ...inputStyle, flex:1 }} />
            <button onClick={onAddSubtask} style={{ background:"#7f77dd22", border:"1px solid #7f77dd44", borderRadius:8, padding:"6px 12px", color:"#7f77dd", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn = { background:"transparent", border:"none", color:"#4b5563", cursor:"pointer", fontSize:12, padding:"2px 4px", fontFamily:"inherit" };

function Analytics({ data }) {
  const { last14, hourMap, dowMap, courseMap, thisWeekTotal, lastWeekTotal, weekChange, streaks, procScore, avgPerDay, peakHour, peakDay, insight } = data;
  const maxDay = Math.max(...last14.map(d => d.count), 1);
  const maxHour = Math.max(...hourMap, 1);
  const maxDow = Math.max(...dowMap, 1);
  const dowLabels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const courseEntries = Object.entries(courseMap).sort((a,b) => b[1]-a[1]);
  const courseTotal = courseEntries.reduce((s,[,v]) => s+v, 0);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"1.25rem" }}>
      {/* Insight card */}
      {insight && (
        <div style={{ background:"#0f1117", border:"1px solid #7f77dd44", borderRadius:12, padding:"14px 16px" }}>
          <div style={{ fontSize:10, color:"#7f77dd", letterSpacing:2, marginBottom:6 }}>PERSONAL INSIGHT</div>
          <div style={{ fontSize:13, color:"#d1d5db", lineHeight:1.6 }}>{insight}</div>
        </div>
      )}

      {/* Top stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
        <StatCard label="This Week" value={thisWeekTotal} sub={weekChange !== null ? `${weekChange >= 0 ? "+" : ""}${weekChange}% vs last week` : "—"} color="#7f77dd" />
        <StatCard label="Avg / Day" value={avgPerDay} sub="rolling 7-day" color="#1d9e75" />
        <StatCard label="Best Streak" value={`${streaks.max}d`} sub={`Current: ${streaks.current}d`} color="#378add" />
      </div>

      {/* Procrastination */}
      {procScore && (
        <div style={{ background:"#0f1117", border:"1px solid #1e2130", borderRadius:12, padding:"14px 16px" }}>
          <div style={{ fontSize:10, color:"#4b5563", letterSpacing:2, marginBottom:10 }}>PROCRASTINATION SCORE</div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:28 }}>{procScore.emoji}</span>
            <div>
              <div style={{ fontSize:16, fontWeight:600, color: procScore.color }}>{procScore.label}</div>
              <div style={{ fontSize:11, color:"#4b5563" }}>You use {Math.round(procScore.pct * 100)}% of available time on average</div>
            </div>
            <div style={{ flex:1, height:6, background:"#1e2130", borderRadius:99, overflow:"hidden", marginLeft:"auto" }}>
              <div style={{ height:"100%", width:`${Math.round(procScore.pct * 100)}%`, background: procScore.color, borderRadius:99 }} />
            </div>
          </div>
        </div>
      )}

      {/* Daily bar chart */}
      <div style={{ background:"#0f1117", border:"1px solid #1e2130", borderRadius:12, padding:"14px 16px" }}>
        <div style={{ fontSize:10, color:"#4b5563", letterSpacing:2, marginBottom:12 }}>DAILY COMPLETIONS — LAST 14 DAYS</div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:80 }}>
          {last14.map((d,i) => (
            <div key={d.date} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
              <div style={{ width:"100%", height: `${(d.count / maxDay) * 72}px`, minHeight: d.count ? 4 : 0, background: i >= 7 ? "#7f77dd" : "#2a2f45", borderRadius:"3px 3px 0 0", transition:"height 0.3s" }} />
              {i % 3 === 0 && <div style={{ fontSize:8, color:"#374151", writingMode:"vertical-rl", transform:"rotate(180deg)", height:30, overflow:"hidden" }}>{d.label}</div>}
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:12, marginTop:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:4 }}><div style={{ width:8, height:8, background:"#7f77dd", borderRadius:2 }} /><span style={{ fontSize:10, color:"#4b5563" }}>This week</span></div>
          <div style={{ display:"flex", alignItems:"center", gap:4 }}><div style={{ width:8, height:8, background:"#2a2f45", borderRadius:2 }} /><span style={{ fontSize:10, color:"#4b5563" }}>Last week</span></div>
        </div>
      </div>

      {/* Day of week heatmap */}
      <div style={{ background:"#0f1117", border:"1px solid #1e2130", borderRadius:12, padding:"14px 16px" }}>
        <div style={{ fontSize:10, color:"#4b5563", letterSpacing:2, marginBottom:12 }}>MOST PRODUCTIVE DAY</div>
        <div style={{ display:"flex", gap:6 }}>
          {dowLabels.map((d,i) => {
            const intensity = dowMap[i] / maxDow;
            return (
              <div key={d} style={{ flex:1, textAlign:"center" }}>
                <div style={{ height:40, borderRadius:6, background: intensity > 0 ? `rgba(127,119,221,${0.15 + intensity * 0.85})` : "#1a1f2e", marginBottom:4, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ fontSize:11, color: intensity > 0.5 ? "#fff" : "#4b5563", fontWeight:500 }}>{dowMap[i]}</span>
                </div>
                <div style={{ fontSize:10, color: d === peakDay ? "#7f77dd" : "#4b5563" }}>{d}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Peak hour */}
      <div style={{ background:"#0f1117", border:"1px solid #1e2130", borderRadius:12, padding:"14px 16px" }}>
        <div style={{ fontSize:10, color:"#4b5563", letterSpacing:2, marginBottom:12 }}>PEAK PRODUCTIVITY HOUR</div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:60 }}>
          {hourMap.map((v,h) => (
            <div key={h} title={`${h}:00`} style={{ flex:1, height: `${(v / maxHour) * 56}px`, minHeight: v ? 3 : 0, background: h === peakHour ? "#4ade80" : "#1e2130", borderRadius:"2px 2px 0 0" }} />
          ))}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
          {[0,6,12,18,23].map(h => <span key={h} style={{ fontSize:9, color:"#374151" }}>{h}:00</span>)}
        </div>
        <div style={{ fontSize:11, color:"#4ade80", marginTop:8 }}>Peak: {peakHour}:00 – {peakHour+1}:00</div>
      </div>

      {/* Course breakdown */}
      {courseEntries.length > 0 && (
        <div style={{ background:"#0f1117", border:"1px solid #1e2130", borderRadius:12, padding:"14px 16px" }}>
          <div style={{ fontSize:10, color:"#4b5563", letterSpacing:2, marginBottom:12 }}>COURSE LOAD BREAKDOWN</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {courseEntries.map(([c,v], i) => {
              const color = COURSE_COLORS[COURSES.indexOf(c) % COURSE_COLORS.length];
              return (
                <div key={c}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                    <span style={{ color:"#d1d5db" }}>{c}</span>
                    <span style={{ color:"#4b5563" }}>{v} completions · {Math.round(v/courseTotal*100)}%</span>
                  </div>
                  <div style={{ height:4, background:"#1e2130", borderRadius:99 }}>
                    <div style={{ height:"100%", width:`${v/courseTotal*100}%`, background:color, borderRadius:99 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Object.keys(courseMap).length === 0 && (
        <div style={{ textAlign:"center", color:"#4b5563", fontSize:13, padding:"3rem" }}>Complete some tasks to see analytics.</div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background:"#0f1117", border:`1px solid ${color}33`, borderRadius:10, padding:"12px 14px" }}>
      <div style={{ fontSize:10, color:"#4b5563", marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:600, color }}>{value}</div>
      <div style={{ fontSize:10, color:"#374151", marginTop:2 }}>{sub}</div>
    </div>
  );
}

function Setup({ urlInput, setUrlInput, onConnect }) {
  const script = `const SHEET_NAME = "assignments";

function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAME);
  const payload = JSON.parse(e.postData.contents);
  if (payload.action === "save") {
    sheet.clearContents();
    sheet.getRange(1,1,payload.rows.length,payload.rows[0].length)
         .setValues(payload.rows);
  }
  return ContentService
    .createTextOutput(JSON.stringify({status:"ok"}))
    .setMimeType(ContentService.MimeType.JSON);
}`;

  return (
    <div style={{ minHeight:"100vh", background:"#080b10", display:"flex", alignItems:"center", justifyContent:"center", padding:"2rem", fontFamily:"'IBM Plex Mono', monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      <div style={{ maxWidth:560, width:"100%" }}>
        <div style={{ fontSize:10, color:"#4ade80", letterSpacing:3, marginBottom:8 }}>SETUP</div>
        <h1 style={{ fontSize:24, fontWeight:600, color:"#fff", marginBottom:4 }}>EE Assignment Tracker</h1>
        <p style={{ fontSize:13, color:"#6b7280", marginBottom:"2rem", lineHeight:1.6 }}>Connect to Google Sheets for cross-device sync. Follow the steps below to get started.</p>

        {[
          ["1", "Create a Google Sheet", "Open Google Sheets and create a new spreadsheet. Rename the first tab to exactly: assignments"],
          ["2", "Add the Apps Script", "In the sheet, go to Extensions → Apps Script. Replace any existing code with the script below, then click Save."],
          ["3", "Deploy as Web App", 'Click Deploy → New Deployment → Web App. Set "Who has access" to Anyone. Click Deploy and copy the URL.'],
        ].map(([n, title, desc]) => (
          <div key={n} style={{ display:"flex", gap:12, marginBottom:16 }}>
            <div style={{ width:24, height:24, borderRadius:"50%", background:"#7f77dd22", border:"1px solid #7f77dd44", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"#7f77dd", flexShrink:0 }}>{n}</div>
            <div>
              <div style={{ fontSize:12, fontWeight:500, color:"#e5e7eb", marginBottom:2 }}>{title}</div>
              <div style={{ fontSize:11, color:"#6b7280", lineHeight:1.6 }}>{desc}</div>
            </div>
          </div>
        ))}

        <pre style={{ background:"#0f1117", border:"1px solid #1e2130", borderRadius:8, padding:12, fontSize:10, color:"#9ca3af", overflow:"auto", marginBottom:"1.5rem", lineHeight:1.6 }}>{script}</pre>

        <div style={{ display:"flex", gap:8 }}>
          <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="Paste your Apps Script Web App URL here…" style={{ flex:1, background:"#0f1117", border:"1px solid #2a2f45", borderRadius:8, padding:"10px 14px", color:"#e5e7eb", fontSize:12, fontFamily:"inherit", outline:"none" }} />
          <button onClick={onConnect} style={{ background:"#7f77dd", border:"none", borderRadius:8, padding:"10px 20px", color:"#fff", fontSize:12, cursor:"pointer", fontFamily:"inherit", fontWeight:500, whiteSpace:"nowrap" }}>Connect</button>
        </div>
      </div>
    </div>
  );
}
