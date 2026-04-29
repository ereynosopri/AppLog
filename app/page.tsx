'use client';

import { FormEvent, MouseEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Teammate = { id: string; name: string; rep_id?: string | null; phone?: string | null; email?: string | null; is_admin?: boolean | null; active?: boolean | null };
type Settings = { id: number; admin_passcode: string; manager_email?: string | null; report_day?: string | null; report_time?: string | null; report_frequency?: string | null; send_manager_report?: boolean | null; send_individual_reports?: boolean | null; missed_activity_days?: number | null };
type Appointment = { id: string; teammate_id?: string | null; member: string; client_name: string; appointment_date: string; appointment_time?: string | null; appointment_type: string; source: string; outcome: string; detail?: string | null; lessons?: string | null; week_key: string; created_by?: string | null; updated_by?: string | null; created_at?: string | null; updated_at?: string | null };
type User = { name: string; role: 'admin' | 'teammate'; teammateId?: string };

type FormState = {
  id: string;
  teammate_id: string;
  member: string;
  client_name: string;
  appointment_date: string;
  appointment_time: string;
  appointment_type: string;
  appointment_other: string;
  source: string;
  source_other: string;
  outcome: string;
  detail: string;
  lessons: string;
  yes: string[];
};

const TYPES = ['Initial Meeting', 'Review Meeting', 'Carryback', 'Follow-Up', 'Orientation', 'Other'];
const SOURCES = ['Field Training', 'Introduction', 'Other'];
const YES_CATEGORIES = ['Recruit', 'Life Insurance', 'Investments', 'Client Solutions', 'Carryback'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function todayString() { return new Date().toISOString().slice(0, 10); }
function nowTimeString() { return new Date().toTimeString().slice(0, 5); }
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
function currentWeek() { return weekKey(todayString()); }
function fmtTime(time?: string | null) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function yesRatio(items: Appointment[]) {
  return items.length ? `${Math.round((items.filter(x => x.outcome === 'Yes').length / items.length) * 100)}%` : '0%';
}
function countBy<T>(items: T[], getter: (i: T) => string | undefined | null) {
  return items.reduce((acc: Record<string, number>, item) => {
    const key = getter(item) || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}
function yesCounts(items: Appointment[]) {
  const counts: Record<string, number> = {};
  YES_CATEGORIES.forEach(c => counts[c] = 0);
  items.filter(x => x.outcome === 'Yes').forEach(log => {
    String(log.detail || '').split(',').map(x => x.trim()).filter(Boolean).forEach(x => {
      counts[x] = (counts[x] || 0) + 1;
    });
  });
  return counts;
}
function yesSummary(items: Appointment[]) {
  const c = yesCounts(items);
  return YES_CATEGORIES.map(cat => `${cat}: ${c[cat] || 0}`).join('\n');
}
function csvEscape(v: unknown) { return `"${String(v || '').replace(/"/g, '""')}"`; }
function blankFormFor(user?: User | null): FormState {
  return {
    id: '',
    teammate_id: user?.role === 'teammate' ? user.teammateId || '' : '',
    member: user?.role === 'teammate' ? user.name : '',
    client_name: '',
    appointment_date: todayString(),
    appointment_time: nowTimeString(),
    appointment_type: '',
    appointment_other: '',
    source: '',
    source_other: '',
    outcome: '',
    detail: '',
    lessons: '',
    yes: []
  };
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState('');
  const [toast, setToast] = useState('');
  const [statusMessage, setStatusMessage] = useState('Ready.');
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
  const [form, setForm] = useState<FormState>(blankFormFor(null));
  const [newMate, setNewMate] = useState({ name: '', rep_id: '', phone: '', email: '' });
  const [newPasscode, setNewPasscode] = useState('');

  function notify(msg: string) {
    console.log('[AppLog]', msg);
    setStatusMessage(msg);
    setToast(msg);
    window.setTimeout(() => setToast(''), 3500);
  }

  async function runAction(label: string, action: () => Promise<void> | void) {
    if (actionBusy) return;
    setActionBusy(label);
    setStatusMessage(`${label}...`);
    try {
      await action();
    } catch (error: any) {
      notify(`${label} failed: ${error?.message || String(error)}`);
    } finally {
      setActionBusy('');
    }
  }

  function buttonAction(label: string, action: () => Promise<void> | void) {
    return (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      void runAction(label, action);
    };
  }

  function submitAction(label: string, action: () => Promise<void> | void) {
    return (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      e.stopPropagation();
      void runAction(label, action);
    };
  }

  async function loadAll() {
    setLoading(true);
    const [matesRes, settingsRes, apptsRes] = await Promise.all([
      supabase.from('teammates').select('*').eq('active', true).order('name'),
      supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('appointments').select('*').order('appointment_date', { ascending: false }).order('appointment_time', { ascending: false })
    ]);
    if (matesRes.error) throw new Error('Teammates: ' + matesRes.error.message);
    if (settingsRes.error) throw new Error('Settings: ' + settingsRes.error.message);
    if (apptsRes.error) throw new Error('Appointments: ' + apptsRes.error.message);
    setTeammates((matesRes.data || []) as Teammate[]);
    setSettings((settingsRes.data || null) as Settings | null);
    setAppointments((apptsRes.data || []) as Appointment[]);
    setLoading(false);
  }

  useEffect(() => {
    runAction('Loading data', loadAll).finally(() => setLoading(false));
  }, []);

  const admins = teammates.filter(t => t.is_admin);
  const visible = useMemo(() => user?.role === 'admin' ? appointments : appointments.filter(a => a.member === user?.name), [appointments, user]);
  const weeks = useMemo(() => Array.from(new Set(visible.map(a => a.week_key))).filter(Boolean).sort().reverse(), [visible]);
  const filteredLogs = useMemo(() => visible
    .filter(a => !filterMember || a.member === filterMember)
    .filter(a => !filterWeek || a.week_key === filterWeek)
    .filter(a => !search || [a.client_name, a.lessons, a.detail, a.source, a.appointment_type].some(v => String(v || '').toLowerCase().includes(search.toLowerCase()))), [visible, filterMember, filterWeek, search]);
  const reportLogs = appointments.filter(a => a.week_key === reportWeek);
  const leaderboard = Object.entries(countBy(appointments, a => a.member)).sort((a, b) => b[1] - a[1]);
  const missedDays = settings?.missed_activity_days || 7;
  const missedAlerts = teammates.filter(t => {
    if (!t.active) return false;
    const latest = appointments.filter(a => a.member === t.name).sort((a, b) => String(b.appointment_date).localeCompare(String(a.appointment_date)))[0];
    if (!latest) return true;
    const days = Math.floor((Date.now() - new Date(latest.appointment_date + 'T00:00:00').getTime()) / 86400000);
    return days >= missedDays;
  });

  async function doLogin() {
    if (loginRole === 'admin') {
      const admin = admins.find(a => a.id === loginAdmin);
      if (!admin) { notify('Please select an admin.'); return; }
      if (passcode !== settings?.admin_passcode) { notify('Incorrect admin passcode.'); return; }
      const nextUser = { name: admin.name, role: 'admin' as const, teammateId: admin.id };
      setUser(nextUser);
      setForm(blankFormFor(nextUser));
      setTab('log');
      notify('Logged in as admin.');
      return;
    }
    const mate = teammates.find(t => t.id === loginTeammate);
    if (!mate) { notify('Please select a teammate.'); return; }
    const nextUser = { name: mate.name, role: 'teammate' as const, teammateId: mate.id };
    setUser(nextUser);
    setForm(blankFormFor(nextUser));
    setTab('log');
    notify('Logged in as teammate.');
  }

  async function logout() {
    setUser(null);
    setTab('log');
    setPasscode('');
    setLoginAdmin('');
    setLoginTeammate('');
    setForm(blankFormFor(null));
    notify('Logged out.');
  }

  async function saveAppointment() {
    let appointment_type = form.appointment_type === 'Other' ? `Other: ${form.appointment_other.trim()}` : form.appointment_type;
    let source = form.source === 'Other' ? `Other: ${form.source_other.trim()}` : form.source;
    const detail = form.outcome === 'Yes' ? form.yes.join(', ') : form.detail.trim();
    const missing: string[] = [];
    if (!form.teammate_id) missing.push('Team Member');
    if (!form.appointment_date) missing.push('Date');
    if (!form.client_name.trim()) missing.push('Prospect / Client Name');
    if (!appointment_type) missing.push('Appointment Type');
    if (form.appointment_type === 'Other' && !form.appointment_other.trim()) missing.push('Other Appointment Type');
    if (!source) missing.push('Source');
    if (form.source === 'Other' && !form.source_other.trim()) missing.push('Other Source');
    if (!form.outcome) missing.push('Outcome');
    if ((form.outcome === 'Condition' || form.outcome === 'Objection') && !detail) missing.push('Outcome Details');
    if (missing.length) { notify('Missing: ' + missing.join(', ')); return; }
    const selected = teammates.find(t => t.id === form.teammate_id);
    const payload = {
      teammate_id: form.teammate_id,
      member: selected?.name || form.member,
      client_name: form.client_name.trim(),
      appointment_date: form.appointment_date,
      appointment_time: form.appointment_time,
      appointment_type,
      source,
      outcome: form.outcome,
      detail,
      lessons: form.lessons.trim(),
      week_key: weekKey(form.appointment_date),
      updated_by: user?.name || '',
      updated_at: new Date().toISOString()
    };
    const res = form.id
      ? await supabase.from('appointments').update(payload).eq('id', form.id).select().single()
      : await supabase.from('appointments').insert({ ...payload, created_by: user?.name || '' }).select().single();
    if (res.error) throw new Error('Supabase appointment error: ' + res.error.message);
    await supabase.from('audit_log').insert({ actor: user?.name, action: form.id ? 'updated appointment' : 'created appointment', entity_type: 'appointment', entity_id: res.data.id, notes: payload.client_name });
    setForm(blankFormFor(user));
    notify(form.id ? 'Appointment updated.' : 'Appointment saved.');
    await loadAll();
  }

  async function editAppointment(a: Appointment) {
    const isOtherType = a.appointment_type.startsWith('Other: ');
    const isOtherSource = a.source.startsWith('Other: ');
    setForm({
      id: a.id,
      teammate_id: a.teammate_id || '',
      member: a.member,
      client_name: a.client_name,
      appointment_date: a.appointment_date,
      appointment_time: a.appointment_time || '',
      appointment_type: isOtherType ? 'Other' : a.appointment_type,
      appointment_other: isOtherType ? a.appointment_type.replace('Other: ', '') : '',
      source: isOtherSource ? 'Other' : a.source,
      source_other: isOtherSource ? a.source.replace('Other: ', '') : '',
      outcome: a.outcome,
      detail: a.outcome === 'Yes' ? '' : a.detail || '',
      lessons: a.lessons || '',
      yes: a.outcome === 'Yes' ? String(a.detail || '').split(',').map(x => x.trim()).filter(Boolean) : []
    });
    setTab('log');
    notify('Editing appointment.');
  }

  async function deleteAppointment(id: string) {
    if (!window.confirm('Delete this appointment?')) return;
    const res = await supabase.from('appointments').delete().eq('id', id);
    if (res.error) throw new Error(res.error.message);
    await supabase.from('audit_log').insert({ actor: user?.name, action: 'deleted appointment', entity_type: 'appointment', entity_id: id });
    notify('Appointment deleted.');
    await loadAll();
  }

  async function addTeammate() {
    const name = newMate.name.trim();
    if (!name) { notify('Please enter a teammate name.'); return; }
    const payload = { name, rep_id: newMate.rep_id.trim(), phone: newMate.phone.trim(), email: newMate.email.trim(), active: true, is_admin: false };
    const res = await supabase.from('teammates').insert(payload).select().single();
    if (res.error) throw new Error('Supabase teammate error: ' + res.error.message);
    setNewMate({ name: '', rep_id: '', phone: '', email: '' });
    notify('Teammate added: ' + res.data.name);
    await loadAll();
  }

  async function updateTeammate(t: Teammate, patch: Partial<Teammate>, message = 'Teammate updated.') {
    const res = await supabase.from('teammates').update(patch).eq('id', t.id).select().single();
    if (res.error) throw new Error(res.error.message);
    notify(message);
    await loadAll();
  }

  async function promote(t: Teammate) { await updateTeammate(t, { is_admin: true }, t.name + ' promoted to co-admin.'); }
  async function removeAdmin(t: Teammate) {
    if (admins.length <= 1) { notify('Keep at least one admin.'); return; }
    await updateTeammate(t, { is_admin: false }, t.name + ' removed as admin.');
  }
  async function deactivate(t: Teammate) {
    if (!window.confirm('Deactivate this teammate?')) return;
    await updateTeammate(t, { active: false }, t.name + ' deactivated.');
  }

  async function saveSettings(patch: Partial<Settings>) {
    const res = await supabase.from('app_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1).select().single();
    if (res.error) throw new Error(res.error.message);
    setSettings(res.data as Settings);
    notify('Settings saved.');
  }

  function buildPersonReport(person: string) {
    const mate = teammates.find(t => t.name === person);
    const logs = appointments.filter(a => a.member === person && a.week_key === reportWeek);
    const lines = logs.map(a => [`• ${a.client_name} — ${a.appointment_date}${a.appointment_time ? ' at ' + fmtTime(a.appointment_time) : ''}`, `  Type: ${a.appointment_type}`, `  Source: ${a.source}`, `  Outcome: ${a.outcome}`, a.detail ? `  Details: ${a.detail}` : '', a.lessons ? `  Lessons learned: ${a.lessons}` : ''].filter(Boolean).join('\n')).join('\n\n');
    return [`To: ${mate?.email || '[teammate email]'}`, `Subject: Your Weekly Appointment Report — ${weekLabel(reportWeek)}`, '', `Hi ${person},`, '', `Here is your appointment activity for ${weekLabel(reportWeek)}.`, '', 'SUMMARY', `Total appointments: ${logs.length}`, `YES outcomes: ${logs.filter(a => a.outcome === 'Yes').length}`, `YES ratio: ${yesRatio(logs)}`, '', 'YES CATEGORY BREAKDOWN', yesSummary(logs), '', 'APPOINTMENT DETAILS', lines || 'No appointments logged.'].join('\n');
  }
  function buildManagerReport() {
    const people = Array.from(new Set(reportLogs.map(a => a.member))).sort();
    const sections = people.map(p => {
      const logs = reportLogs.filter(a => a.member === p);
      const mate = teammates.find(t => t.name === p);
      return [p, `Rep ID: ${mate?.rep_id || '—'} | Phone: ${mate?.phone || '—'} | Email: ${mate?.email || '—'}`, `Total appointments: ${logs.length}`, `YES outcomes: ${logs.filter(a => a.outcome === 'Yes').length}`, `YES ratio: ${yesRatio(logs)}`, '', 'YES category breakdown:', yesSummary(logs)].join('\n');
    }).join('\n\n-------------------------\n\n');
    return [`To: ${settings?.manager_email || '[manager email]'}`, `Subject: Team Weekly Appointment Report — ${weekLabel(reportWeek)}`, '', 'TEAM SUMMARY', `Total appointments: ${reportLogs.length}`, `YES outcomes: ${reportLogs.filter(a => a.outcome === 'Yes').length}`, `YES ratio: ${yesRatio(reportLogs)}`, '', 'TEAM YES CATEGORY BREAKDOWN', yesSummary(reportLogs), '', '-------------------------', '', sections || 'No appointments logged.'].join('\n');
  }

  async function copyPreview(text: string) {
    setPreview(text);
    try {
      await navigator.clipboard?.writeText(text);
      notify('Copied.');
    } catch {
      notify('Preview created. Copy manually if needed.');
    }
  }
  function downloadFile(name: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    notify(`${name} downloaded.`);
  }
  async function exportCsv() {
    const headers = ['Member', 'Date', 'Time', 'Client', 'Type', 'Source', 'Outcome', 'Details', 'Lessons'];
    const rows = visible.map(a => [a.member, a.appointment_date, a.appointment_time, a.client_name, a.appointment_type, a.source, a.outcome, a.detail, a.lessons]);
    downloadFile('appointments.csv', [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\n'), 'text/csv');
  }

  function chart(counts: Record<string, number>) {
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...entries.map(e => e[1]));
    if (!entries.length) return <div className="empty">No data yet.</div>;
    return <>{entries.map(([label, value]) => <div className="bar" key={label}><div className="barlabel"><span>{label}</span><strong>{value}</strong></div><div className="track"><div className="fill" style={{ width: `${Math.round(value / max * 100)}%` }} /></div></div>)}</>;
  }

  if (loading) return <main className="login card"><h1>Loading AppLog...</h1><p className="muted">Connecting to Supabase.</p><p className="status">{statusMessage}</p></main>;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <main className="login card"><h1>Missing Supabase setup</h1><p className="muted">Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel, then redeploy.</p></main>;

  if (!user) return <main className="login card">
    <h1>Appointment Log</h1>
    <p className="muted">Version 2: cloud database, reports, leaderboard, and alerts.</p>
    <form onSubmit={submitAction('Logging in', doLogin)}>
      <label>Role</label>
      <select value={loginRole} onChange={e => setLoginRole(e.target.value as 'admin' | 'teammate')}><option value="admin">Admin</option><option value="teammate">Teammate</option></select>
      {loginRole === 'admin' ? <>
        <label>Admin</label>
        <select value={loginAdmin} onChange={e => setLoginAdmin(e.target.value)}><option value="">Select admin...</option>{admins.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <label>Admin Passcode</label>
        <input type="password" value={passcode} onChange={e => setPasscode(e.target.value)} placeholder="Enter admin passcode" />
        <p className="muted">Default passcode: admin123</p>
      </> : <>
        <label>Teammate</label>
        <select value={loginTeammate} onChange={e => setLoginTeammate(e.target.value)}><option value="">Select teammate...</option>{teammates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      </>}
      <button type="submit" className="btn primary full" disabled={!!actionBusy}>{actionBusy === 'Logging in' ? 'Logging in...' : 'Log In'}</button>
    </form>
    <p className="status">{statusMessage}</p>
    <div className={toast ? 'toast show' : 'toast'}>{toast}</div>
  </main>;

  return <main className="app">
    <div className="header"><div><h1>Appointment Log</h1><p className="muted">Cloud-synced team appointment system.</p><p className="status">{statusMessage}</p></div><div style={{ textAlign: 'right' }}><span className="badge warn">{user.name} • {user.role === 'admin' ? 'Admin' : 'Teammate'}</span><br/><button type="button" className="btn secondary" style={{ marginTop: 8 }} onClick={buttonAction('Logging out', logout)} disabled={!!actionBusy}>Log Out</button></div></div>
    <div className="tabs">{['log','view'].map(t => <button type="button" key={t} className={tab===t?'tab active':'tab'} onClick={buttonAction('Switching tab', () => setTab(t))}>{t==='log'?'Log Appointment':'View Logs'}</button>)}{user.role==='admin' && ['dashboard','leaderboard','reports','settings'].map(t => <button type="button" key={t} className={tab===t?'tab active':'tab'} onClick={buttonAction('Switching tab', () => setTab(t))}>{t[0].toUpperCase()+t.slice(1)}</button>)}</div>

    <section className={tab==='log'?'section active card':'section card'}>
      <form onSubmit={submitAction(form.id ? 'Updating appointment' : 'Saving appointment', saveAppointment)}>
        <label>Team Member</label>
        <select value={form.teammate_id} disabled={user.role!=='admin'} onChange={e => { const t = teammates.find(x => x.id === e.target.value); setForm({...form, teammate_id:e.target.value, member:t?.name||''}); }}><option value="">Select...</option>{teammates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <div className="grid2"><div><label>Date</label><input type="date" value={form.appointment_date} onChange={e=>setForm({...form,appointment_date:e.target.value})}/></div><div><label>Time</label><input type="time" value={form.appointment_time} onChange={e=>setForm({...form,appointment_time:e.target.value})}/></div></div>
        <label>Prospect / Client Name</label><input value={form.client_name} onChange={e=>setForm({...form,client_name:e.target.value})}/>
        <label>Appointment Type</label><select value={form.appointment_type} onChange={e=>setForm({...form,appointment_type:e.target.value})}><option value="">Select...</option>{TYPES.map(x=><option key={x}>{x}</option>)}</select>
        <div className={form.appointment_type==='Other'?'conditional show':'conditional'}><label>Other Appointment Type</label><input value={form.appointment_other} onChange={e=>setForm({...form,appointment_other:e.target.value})}/></div>
        <label>Source</label><select value={form.source} onChange={e=>setForm({...form,source:e.target.value})}><option value="">Select...</option>{SOURCES.map(x=><option key={x}>{x}</option>)}</select>
        <div className={form.source==='Other'?'conditional show':'conditional'}><label>Other Source</label><input value={form.source_other} onChange={e=>setForm({...form,source_other:e.target.value})}/></div>
        <label>Outcome</label><select value={form.outcome} onChange={e=>setForm({...form,outcome:e.target.value,detail:'',yes:[]})}><option value="">Select...</option><option value="No Ask">I didn’t ask for the close</option><option value="Condition">There was a condition that prevents the close</option><option value="Objection">I couldn’t overcome an objection</option><option value="Yes">I got a YES</option></select>
        <div className={form.outcome==='Condition'||form.outcome==='Objection'?'conditional show':'conditional'}><label>Details</label><input placeholder="Example: Client is uninsurable, has no income, or does not qualify right now" value={form.detail} onChange={e=>setForm({...form,detail:e.target.value})}/></div>
        <div className={form.outcome==='Yes'?'conditional show':'conditional'}><strong>What was the YES?</strong><div className="checks">{YES_CATEGORIES.map(cat=><label className="check" key={cat}><input type="checkbox" checked={form.yes.includes(cat)} onChange={e=>setForm({...form,yes:e.target.checked?[...form.yes,cat]:form.yes.filter(x=>x!==cat)})}/>{cat}</label>)}</div></div>
        <label>Lessons Learned and Changes Made</label><textarea value={form.lessons} onChange={e=>setForm({...form,lessons:e.target.value})}/>
        <div className="row"><button type="submit" className="btn primary" disabled={!!actionBusy}>{actionBusy.includes('appointment') ? 'Working...' : (form.id?'Update Appointment':'Save Appointment')}</button>{form.id && <button type="button" className="btn secondary" onClick={buttonAction('Canceling edit', () => setForm(blankFormFor(user)))}>Cancel Edit</button>}</div>
      </form>
    </section>

    <section className={tab==='view'?'section active':'section'}><div className="filters"><select value={filterMember} disabled={user.role!=='admin'} onChange={e=>setFilterMember(e.target.value)}><option value="">All Team Members</option>{teammates.map(t=><option key={t.id}>{t.name}</option>)}</select><select value={filterWeek} onChange={e=>setFilterWeek(e.target.value)}><option value="">All Weeks</option>{weeks.map(w=><option key={w} value={w}>{weekLabel(w)}</option>)}</select><input placeholder="Search" value={search} onChange={e=>setSearch(e.target.value)}/></div>{filteredLogs.length?filteredLogs.map(a=><div className="item" key={a.id}><div className="itemtop"><div><div className="title">{a.client_name}</div><div className="badges"><span className="badge">{a.member}</span><span className="badge">{a.appointment_date}{a.appointment_time?' at '+fmtTime(a.appointment_time):''}</span><span className="badge">{a.appointment_type}</span><span className="badge">{a.source}</span><span className={a.outcome==='Yes'?'badge yes':'badge'}>{a.outcome}{a.detail?' - '+a.detail:''}</span></div></div><div className="row"><button type="button" className="btn secondary" onClick={buttonAction('Editing appointment', () => editAppointment(a))}>Edit</button><button type="button" className="danger" onClick={buttonAction('Deleting appointment', () => deleteAppointment(a.id))}>Delete</button></div></div>{a.lessons&&<p className="notes"><strong>Lessons learned:</strong> {a.lessons}</p>}</div>):<div className="empty">No appointments found.</div>}</section>

    {user.role==='admin' && <><section className={tab==='dashboard'?'section active':'section'}><div className="stats"><div className="stat"><strong>{appointments.length}</strong><span>Total Appointments</span></div><div className="stat"><strong>{appointments.filter(a=>a.outcome==='Yes').length}</strong><span>YES Outcomes</span></div><div className="stat"><strong>{yesRatio(appointments)}</strong><span>YES Ratio</span></div><div className="stat"><strong>{missedAlerts.length}</strong><span>Missed Activity Alerts</span></div></div>{missedAlerts.length>0&&<div className="card"><h3>Missed Activity Alerts</h3><p className="muted">No appointment logged in {missedDays}+ days.</p>{missedAlerts.map(t=><div className="reportrow" key={t.id}>{t.name} • {t.phone||'No phone'} • {t.email||'No email'}</div>)}</div>}<div className="chartrow"><div className="card"><h3>Appointments by Teammate</h3>{chart(countBy(appointments,a=>a.member))}</div><div className="card"><h3>Outcomes</h3>{chart(countBy(appointments,a=>a.outcome))}</div><div className="card"><h3>Sources</h3>{chart(countBy(appointments,a=>a.source))}</div><div className="card"><h3>YES Breakdown</h3>{chart(yesCounts(appointments))}</div></div></section>
    <section className={tab==='leaderboard'?'section active':'section'}><div className="card"><h2>Leaderboard</h2><p className="muted">Ranked by total appointments logged.</p>{leaderboard.length?leaderboard.map(([name,count],i)=><div className="reportrow" key={name}><strong>#{i+1} {name}</strong> — {count} appointment{count===1?'':'s'} • YES ratio: {yesRatio(appointments.filter(a=>a.member===name))}</div>):<div className="empty">No data yet.</div>}</div></section>
    <section className={tab==='reports'?'section active':'section'}><div className="filters"><select value={reportWeek} onChange={e=>setReportWeek(e.target.value)}>{(weeks.length?weeks:[currentWeek()]).map(w=><option key={w} value={w}>{weekLabel(w)}</option>)}</select><button type="button" className="btn secondary" onClick={buttonAction('Copying manager report', () => copyPreview(buildManagerReport()))}>Copy Manager Report</button><button type="button" className="btn secondary" onClick={buttonAction('Copying individual reports', () => copyPreview(Array.from(new Set(reportLogs.map(a=>a.member))).map(buildPersonReport).join('\n\n====================\n\n')))}>Copy Individual Reports</button><button type="button" className="btn secondary" onClick={buttonAction('Exporting CSV', exportCsv)}>Export CSV</button><button type="button" className="btn secondary" onClick={buttonAction('Exporting JSON', () => downloadFile('applog-backup.json',JSON.stringify({teammates,settings,appointments},null,2),'application/json'))}>Export JSON</button></div><div className="card"><h3>Week Summary</h3><p>Total: {reportLogs.length} • YES: {reportLogs.filter(a=>a.outcome==='Yes').length} • Ratio: {yesRatio(reportLogs)}</p><pre className="pre">{yesSummary(reportLogs)}</pre></div>{preview&&<pre className="pre">{preview}</pre>}</section>
    <section className={tab==='settings'?'section active':'section'}><div className="card"><h2>Team Members</h2><form onSubmit={submitAction('Adding teammate', addTeammate)}><div className="grid2"><input placeholder="Name" value={newMate.name} onChange={e=>setNewMate({...newMate,name:e.target.value})}/><input placeholder="Rep ID" value={newMate.rep_id} onChange={e=>setNewMate({...newMate,rep_id:e.target.value})}/><input placeholder="Phone" value={newMate.phone} onChange={e=>setNewMate({...newMate,phone:e.target.value})}/><input placeholder="Email" value={newMate.email} onChange={e=>setNewMate({...newMate,email:e.target.value})}/></div><button type="submit" className="btn primary full" disabled={!!actionBusy}>{actionBusy === 'Adding teammate' ? 'Adding...' : 'Add Member'}</button></form>{teammates.map(t=><div className="reportrow" key={t.id}><strong>{t.name}</strong> • Rep ID: {t.rep_id||'—'} • {t.email||'No email'} <div className="row">{t.is_admin?<button type="button" className="btn secondary" onClick={buttonAction('Removing admin', () => removeAdmin(t))}>Remove Admin</button>:<button type="button" className="btn secondary" onClick={buttonAction('Promoting admin', () => promote(t))}>Promote to Co-Admin</button>}<button type="button" className="danger" onClick={buttonAction('Deactivating teammate', () => deactivate(t))}>Deactivate</button></div></div>)}</div>
    <div className="card"><h2>Settings</h2><label>New Admin Passcode</label><input type="password" value={newPasscode} onChange={e=>setNewPasscode(e.target.value)}/><button type="button" className="btn primary full" onClick={buttonAction('Saving passcode', async () => { if(!newPasscode){notify('Enter a passcode.'); return;} await saveSettings({admin_passcode:newPasscode}); setNewPasscode(''); })}>Save Passcode</button><label>Manager Email</label><input value={settings?.manager_email||''} onChange={e=>setSettings(settings?{...settings,manager_email:e.target.value}:settings)}/><label>Report Day</label><select value={settings?.report_day||'Friday'} onChange={e=>setSettings(settings?{...settings,report_day:e.target.value}:settings)}>{DAYS.map(d=><option key={d}>{d}</option>)}</select><label>Report Time</label><input type="time" value={settings?.report_time||'08:00'} onChange={e=>setSettings(settings?{...settings,report_time:e.target.value}:settings)}/><label>Missed Activity Alert Days</label><input type="number" value={settings?.missed_activity_days||7} onChange={e=>setSettings(settings?{...settings,missed_activity_days:Number(e.target.value)}:settings)}/><div className="checks"><label className="check"><input type="checkbox" checked={!!settings?.send_manager_report} onChange={e=>setSettings(settings?{...settings,send_manager_report:e.target.checked}:settings)}/>Send manager report</label><label className="check"><input type="checkbox" checked={!!settings?.send_individual_reports} onChange={e=>setSettings(settings?{...settings,send_individual_reports:e.target.checked}:settings)}/>Send individual reports</label></div><button type="button" className="btn primary full" onClick={buttonAction('Saving settings', () => settings && saveSettings(settings))}>Save Settings</button></div></section></>}
    <div className={toast ? 'toast show' : 'toast'}>{toast}</div>
  </main>;
}
