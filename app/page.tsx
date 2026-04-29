'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Teammate = { id: string; name: string; rep_id?: string; phone?: string; email?: string; is_admin?: boolean; active?: boolean };
type Settings = { id: number; admin_passcode: string; manager_email?: string; report_day?: string; report_time?: string; report_frequency?: string; send_manager_report?: boolean; send_individual_reports?: boolean; missed_activity_days?: number };
type Appointment = { id: string; teammate_id?: string; member: string; client_name: string; appointment_date: string; appointment_time?: string; appointment_type: string; source: string; outcome: string; detail?: string; lessons?: string; week_key: string; created_by?: string; updated_by?: string; created_at?: string; updated_at?: string };
type User = { name: string; role: 'admin' | 'teammate'; teammateId?: string };

const TYPES = ['Initial Meeting', 'Review Meeting', 'Carryback', 'Follow-Up', 'Orientation', 'Other'];
const SOURCES = ['Field Training', 'Introduction', 'Other'];
const YES_CATEGORIES = ['Recruit', 'Life Insurance', 'Investments', 'Client Solutions', 'Carryback'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function weekKey(dateString: string) {
  const date = new Date(dateString + 'T00:00:00');
  const day = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().slice(0, 10);
}
function weekLabel(week: string) {
  const start = new Date(week + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const f = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${f(start)} - ${f(end)}`;
}
function currentWeek() { return weekKey(new Date().toISOString().slice(0, 10)); }
function fmtTime(time?: string) { if (!time) return ''; const [h, m] = time.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; }
function yesRatio(items: Appointment[]) { return items.length ? `${Math.round((items.filter(x => x.outcome === 'Yes').length / items.length) * 100)}%` : '0%'; }
function countBy<T>(items: T[], getter: (i: T) => string | undefined) { return items.reduce((acc: Record<string, number>, item) => { const key = getter(item) || 'Unknown'; acc[key] = (acc[key] || 0) + 1; return acc; }, {}); }
function yesCounts(items: Appointment[]) { const counts: Record<string, number> = {}; YES_CATEGORIES.forEach(c => counts[c] = 0); items.filter(x => x.outcome === 'Yes').forEach(log => String(log.detail || '').split(',').map(x => x.trim()).filter(Boolean).forEach(x => counts[x] = (counts[x] || 0) + 1)); return counts; }
function yesSummary(items: Appointment[]) { const c = yesCounts(items); return YES_CATEGORIES.map(cat => `${cat}: ${c[cat] || 0}`).join('\n'); }
function csvEscape(v: unknown) { return `"${String(v || '').replace(/"/g, '""')}"`; }
function download(name: string, content: string, type: string) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState('log');
  const [loginRole, setLoginRole] = useState<'admin' | 'teammate'>('admin');
  const [loginAdmin, setLoginAdmin] = useState('');
  const [loginTeammate, setLoginTeammate] = useState('');
  const [passcode, setPasscode] = useState('');
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filterMember, setFilterMember] = useState('');
  const [filterWeek, setFilterWeek] = useState('');
  const [search, setSearch] = useState('');
  const [reportWeek, setReportWeek] = useState(currentWeek());
  const [preview, setPreview] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);
  const blankForm = { id: '', teammate_id: '', member: '', client_name: '', appointment_date: today, appointment_time: nowTime, appointment_type: '', appointment_other: '', source: '', source_other: '', outcome: '', detail: '', lessons: '', yes: [] as string[] };
  const [form, setForm] = useState(blankForm);
  const [newMate, setNewMate] = useState({ name: '', rep_id: '', phone: '', email: '' });
  const [newPasscode, setNewPasscode] = useState('');

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2400); }

  async function loadAll() {
    setLoading(true);
    const [matesRes, setRes, apptsRes] = await Promise.all([
      supabase.from('teammates').select('*').eq('active', true).order('name'),
      supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('appointments').select('*').order('appointment_date', { ascending: false }).order('appointment_time', { ascending: false })
    ]);
    if (matesRes.error) notify(matesRes.error.message);
    if (setRes.error) notify(setRes.error.message);
    if (apptsRes.error) notify(apptsRes.error.message);
    setTeammates((matesRes.data || []) as Teammate[]);
    setSettings((setRes.data || null) as Settings | null);
    setAppointments((apptsRes.data || []) as Appointment[]);
    setLoading(false);
  }
  useEffect(() => { loadAll(); }, []);

  const admins = teammates.filter(t => t.is_admin);
  const visible = useMemo(() => user?.role === 'admin' ? appointments : appointments.filter(a => a.member === user?.name), [appointments, user]);
  const weeks = useMemo(() => Array.from(new Set(visible.map(a => a.week_key))).filter(Boolean).sort().reverse(), [visible]);
  const filteredLogs = useMemo(() => visible.filter(a => !filterMember || a.member === filterMember).filter(a => !filterWeek || a.week_key === filterWeek).filter(a => !search || [a.client_name, a.lessons, a.detail, a.source, a.appointment_type].some(v => String(v || '').toLowerCase().includes(search.toLowerCase()))), [visible, filterMember, filterWeek, search]);
  const reportLogs = appointments.filter(a => a.week_key === reportWeek);

  const missedDays = settings?.missed_activity_days || 7;
  const missedAlerts = teammates.filter(t => {
    if (!t.active) return false;
    const latest = appointments.filter(a => a.member === t.name).sort((a, b) => String(b.appointment_date).localeCompare(String(a.appointment_date)))[0];
    if (!latest) return true;
    const days = Math.floor((Date.now() - new Date(latest.appointment_date + 'T00:00:00').getTime()) / 86400000);
    return days >= missedDays;
  });

  function doLogin() {
    if (loginRole === 'admin') {
      const admin = admins.find(a => a.id === loginAdmin);
      if (!admin) return notify('Please select an admin.');
      if (passcode !== settings?.admin_passcode) return notify('Incorrect admin passcode.');
      setUser({ name: admin.name, role: 'admin', teammateId: admin.id });
      setForm(prev => ({ ...prev, teammate_id: admin.id, member: admin.name }));
    } else {
      const mate = teammates.find(t => t.id === loginTeammate);
      if (!mate) return notify('Please select a teammate.');
      setUser({ name: mate.name, role: 'teammate', teammateId: mate.id });
      setForm(prev => ({ ...prev, teammate_id: mate.id, member: mate.name }));
    }
  }

  function logout() { setUser(null); setTab('log'); setPasscode(''); setLoginAdmin(''); setLoginTeammate(''); }

  async function saveAppointment() {
    let appointment_type = form.appointment_type === 'Other' ? `Other: ${form.appointment_other.trim()}` : form.appointment_type;
    let source = form.source === 'Other' ? `Other: ${form.source_other.trim()}` : form.source;
    const detail = form.outcome === 'Yes' ? form.yes.join(', ') : form.detail.trim();
    const missing = [];
    if (!form.teammate_id) missing.push('Team Member');
    if (!form.appointment_date) missing.push('Date');
    if (!form.client_name.trim()) missing.push('Prospect / Client Name');
    if (!appointment_type) missing.push('Appointment Type');
    if (form.appointment_type === 'Other' && !form.appointment_other.trim()) missing.push('Other Appointment Type');
    if (!source) missing.push('Source');
    if (form.source === 'Other' && !form.source_other.trim()) missing.push('Other Source');
    if (!form.outcome) missing.push('Outcome');
    if ((form.outcome === 'Condition' || form.outcome === 'Objection') && !detail) missing.push('Outcome Details');
    if (missing.length) return notify('Missing: ' + missing.join(', '));

    const payload = { teammate_id: form.teammate_id, member: teammates.find(t => t.id === form.teammate_id)?.name || form.member, client_name: form.client_name.trim(), appointment_date: form.appointment_date, appointment_time: form.appointment_time, appointment_type, source, outcome: form.outcome, detail, lessons: form.lessons.trim(), week_key: weekKey(form.appointment_date), updated_by: user?.name || '', updated_at: new Date().toISOString() };
    const res = form.id
      ? await supabase.from('appointments').update(payload).eq('id', form.id).select().single()
      : await supabase.from('appointments').insert({ ...payload, created_by: user?.name || '' }).select().single();
    if (res.error) return notify(res.error.message);
    await supabase.from('audit_log').insert({ actor: user?.name, action: form.id ? 'updated appointment' : 'created appointment', entity_type: 'appointment', entity_id: res.data.id, notes: payload.client_name });
    setForm({ ...blankForm, teammate_id: user?.role === 'teammate' ? user.teammateId || '' : '', member: user?.role === 'teammate' ? user.name : '' });
    notify(form.id ? 'Appointment updated.' : 'Appointment saved.');
    loadAll();
  }

  function editAppointment(a: Appointment) {
    const isOtherType = a.appointment_type.startsWith('Other: ');
    const isOtherSource = a.source.startsWith('Other: ');
    setForm({ id: a.id, teammate_id: a.teammate_id || '', member: a.member, client_name: a.client_name, appointment_date: a.appointment_date, appointment_time: a.appointment_time || '', appointment_type: isOtherType ? 'Other' : a.appointment_type, appointment_other: isOtherType ? a.appointment_type.replace('Other: ', '') : '', source: isOtherSource ? 'Other' : a.source, source_other: isOtherSource ? a.source.replace('Other: ', '') : '', outcome: a.outcome, detail: a.outcome === 'Yes' ? '' : a.detail || '', lessons: a.lessons || '', yes: a.outcome === 'Yes' ? String(a.detail || '').split(',').map(x => x.trim()).filter(Boolean) : [] });
    setTab('log');
  }

  async function deleteAppointment(id: string) {
    if (!confirm('Delete this appointment?')) return;
    const res = await supabase.from('appointments').delete().eq('id', id);
    if (res.error) return notify(res.error.message);
    await supabase.from('audit_log').insert({ actor: user?.name, action: 'deleted appointment', entity_type: 'appointment', entity_id: id });
    notify('Appointment deleted.'); loadAll();
  }

  async function addTeammate() {
    if (!newMate.name.trim()) return notify('Please enter a teammate name.');
    const res = await supabase.from('teammates').insert({ ...newMate, name: newMate.name.trim(), active: true, is_admin: false }).select().single();
    if (res.error) return notify(res.error.message);
    setNewMate({ name: '', rep_id: '', phone: '', email: '' }); notify('Teammate added.'); loadAll();
  }
  async function updateTeammate(t: Teammate, patch: Partial<Teammate>) { const res = await supabase.from('teammates').update(patch).eq('id', t.id); if (res.error) return notify(res.error.message); loadAll(); }
  async function promote(t: Teammate) { await updateTeammate(t, { is_admin: true }); notify(t.name + ' promoted to co-admin.'); }
  async function removeAdmin(t: Teammate) { if (admins.length <= 1) return notify('Keep at least one admin.'); await updateTeammate(t, { is_admin: false }); notify(t.name + ' removed as admin.'); }
  async function saveSettings(patch: Partial<Settings>) { const res = await supabase.from('app_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1).select().single(); if (res.error) return notify(res.error.message); setSettings(res.data as Settings); notify('Settings saved.'); }

  function buildPersonReport(person: string) {
    const mate = teammates.find(t => t.name === person);
    const logs = appointments.filter(a => a.member === person && a.week_key === reportWeek);
    const lines = logs.map(a => [`• ${a.client_name} — ${a.appointment_date}${a.appointment_time ? ' at ' + fmtTime(a.appointment_time) : ''}`, `  Type: ${a.appointment_type}`, `  Source: ${a.source}`, `  Outcome: ${a.outcome}`, a.detail ? `  Details: ${a.detail}` : '', a.lessons ? `  Lessons learned: ${a.lessons}` : ''].filter(Boolean).join('\n')).join('\n\n');
    return [`To: ${mate?.email || '[teammate email]'}`, `Subject: Your Weekly Appointment Report — ${weekLabel(reportWeek)}`, '', `Hi ${person},`, '', `Here is your appointment activity for ${weekLabel(reportWeek)}.`, '', 'SUMMARY', `Total appointments: ${logs.length}`, `YES outcomes: ${logs.filter(a => a.outcome === 'Yes').length}`, `YES ratio: ${yesRatio(logs)}`, '', 'YES CATEGORY BREAKDOWN', yesSummary(logs), '', 'APPOINTMENT DETAILS', lines || 'No appointments logged.'].join('\n');
  }
  function buildManagerReport() {
    const people = Array.from(new Set(reportLogs.map(a => a.member))).sort();
    const sections = people.map(p => { const logs = reportLogs.filter(a => a.member === p); const mate = teammates.find(t => t.name === p); return [p, `Rep ID: ${mate?.rep_id || '—'} | Phone: ${mate?.phone || '—'} | Email: ${mate?.email || '—'}`, `Total appointments: ${logs.length}`, `YES outcomes: ${logs.filter(a => a.outcome === 'Yes').length}`, `YES ratio: ${yesRatio(logs)}`, '', 'YES category breakdown:', yesSummary(logs)].join('\n'); }).join('\n\n-------------------------\n\n');
    return [`To: ${settings?.manager_email || '[manager email]'}`, `Subject: Team Weekly Appointment Report — ${weekLabel(reportWeek)}`, '', 'TEAM SUMMARY', `Total appointments: ${reportLogs.length}`, `YES outcomes: ${reportLogs.filter(a => a.outcome === 'Yes').length}`, `YES ratio: ${yesRatio(reportLogs)}`, '', 'TEAM YES CATEGORY BREAKDOWN', yesSummary(reportLogs), '', '-------------------------', '', sections || 'No appointments logged.'].join('\n');
  }

  function copyPreview(text: string) { setPreview(text); navigator.clipboard?.writeText(text).then(() => notify('Copied.')).catch(() => notify('Preview created.')); }
  function exportCsv() { const headers = ['Member', 'Date', 'Time', 'Client', 'Type', 'Source', 'Outcome', 'Details', 'Lessons']; const rows = visible.map(a => [a.member, a.appointment_date, a.appointment_time, a.client_name, a.appointment_type, a.source, a.outcome, a.detail, a.lessons]); download('appointments.csv', [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\n'), 'text/csv'); }

  if (loading) return <main className="login card"><h1>Loading AppLog...</h1><p className="muted">Connecting to Supabase.</p></main>;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <main className="login card"><h1>Missing Supabase setup</h1><p className="muted">Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel, then redeploy.</p></main>;

  if (!user) return <main className="login card"><h1>Appointment Log</h1><p className="muted">Version 2: cloud database, reports, leaderboard, and alerts.</p><label>Role</label><select value={loginRole} onChange={e => setLoginRole(e.target.value as any)}><option value="admin">Admin</option><option value="teammate">Teammate</option></select>{loginRole === 'admin' ? <><label>Admin</label><select value={loginAdmin} onChange={e => setLoginAdmin(e.target.value)}><option value="">Select admin...</option>{admins.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><label>Admin Passcode</label><input type="password" value={passcode} onChange={e => setPasscode(e.target.value)} placeholder="Enter admin passcode" /><p className="muted">Default passcode: admin123</p></> : <><label>Teammate</label><select value={loginTeammate} onChange={e => setLoginTeammate(e.target.value)}><option value="">Select teammate...</option>{teammates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></>}<button className="btn primary full" onClick={doLogin}>Log In</button><div className={toast ? 'toast show' : 'toast'}>{toast}</div></main>;

  const chart = (counts: Record<string, number>) => { const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]); const max = Math.max(1, ...entries.map(e=>e[1])); return entries.length ? entries.map(([label, n]) => <div className="bar" key={label}><div className="barlabel"><span>{label}</span><strong>{n}</strong></div><div className="track"><div className="fill" style={{ width: `${Math.round(n/max*100)}%` }} /></div></div>) : <div className="empty">No data yet.</div>; };
  const leaderboard = Object.entries(countBy(appointments, a => a.member)).sort((a,b)=>b[1]-a[1]);

  return <main className="app"><div className="header"><div><h1>Appointment Log</h1><p className="muted">Cloud-synced team appointment system.</p></div><div style={{ textAlign: 'right' }}><span className="badge warn">{user.name} • {user.role === 'admin' ? 'Admin' : 'Teammate'}</span><br/><button className="btn secondary" style={{ marginTop: 8 }} onClick={logout}>Log Out</button></div></div><div className="tabs">{['log','view'].map(t => <button key={t} className={tab===t?'tab active':'tab'} onClick={()=>setTab(t)}>{t==='log'?'Log Appointment':'View Logs'}</button>)}{user.role==='admin' && ['dashboard','leaderboard','reports','settings'].map(t => <button key={t} className={tab===t?'tab active':'tab'} onClick={()=>setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</button>)}</div>

    <section className={tab==='log'?'section active card':'section card'}><input type="hidden" value={form.id}/><label>Team Member</label><select value={form.teammate_id} disabled={user.role!=='admin'} onChange={e => { const t = teammates.find(x => x.id === e.target.value); setForm({...form, teammate_id:e.target.value, member:t?.name||''}); }}><option value="">Select...</option>{teammates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><div className="grid2"><div><label>Date</label><input type="date" value={form.appointment_date} onChange={e=>setForm({...form,appointment_date:e.target.value})}/></div><div><label>Time</label><input type="time" value={form.appointment_time} onChange={e=>setForm({...form,appointment_time:e.target.value})}/></div></div><label>Prospect / Client Name</label><input value={form.client_name} onChange={e=>setForm({...form,client_name:e.target.value})}/><label>Appointment Type</label><select value={form.appointment_type} onChange={e=>setForm({...form,appointment_type:e.target.value})}><option value="">Select...</option>{TYPES.map(x=><option key={x}>{x}</option>)}</select><div className={form.appointment_type==='Other'?'conditional show':'conditional'}><label>Other Appointment Type</label><input value={form.appointment_other} onChange={e=>setForm({...form,appointment_other:e.target.value})}/></div><label>Source</label><select value={form.source} onChange={e=>setForm({...form,source:e.target.value})}><option value="">Select...</option>{SOURCES.map(x=><option key={x}>{x}</option>)}</select><div className={form.source==='Other'?'conditional show':'conditional'}><label>Other Source</label><input value={form.source_other} onChange={e=>setForm({...form,source_other:e.target.value})}/></div><label>Outcome</label><select value={form.outcome} onChange={e=>setForm({...form,outcome:e.target.value,detail:'',yes:[]})}><option value="">Select...</option><option value="No Ask">I didn’t ask for the close</option><option value="Condition">There was a condition that prevents the close</option><option value="Objection">I couldn’t overcome an objection</option><option value="Yes">I got a YES</option></select><div className={form.outcome==='Condition'||form.outcome==='Objection'?'conditional show':'conditional'}><label>Details</label><input placeholder="Example: Client is uninsurable, has no income, or does not qualify right now" value={form.detail} onChange={e=>setForm({...form,detail:e.target.value})}/></div><div className={form.outcome==='Yes'?'conditional show':'conditional'}><strong>What was the YES?</strong><div className="checks">{YES_CATEGORIES.map(cat=><label className="check" key={cat}><input type="checkbox" checked={form.yes.includes(cat)} onChange={e=>setForm({...form,yes:e.target.checked?[...form.yes,cat]:form.yes.filter(x=>x!==cat)})}/>{cat}</label>)}</div></div><label>Lessons Learned and Changes Made</label><textarea value={form.lessons} onChange={e=>setForm({...form,lessons:e.target.value})}/><div className="row"><button className="btn primary" onClick={saveAppointment}>{form.id?'Update Appointment':'Save Appointment'}</button>{form.id && <button className="btn secondary" onClick={()=>setForm({...blankForm, teammate_id: user.role==='teammate'?user.teammateId||'':'', member:user.role==='teammate'?user.name:''})}>Cancel Edit</button>}</div></section>

    <section className={tab==='view'?'section active':'section'}><div className="filters"><select value={filterMember} disabled={user.role!=='admin'} onChange={e=>setFilterMember(e.target.value)}><option value="">All Team Members</option>{teammates.map(t=><option key={t.id}>{t.name}</option>)}</select><select value={filterWeek} onChange={e=>setFilterWeek(e.target.value)}><option value="">All Weeks</option>{weeks.map(w=><option key={w} value={w}>{weekLabel(w)}</option>)}</select><input placeholder="Search" value={search} onChange={e=>setSearch(e.target.value)}/></div>{filteredLogs.length?filteredLogs.map(a=><div className="item" key={a.id}><div className="itemtop"><div><div className="title">{a.client_name}</div><div className="badges"><span className="badge">{a.member}</span><span className="badge">{a.appointment_date}{a.appointment_time?' at '+fmtTime(a.appointment_time):''}</span><span className="badge">{a.appointment_type}</span><span className="badge">{a.source}</span><span className={a.outcome==='Yes'?'badge yes':'badge'}>{a.outcome}{a.detail?' - '+a.detail:''}</span></div></div><div className="row"><button className="btn secondary" onClick={()=>editAppointment(a)}>Edit</button><button className="danger" onClick={()=>deleteAppointment(a.id)}>Delete</button></div></div>{a.lessons&&<p className="notes"><strong>Lessons learned:</strong> {a.lessons}</p>}</div>):<div className="empty">No appointments found.</div>}</section>

    {user.role==='admin' && <><section className={tab==='dashboard'?'section active':'section'}><div className="stats"><div className="stat"><strong>{appointments.length}</strong><span>Total Appointments</span></div><div className="stat"><strong>{appointments.filter(a=>a.outcome==='Yes').length}</strong><span>YES Outcomes</span></div><div className="stat"><strong>{yesRatio(appointments)}</strong><span>YES Ratio</span></div><div className="stat"><strong>{missedAlerts.length}</strong><span>Missed Activity Alerts</span></div></div>{missedAlerts.length>0&&<div className="card"><h3>Missed Activity Alerts</h3><p className="muted">No appointment logged in {missedDays}+ days.</p>{missedAlerts.map(t=><div className="reportrow" key={t.id}>{t.name} • {t.phone||'No phone'} • {t.email||'No email'}</div>)}</div>}<div className="chartrow"><div className="card"><h3>Appointments by Teammate</h3>{chart(countBy(appointments,a=>a.member))}</div><div className="card"><h3>Outcomes</h3>{chart(countBy(appointments,a=>a.outcome))}</div><div className="card"><h3>Sources</h3>{chart(countBy(appointments,a=>a.source))}</div><div className="card"><h3>YES Breakdown</h3>{chart(yesCounts(appointments))}</div></div></section><section className={tab==='leaderboard'?'section active':'section'}><div className="card"><h2>Leaderboard</h2><p className="muted">Ranked by total appointments logged.</p>{leaderboard.length?leaderboard.map(([name,count],i)=><div className="reportrow" key={name}><strong>#{i+1} {name}</strong> — {count} appointment{count===1?'':'s'} • YES ratio: {yesRatio(appointments.filter(a=>a.member===name))}</div>):<div className="empty">No data yet.</div>}</div></section><section className={tab==='reports'?'section active':'section'}><div className="filters"><select value={reportWeek} onChange={e=>setReportWeek(e.target.value)}>{(weeks.length?weeks:[currentWeek()]).map(w=><option key={w} value={w}>{weekLabel(w)}</option>)}</select><button className="btn secondary" onClick={()=>copyPreview(buildManagerReport())}>Copy Manager Report</button><button className="btn secondary" onClick={()=>copyPreview(Array.from(new Set(reportLogs.map(a=>a.member))).map(buildPersonReport).join('\n\n====================\n\n'))}>Copy Individual Reports</button><button className="btn secondary" onClick={exportCsv}>Export CSV</button><button className="btn secondary" onClick={()=>download('applog-backup.json',JSON.stringify({teammates,settings,appointments},null,2),'application/json')}>Export JSON</button></div><div className="card"><h3>Week Summary</h3><p>Total: {reportLogs.length} • YES: {reportLogs.filter(a=>a.outcome==='Yes').length} • Ratio: {yesRatio(reportLogs)}</p><pre className="pre">{yesSummary(reportLogs)}</pre></div>{preview&&<pre className="pre">{preview}</pre>}</section><section className={tab==='settings'?'section active':'section'}><div className="card"><h2>Team Members</h2><div className="grid2"><input placeholder="Name" value={newMate.name} onChange={e=>setNewMate({...newMate,name:e.target.value})}/><input placeholder="Rep ID" value={newMate.rep_id} onChange={e=>setNewMate({...newMate,rep_id:e.target.value})}/><input placeholder="Phone" value={newMate.phone} onChange={e=>setNewMate({...newMate,phone:e.target.value})}/><input placeholder="Email" value={newMate.email} onChange={e=>setNewMate({...newMate,email:e.target.value})}/></div><button className="btn primary full" onClick={addTeammate}>Add Teammate</button>{teammates.map(t=><div className="reportrow" key={t.id}><strong>{t.name}</strong> • Rep ID: {t.rep_id||'—'} • {t.email||'No email'} <div className="row">{t.is_admin?<button className="btn secondary" onClick={()=>removeAdmin(t)}>Remove Admin</button>:<button className="btn secondary" onClick={()=>promote(t)}>Promote to Co-Admin</button>}<button className="danger" onClick={()=>updateTeammate(t,{active:false})}>Deactivate</button></div></div>)}</div><div className="card"><h2>Settings</h2><label>New Admin Passcode</label><input type="password" value={newPasscode} onChange={e=>setNewPasscode(e.target.value)}/><button className="btn primary full" onClick={()=>{if(!newPasscode)return notify('Enter a passcode.');saveSettings({admin_passcode:newPasscode});setNewPasscode('')}}>Save Passcode</button><label>Manager Email</label><input value={settings?.manager_email||''} onChange={e=>setSettings(settings?{...settings,manager_email:e.target.value}:settings)}/><label>Report Day</label><select value={settings?.report_day||'Friday'} onChange={e=>setSettings(settings?{...settings,report_day:e.target.value}:settings)}>{DAYS.map(d=><option key={d}>{d}</option>)}</select><label>Report Time</label><input type="time" value={settings?.report_time||'08:00'} onChange={e=>setSettings(settings?{...settings,report_time:e.target.value}:settings)}/><label>Missed Activity Alert Days</label><input type="number" value={settings?.missed_activity_days||7} onChange={e=>setSettings(settings?{...settings,missed_activity_days:Number(e.target.value)}:settings)}/><div className="checks"><label className="check"><input type="checkbox" checked={!!settings?.send_manager_report} onChange={e=>setSettings(settings?{...settings,send_manager_report:e.target.checked}:settings)}/>Send manager report</label><label className="check"><input type="checkbox" checked={!!settings?.send_individual_reports} onChange={e=>setSettings(settings?{...settings,send_individual_reports:e.target.checked}:settings)}/>Send individual reports</label></div><button className="btn primary full" onClick={()=>settings&&saveSettings(settings)}>Save Settings</button></div></section></>}
    <div className={toast ? 'toast show' : 'toast'}>{toast}</div></main>;
}
