'use client';

import { useEffect, useMemo, useState } from 'react';

type Role = 'admin' | 'teammate';
type Member = { name: string; repId: string; phone: string; email: string };
type Admin = { name: string; email: string };
type User = { name: string; role: Role } | null;
type Entry = { id: number; member: string; date: string; time: string; clientName: string; appointmentType: string; source: string; lessons: string; outcome: string; detail: string; weekKey: string };
type Schedule = { day: string; time: string; frequency: string; sendManagerReport: boolean; sendIndividualReports: boolean };

const YES_CATEGORIES = ['Recruit', 'Life Insurance', 'Investments', 'Client Solutions', 'Carryback'];
const DEFAULT_SCHEDULE: Schedule = { day: 'Friday', time: '08:00', frequency: 'Weekly', sendManagerReport: true, sendIndividualReports: true };

const key = {
  logs: 'teamAppointmentLogs',
  members: 'teamAppointmentMembers',
  admins: 'teamAppointmentAdmins',
  managerEmail: 'teamAppointmentManagerEmail',
  schedule: 'teamAppointmentReportSchedule',
  currentUser: 'teamAppointmentCurrentUser',
  passcode: 'teamAppointmentAdminPasscode',
};

function safeParse<T>(value: string | null, fallback: T): T {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}
function weekKey(dateString: string) {
  const d = new Date(dateString + 'T00:00:00');
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().slice(0, 10);
}
function weekLabel(w: string) {
  const start = new Date(w + 'T00:00:00');
  const end = new Date(start); end.setDate(start.getDate() + 6);
  const f = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${f(start)} - ${f(end)}`;
}
function currentWeekKey() { return weekKey(new Date().toISOString().slice(0, 10)); }
function formatTime(time: string) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function countBy<T>(items: T[], fn: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const k = fn(item) || 'Unknown'; acc[k] = (acc[k] || 0) + 1; return acc;
  }, {});
}
function getYesCategoryCounts(items: Entry[]) {
  const counts: Record<string, number> = {};
  YES_CATEGORIES.forEach(c => counts[c] = 0);
  items.filter(l => l.outcome === 'Yes').forEach(l => String(l.detail || '').split(',').map(x => x.trim()).filter(Boolean).forEach(x => counts[x] = (counts[x] || 0) + 1));
  return counts;
}
function getYesRatio(items: Entry[]) { return items.length ? `${Math.round((items.filter(l => l.outcome === 'Yes').length / items.length) * 100)}%` : '0%'; }
function formatYesCategoryCounts(items: Entry[]) { const c = getYesCategoryCounts(items); return YES_CATEGORIES.map(cat => `${cat}: ${c[cat] || 0}`).join('\n'); }

function BarChart({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(e => e[1]));
  if (!entries.length) return <div className="empty">No data yet.</div>;
  return <>{entries.map(([label, value]) => <div className="chart-bar" key={label}><div className="chart-bar-label"><span>{label}</span><strong>{value}</strong></div><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round(value / max * 100)}%` }} /></div></div>)}</>;
}

export default function AppointmentLogApp() {
  const [hydrated, setHydrated] = useState(false);
  const [logs, setLogs] = useState<Entry[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([{ name: 'Emmanuel Reynoso', email: '' }]);
  const [managerEmail, setManagerEmail] = useState('');
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE);
  const [currentUser, setCurrentUser] = useState<User>(null);
  const [adminPasscode, setAdminPasscode] = useState('admin123');
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState<'log' | 'view' | 'dashboard' | 'report' | 'settings'>('log');

  const [loginRole, setLoginRole] = useState<Role>('admin');
  const [loginAdmin, setLoginAdmin] = useState('');
  const [loginTeammate, setLoginTeammate] = useState('');
  const [loginCode, setLoginCode] = useState('');

  const blankForm = { id: 0, member: '', date: '', time: '', clientName: '', appointmentType: '', appointmentOther: '', source: '', sourceOther: '', lessons: '', outcome: '', detail: '', yes: [] as string[] };
  const [form, setForm] = useState(blankForm);
  const [filters, setFilters] = useState({ member: '', week: '', search: '' });
  const [newMember, setNewMember] = useState<Member>({ name: '', repId: '', phone: '', email: '' });
  const [newPasscode, setNewPasscode] = useState('');

  useEffect(() => {
    const normalizedMembers = safeParse<any[]>(localStorage.getItem(key.members), []).map(m => typeof m === 'string' ? { name: m, repId: '', phone: '', email: '' } : { name: String(m.name || ''), repId: String(m.repId || ''), phone: String(m.phone || ''), email: String(m.email || '') }).filter(m => m.name);
    setLogs(safeParse<Entry[]>(localStorage.getItem(key.logs), []));
    setMembers(normalizedMembers);
    setAdmins(safeParse<Admin[]>(localStorage.getItem(key.admins), [{ name: 'Emmanuel Reynoso', email: '' }]).filter(a => a.name));
    setManagerEmail(localStorage.getItem(key.managerEmail) || '');
    setSchedule({ ...DEFAULT_SCHEDULE, ...safeParse<Partial<Schedule>>(localStorage.getItem(key.schedule), {}) });
    setCurrentUser(safeParse<User>(localStorage.getItem(key.currentUser), null));
    setAdminPasscode(localStorage.getItem(key.passcode) || 'admin123');
    const now = new Date();
    setForm(f => ({ ...f, date: now.toISOString().slice(0, 10), time: now.toTimeString().slice(0, 5) }));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(key.logs, JSON.stringify(logs));
    localStorage.setItem(key.members, JSON.stringify(members));
    localStorage.setItem(key.admins, JSON.stringify(admins));
    localStorage.setItem(key.managerEmail, managerEmail);
    localStorage.setItem(key.schedule, JSON.stringify(schedule));
    localStorage.setItem(key.currentUser, JSON.stringify(currentUser));
    localStorage.setItem(key.passcode, adminPasscode);
    document.body.classList.toggle('admin', currentUser?.role === 'admin');
  }, [hydrated, logs, members, admins, managerEmail, schedule, currentUser, adminPasscode]);

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2200); }
  const isAdmin = currentUser?.role === 'admin';
  const visibleLogs = useMemo(() => isAdmin ? logs : logs.filter(l => currentUser && l.member === currentUser.name), [logs, currentUser, isAdmin]);
  const weeks = useMemo(() => Array.from(new Set(visibleLogs.map(l => l.weekKey))).filter(Boolean).sort().reverse(), [visibleLogs]);

  function login() {
    if (loginRole === 'admin') {
      if (!loginAdmin) return flash('Please select an admin.');
      if (loginCode !== adminPasscode) return flash('Incorrect admin passcode.');
      setCurrentUser({ name: loginAdmin, role: 'admin' });
    } else {
      if (!loginTeammate) return flash('Please select your teammate name.');
      setCurrentUser({ name: loginTeammate, role: 'teammate' });
    }
  }

  function saveAppointment() {
    let appointmentType = form.appointmentType;
    let source = form.source;
    if (!form.member || !form.date || !form.clientName.trim() || !appointmentType || !source || !form.outcome) return flash('Please complete all required fields.');
    if (appointmentType === 'Other' && !form.appointmentOther.trim()) return flash('Please enter the other appointment type.');
    if (source === 'Other' && !form.sourceOther.trim()) return flash('Please enter the other source.');
    if (form.outcome === 'Condition' && !form.detail.trim()) return flash('Please enter the condition details.');
    if (form.outcome === 'Objection' && !form.detail.trim()) return flash('Please enter the objection details.');
    if (appointmentType === 'Other') appointmentType = `Other: ${form.appointmentOther.trim()}`;
    if (source === 'Other') source = `Other: ${form.sourceOther.trim()}`;
    const detail = form.outcome === 'Yes' ? form.yes.join(', ') : form.detail.trim();
    const entry: Entry = { id: form.id || Date.now(), member: form.member, date: form.date, time: form.time, clientName: form.clientName.trim(), appointmentType, source, lessons: form.lessons.trim(), outcome: form.outcome, detail, weekKey: weekKey(form.date) };
    setLogs(prev => form.id ? prev.map(l => l.id === form.id ? entry : l) : [...prev, entry]);
    const now = new Date();
    setForm({ ...blankForm, member: isAdmin ? '' : currentUser?.name || '', date: now.toISOString().slice(0, 10), time: now.toTimeString().slice(0, 5) });
    flash(form.id ? 'Appointment updated.' : 'Appointment saved.');
  }

  function editLog(entry: Entry) {
    const otherType = entry.appointmentType.startsWith('Other: ');
    const otherSource = entry.source.startsWith('Other: ');
    setForm({ id: entry.id, member: entry.member, date: entry.date, time: entry.time, clientName: entry.clientName, appointmentType: otherType ? 'Other' : entry.appointmentType, appointmentOther: otherType ? entry.appointmentType.replace('Other: ', '') : '', source: otherSource ? 'Other' : entry.source, sourceOther: otherSource ? entry.source.replace('Other: ', '') : '', lessons: entry.lessons, outcome: entry.outcome, detail: entry.outcome === 'Yes' ? '' : entry.detail, yes: entry.outcome === 'Yes' ? entry.detail.split(',').map(x => x.trim()).filter(Boolean) : [] });
    setTab('log');
  }

  function buildReportForPerson(person: string, w: string) {
    const profile = members.find(m => m.name === person);
    const personLogs = logs.filter(l => l.member === person && l.weekKey === w);
    const lines = personLogs.map(l => [`• ${l.clientName} — ${l.date}${l.time ? ' at ' + formatTime(l.time) : ''}`, `  Type: ${l.appointmentType}`, `  Source: ${l.source}`, `  Outcome: ${l.outcome}`, l.detail ? `  Details: ${l.detail}` : '', l.lessons ? `  Lessons learned: ${l.lessons}` : ''].filter(Boolean).join('\n')).join('\n\n');
    return [`To: ${profile?.email || '[teammate email]'}`, `Subject: Your Weekly Appointment Report — ${weekLabel(w)}`, '', `Hi ${person},`, '', `Here is your appointment activity for the week of ${weekLabel(w)}.`, '', 'SUMMARY', `Total appointments: ${personLogs.length}`, `YES outcomes: ${personLogs.filter(l => l.outcome === 'Yes').length}`, `YES ratio: ${getYesRatio(personLogs)}`, '', 'YES CATEGORY BREAKDOWN', formatYesCategoryCounts(personLogs), '', 'APPOINTMENT DETAILS', lines || 'No appointments logged.'].join('\n');
  }
  function buildManagerReport() {
    const w = (document.getElementById('reportWeek') as HTMLSelectElement)?.value || currentWeekKey();
    const weekLogs = logs.filter(l => l.weekKey === w);
    const people = Array.from(new Set(weekLogs.map(l => l.member))).sort();
    const sections = people.map(p => {
      const personLogs = weekLogs.filter(l => l.member === p); const profile = members.find(m => m.name === p);
      return [p, `Rep ID: ${profile?.repId || '—'} | Phone: ${profile?.phone || '—'} | Email: ${profile?.email || '—'}`, `Total appointments: ${personLogs.length}`, `YES outcomes: ${personLogs.filter(l => l.outcome === 'Yes').length}`, `YES ratio: ${getYesRatio(personLogs)}`, '', 'YES category breakdown:', formatYesCategoryCounts(personLogs)].join('\n');
    }).join('\n\n-------------------------\n\n');
    return [`To: ${managerEmail || '[manager email]'}`, `Subject: Team Weekly Appointment Report — ${weekLabel(w)}`, '', 'TEAM SUMMARY', `Total appointments: ${weekLogs.length}`, `YES outcomes: ${weekLogs.filter(l => l.outcome === 'Yes').length}`, `YES ratio: ${getYesRatio(weekLogs)}`, '', 'TEAM YES CATEGORY BREAKDOWN', formatYesCategoryCounts(weekLogs), '', sections || 'No appointments logged.'].join('\n');
  }

  if (!hydrated) return null;

  if (!currentUser) return <>
    <div className="login-card card">
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>Appointment Log</h1>
      <p className="muted" style={{ marginBottom: 16 }}>Sign in as an admin or teammate.</p>
      <label>Role</label><select value={loginRole} onChange={e => setLoginRole(e.target.value as Role)}><option value="admin">Admin</option><option value="teammate">Teammate</option></select>
      {loginRole === 'admin' ? <div><label>Admin Name</label><select value={loginAdmin} onChange={e => setLoginAdmin(e.target.value)}><option value="">{admins.length ? 'Select admin...' : 'No admins added yet'}</option>{admins.map(a => <option key={a.name}>{a.name}</option>)}</select><label>Admin Passcode</label><input type="password" value={loginCode} onChange={e => setLoginCode(e.target.value)} placeholder="Enter admin passcode" /><p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Demo passcode: admin123</p></div> : <div><label>Teammate Name</label><select value={loginTeammate} onChange={e => setLoginTeammate(e.target.value)}><option value="">{members.length ? 'Select teammate...' : 'No teammates added yet'}</option>{members.map(m => <option key={m.name}>{m.name}</option>)}</select><p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Only teammates added by an admin will appear here.</p></div>}
      <button className="btn btn-primary btn-full" onClick={login}>Log In</button>
    </div>{toast && <div className="toast show">{toast}</div>}</>;

  const filtered = visibleLogs.filter(l => (!filters.member || l.member === filters.member) && (!filters.week || l.weekKey === filters.week) && (!filters.search || [l.clientName, l.lessons, l.detail, l.source, l.appointmentType].some(v => String(v || '').toLowerCase().includes(filters.search.toLowerCase())))).sort((a, b) => String(b.date + b.time).localeCompare(String(a.date + a.time)));
  const reportWeek = weeks[0] || currentWeekKey();

  return <div className="app">
    <div className="header"><div><h1>Appointment Log</h1><p>Track appointments, outcomes, weekly reports, dashboard numbers, and teammate activity.</p></div><div style={{ textAlign: 'right' }}><div className="badge badge-warning">{currentUser.name} • {isAdmin ? 'Admin' : 'Teammate'}</div><button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => { setCurrentUser(null); setTab('log'); }}>Log Out</button></div></div>
    <div className="tabs">{(['log','view'] as const).map(t => <button key={t} className={`tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>{t==='log'?'Log Appointment':'View Logs'}</button>)}{isAdmin && (['dashboard','report','settings'] as const).map(t => <button key={t} className={`tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>{t==='dashboard'?'Dashboard':t==='report'?'Reports':'Settings'}</button>)}</div>

    {tab === 'log' && <section className="section active card">
      <label>Team Member Name</label><select value={isAdmin ? form.member : currentUser.name} disabled={!isAdmin} onChange={e=>setForm({...form,member:e.target.value})}><option value="">Select team member...</option>{members.map(m=><option key={m.name}>{m.name}</option>)}</select>
      <div className="grid-2"><div><label>Date</label><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div><div><label>Time</label><input type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})}/></div></div>
      <label>Prospect / Client Name</label><input value={form.clientName} onChange={e=>setForm({...form,clientName:e.target.value})} placeholder="Example: Jane Smith" />
      <label>Appointment Type</label><select value={form.appointmentType} onChange={e=>setForm({...form,appointmentType:e.target.value})}><option value="">Select one...</option>{['Initial Meeting','Review Meeting','Carryback','Follow-Up','Orientation','Other'].map(x=><option key={x}>{x}</option>)}</select>{form.appointmentType==='Other'&&<div className="conditional show"><label>Other Appointment Type</label><input value={form.appointmentOther} onChange={e=>setForm({...form,appointmentOther:e.target.value})}/></div>}
      <label>Source</label><select value={form.source} onChange={e=>setForm({...form,source:e.target.value})}><option value="">Select one...</option>{['Field Training','Introduction','Other'].map(x=><option key={x}>{x}</option>)}</select>{form.source==='Other'&&<div className="conditional show"><label>Other Source</label><input value={form.sourceOther} onChange={e=>setForm({...form,sourceOther:e.target.value})}/></div>}
      <label>Outcome</label><select value={form.outcome} onChange={e=>setForm({...form,outcome:e.target.value,detail:'',yes:[]})}><option value="">Select one...</option><option value="No Ask">I didn’t ask for the close</option><option value="Condition">There was a condition that prevents the close</option><option value="Objection">I couldn’t overcome an objection</option><option value="Yes">I got a YES</option></select>
      {(form.outcome==='Condition'||form.outcome==='Objection')&&<div className="conditional show"><label>Details</label><input value={form.detail} onChange={e=>setForm({...form,detail:e.target.value})} placeholder={form.outcome==='Condition'?'Example: Client is uninsurable, has no income, or does not qualify right now':'Example: Wanted to think about it'} /></div>}
      {form.outcome==='Yes'&&<div className="conditional show"><strong>What was the YES?</strong><div className="checks">{YES_CATEGORIES.map(c=><label className="check" key={c}><input type="checkbox" checked={form.yes.includes(c)} onChange={e=>setForm({...form,yes:e.target.checked?[...form.yes,c]:form.yes.filter(x=>x!==c)})}/>{c}</label>)}</div></div>}
      <label>Lessons Learned and Changes Made</label><textarea value={form.lessons} onChange={e=>setForm({...form,lessons:e.target.value})}/>
      <div className="btn-row"><button className="btn btn-primary" onClick={saveAppointment}>{form.id?'Update Appointment':'Save Appointment'}</button>{form.id!==0&&<button className="btn btn-secondary" onClick={()=>setForm(blankForm)}>Cancel Edit</button>}</div>
    </section>}

    {tab === 'view' && <section className="section active"><div className="filters"><select value={filters.member} disabled={!isAdmin} onChange={e=>setFilters({...filters,member:e.target.value})}><option value="">All Team Members</option>{members.map(m=><option key={m.name}>{m.name}</option>)}</select><select value={filters.week} onChange={e=>setFilters({...filters,week:e.target.value})}><option value="">All Weeks</option>{weeks.map(w=><option key={w} value={w}>{weekLabel(w)}</option>)}</select><input value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})} placeholder="Search client or notes" /></div>{filtered.length?filtered.map(l=><div className="log-item" key={l.id}><div className="log-top"><div><div className="log-title">{l.clientName}</div><div className="badges"><span className="badge">{l.member}</span><span className="badge">{l.date}{l.time?' at '+formatTime(l.time):''}</span><span className="badge">{l.appointmentType}</span><span className="badge">{l.source}</span><span className={`badge ${l.outcome==='Yes'?'badge-success':''}`}>{l.outcome}{l.detail?' - '+l.detail:''}</span></div></div><div className="btn-row" style={{marginTop:0}}><button className="btn btn-secondary" onClick={()=>editLog(l)}>Edit</button><button className="btn-danger" onClick={()=>setLogs(logs.filter(x=>x.id!==l.id))}>Delete</button></div></div>{l.lessons&&<p className="notes"><strong>Lessons learned:</strong> {l.lessons}</p>}</div>):<div className="empty">No appointments found.</div>}</section>}

    {tab === 'dashboard' && <section className="section active"><div className="stats"><div className="stat"><strong>{visibleLogs.length}</strong><span>Total Appointments</span></div><div className="stat"><strong>{new Set(visibleLogs.map(l=>l.member)).size}</strong><span>Team Members</span></div><div className="stat"><strong>{visibleLogs.filter(l=>l.outcome==='Yes').length}</strong><span>YES Outcomes</span></div><div className="stat"><strong>{getYesRatio(visibleLogs)}</strong><span>YES Ratio</span></div></div><div className="chart-row"><div className="card"><h3>Appointments by Teammate</h3><BarChart counts={countBy(visibleLogs,l=>l.member)}/></div><div className="card"><h3>Outcomes</h3><BarChart counts={countBy(visibleLogs,l=>l.outcome)}/></div><div className="card"><h3>Sources</h3><BarChart counts={countBy(visibleLogs,l=>l.source)}/></div><div className="card"><h3>YES Breakdown</h3><BarChart counts={getYesCategoryCounts(visibleLogs)}/></div></div></section>}

    {tab === 'report' && <section className="section active"><div className="filters"><select id="reportWeek" defaultValue={reportWeek}>{(weeks.length?weeks:[currentWeekKey()]).map(w=><option key={w} value={w}>{weekLabel(w)}</option>)}</select><button className="btn btn-secondary" onClick={()=>navigator.clipboard.writeText(buildManagerReport()).then(()=>flash('Manager report copied.'))}>Copy Manager Report</button><button className="btn btn-secondary" onClick={()=>navigator.clipboard.writeText(Array.from(new Set(logs.filter(l=>l.weekKey===reportWeek).map(l=>l.member))).map(p=>buildReportForPerson(p,reportWeek)).join('\n\n=========================\n\n')).then(()=>flash('Individual reports copied.'))}>Copy Individual Reports</button></div><div className="card"><h3>Manager Report Preview</h3><pre className="email-preview">{buildManagerReport()}</pre></div></section>}

    {tab === 'settings' && <section className="section active">
      <div className="card"><h2>Team Members</h2>{members.length?members.map((m,i)=><div className="member-row" key={m.name}><div><strong>{m.name}</strong><br/><span className="muted">Rep ID: {m.repId||'—'} • {m.phone||'No phone'} • {m.email||'No email'}</span></div><button className="btn-danger" onClick={()=>setMembers(members.filter((_,idx)=>idx!==i))}>Remove</button></div>):<div className="empty">No team members added yet.</div>}<div className="grid-2"><div><label>Name</label><input value={newMember.name} onChange={e=>setNewMember({...newMember,name:e.target.value})}/></div><div><label>Rep ID</label><input value={newMember.repId} onChange={e=>setNewMember({...newMember,repId:e.target.value})}/></div><div><label>Phone</label><input value={newMember.phone} onChange={e=>setNewMember({...newMember,phone:e.target.value})}/></div><div><label>Email</label><input value={newMember.email} onChange={e=>setNewMember({...newMember,email:e.target.value})}/></div></div><button className="btn btn-primary btn-full" onClick={()=>{if(!newMember.name.trim())return flash('Please enter a teammate name.'); if(members.some(m=>m.name.toLowerCase()===newMember.name.toLowerCase()))return flash('That member already exists.'); setMembers([...members,newMember].sort((a,b)=>a.name.localeCompare(b.name))); setNewMember({name:'',repId:'',phone:'',email:''});}}>Add Member</button></div>
      <div className="card"><h2>Admin Management</h2>{admins.map((a,i)=><div className="member-row" key={a.name}><div><strong>{a.name}</strong><br/><span className="muted">{a.email||'No email'}</span></div><button className="btn-danger" onClick={()=>admins.length<=1?flash('You must keep at least one admin.'):setAdmins(admins.filter((_,idx)=>idx!==i))}>Remove Admin</button></div>)}<label>Promote Teammate to Co-Admin</label><select id="promote"><option value="">Select teammate...</option>{members.filter(m=>!admins.some(a=>a.name.toLowerCase()===m.name.toLowerCase())).map(m=><option key={m.name}>{m.name}</option>)}</select><button className="btn btn-primary btn-full" onClick={()=>{const el=document.getElementById('promote') as HTMLSelectElement; const m=members.find(x=>x.name===el.value); if(!m)return flash('Please select a teammate.'); setAdmins([...admins,{name:m.name,email:m.email}].sort((a,b)=>a.name.localeCompare(b.name)));}}>Promote to Co-Admin</button></div>
      <div className="card"><h2>Admin Passcode</h2><label>New Admin Passcode</label><input type="password" value={newPasscode} onChange={e=>setNewPasscode(e.target.value)}/><button className="btn btn-primary btn-full" onClick={()=>{if(!newPasscode.trim())return flash('Please enter a new passcode.'); setAdminPasscode(newPasscode); setNewPasscode(''); flash('Admin passcode saved.')}}>Save Admin Passcode</button></div>
      <div className="card"><h2>Manager Email</h2><input value={managerEmail} onChange={e=>setManagerEmail(e.target.value)} placeholder="manager@email.com"/></div>
      <div className="card"><h2>Automated Email Schedule</h2><div className="grid-3"><div><label>Send Day</label><select value={schedule.day} onChange={e=>setSchedule({...schedule,day:e.target.value})}>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(x=><option key={x}>{x}</option>)}</select></div><div><label>Send Time</label><input type="time" value={schedule.time} onChange={e=>setSchedule({...schedule,time:e.target.value})}/></div><div><label>Frequency</label><select value={schedule.frequency} onChange={e=>setSchedule({...schedule,frequency:e.target.value})}>{['Weekly','Every 2 Weeks','Monthly'].map(x=><option key={x}>{x}</option>)}</select></div></div><label className="check"><input type="checkbox" checked={schedule.sendManagerReport} onChange={e=>setSchedule({...schedule,sendManagerReport:e.target.checked})}/> Send manager report</label><label className="check"><input type="checkbox" checked={schedule.sendIndividualReports} onChange={e=>setSchedule({...schedule,sendIndividualReports:e.target.checked})}/> Send individual teammate reports</label></div>
    </section>}
    {toast && <div className="toast show">{toast}</div>}
  </div>;
}
