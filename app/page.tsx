'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Teammate = { id?: string; name: string; rep_id?: string | null; phone?: string | null; email?: string | null; is_admin?: boolean | null; active?: boolean | null };
type Appointment = { id?: string; teammate_id?: string | null; member: string; client_name: string; appointment_date: string; appointment_time?: string | null; appointment_type: string; source: string; outcome: string; detail?: string | null; lessons?: string | null; week_key: string; created_at?: string };
type Settings = { id: number; admin_passcode: string; manager_email?: string | null; report_day?: string | null; report_time?: string | null; report_frequency?: string | null; send_manager_report?: boolean | null; send_individual_reports?: boolean | null };

const APPOINTMENT_TYPES = ['Initial Meeting', 'Review Meeting', 'Carryback', 'Follow-Up', 'Orientation', 'Other'];
const SOURCES = ['Field Training', 'Introduction', 'Other'];
const YES_OPTIONS = ['Recruit', 'Life Insurance', 'Investments', 'Client Solutions', 'Carryback'];

function mondayKey(dateString: string) {
  const d = new Date(dateString + 'T00:00:00');
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().slice(0, 10);
}

function currentDate() { return new Date().toISOString().slice(0, 10); }
function currentTime() { return new Date().toTimeString().slice(0, 5); }
function yesRatio(total: number, yes: number) { return total ? Math.round((yes / total) * 100) : 0; }
function weekLabel(week: string) {
  const start = new Date(week + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} - ${fmt(end)}`;
}

export default function Home() {
  const [status, setStatus] = useState('');
  const [user, setUser] = useState<{ name: string; role: 'admin' | 'teammate' } | null>(null);
  const [activeTab, setActiveTab] = useState('log');
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [settings, setSettings] = useState<Settings>({ id: 1, admin_passcode: 'admin123', report_day: 'Friday', report_time: '08:00', report_frequency: 'Weekly', send_manager_report: true, send_individual_reports: true });
  const [loginRole, setLoginRole] = useState<'admin' | 'teammate'>('admin');
  const [loginAdmin, setLoginAdmin] = useState('');
  const [loginTeammate, setLoginTeammate] = useState('');
  const [passcode, setPasscode] = useState('');

  const [form, setForm] = useState({ member: '', date: currentDate(), time: currentTime(), client: '', appointmentType: '', appointmentOther: '', source: '', sourceOther: '', outcome: '', conditionDetail: '', objectionDetail: '', yesOptions: [] as string[], lessons: '' });
  const [newMember, setNewMember] = useState({ name: '', rep_id: '', phone: '', email: '' });

  const isAdmin = user?.role === 'admin';
  const admins = teammates.filter(t => t.is_admin && t.active !== false);
  const activeTeammates = teammates.filter(t => t.active !== false);
  const visibleAppointments = isAdmin ? appointments : appointments.filter(a => a.member === user?.name);
  const weeks = Array.from(new Set(visibleAppointments.map(a => a.week_key))).sort().reverse();
  const [numbersWeek, setNumbersWeek] = useState('');

  const numbersData = useMemo(() => {
    const data = numbersWeek ? visibleAppointments.filter(a => a.week_key === numbersWeek) : visibleAppointments;
    const total = data.length;
    const yes = data.filter(a => a.outcome === 'Yes').length;
    const byMember: Record<string, { total: number; yes: number }> = {};
    data.forEach(a => {
      byMember[a.member] ||= { total: 0, yes: 0 };
      byMember[a.member].total += 1;
      if (a.outcome === 'Yes') byMember[a.member].yes += 1;
    });
    const leaderboard = Object.entries(byMember).sort((a, b) => b[1].yes - a[1].yes || b[1].total - a[1].total);
    return { data, total, yes, ratio: yesRatio(total, yes), leaderboard };
  }, [visibleAppointments, numbersWeek]);

  async function loadAll() {
    const [tm, ap, st] = await Promise.all([
      supabase.from('teammates').select('*').eq('active', true).order('name'),
      supabase.from('appointments').select('*').order('created_at', { ascending: false }),
      supabase.from('app_settings').select('*').eq('id', 1).maybeSingle()
    ]);
    if (tm.error) throw tm.error;
    if (ap.error) throw ap.error;
    setTeammates(tm.data || []);
    setAppointments(ap.data || []);
    if (st.data) setSettings(st.data as Settings);
  }

  useEffect(() => {
    loadAll().catch(e => show(`Load error: ${e.message}`));
  }, []);

  function show(message: string) {
    setStatus(message);
    setTimeout(() => setStatus(''), 3500);
  }

  function updateForm(key: string, value: any) { setForm(prev => ({ ...prev, [key]: value })); }

  async function testConnection() {
    const { data, error } = await supabase.from('app_settings').select('id').limit(1);
    if (error) show(`Supabase error: ${error.message}`);
    else show(`Supabase connected. Test returned ${data?.length || 0} row(s).`);
  }

  function login() {
    if (loginRole === 'admin') {
      if (!loginAdmin) return show('Please select an admin.');
      if (passcode !== settings.admin_passcode) return show('Incorrect admin passcode.');
      setUser({ name: loginAdmin, role: 'admin' });
      setForm(prev => ({ ...prev, member: loginAdmin }));
    } else {
      if (!loginTeammate) return show('Please select a teammate.');
      setUser({ name: loginTeammate, role: 'teammate' });
      setForm(prev => ({ ...prev, member: loginTeammate }));
    }
  }

  async function addMember() {
    try {
      if (!newMember.name.trim()) return show('Please enter a member name.');
      const { error } = await supabase.from('teammates').insert({ name: newMember.name.trim(), rep_id: newMember.rep_id, phone: newMember.phone, email: newMember.email, is_admin: false, active: true });
      if (error) throw error;
      setNewMember({ name: '', rep_id: '', phone: '', email: '' });
      await loadAll();
      show('Member added successfully.');
    } catch (e: any) { show(`Add member error: ${e.message}`); }
  }

  async function promoteAdmin(name: string) {
    const { error } = await supabase.from('teammates').update({ is_admin: true }).eq('name', name);
    if (error) return show(`Promote error: ${error.message}`);
    await loadAll();
    show(`${name} promoted to co-admin.`);
  }

  async function saveSettings() {
    const { error } = await supabase.from('app_settings').upsert(settings, { onConflict: 'id' });
    if (error) return show(`Settings error: ${error.message}`);
    show('Settings saved.');
  }

  async function saveAppointment() {
    try {
      const missing = [];
      if (!form.member) missing.push('Team Member');
      if (!form.date) missing.push('Date');
      if (!form.client.trim()) missing.push('Prospect / Client Name');
      if (!form.appointmentType) missing.push('Appointment Type');
      if (!form.source) missing.push('Source');
      if (!form.outcome) missing.push('Outcome');
      if (form.appointmentType === 'Other' && !form.appointmentOther.trim()) missing.push('Other Appointment Type');
      if (form.source === 'Other' && !form.sourceOther.trim()) missing.push('Other Source');
      if (form.outcome === 'Condition' && !form.conditionDetail.trim()) missing.push('Condition Details');
      if (form.outcome === 'Objection' && !form.objectionDetail.trim()) missing.push('Objection Details');
      if (missing.length) return show(`Missing: ${missing.join(', ')}`);

      const teammate = teammates.find(t => t.name === form.member);
      const appointment: Appointment = {
        teammate_id: teammate?.id || null,
        member: form.member,
        client_name: form.client.trim(),
        appointment_date: form.date,
        appointment_time: form.time,
        appointment_type: form.appointmentType === 'Other' ? `Other: ${form.appointmentOther.trim()}` : form.appointmentType,
        source: form.source === 'Other' ? `Other: ${form.sourceOther.trim()}` : form.source,
        outcome: form.outcome,
        detail: form.outcome === 'Condition' ? form.conditionDetail.trim() : form.outcome === 'Objection' ? form.objectionDetail.trim() : form.outcome === 'Yes' ? form.yesOptions.join(', ') : '',
        lessons: form.lessons.trim(),
        week_key: mondayKey(form.date)
      };
      const { error } = await supabase.from('appointments').insert(appointment);
      if (error) throw error;
      setForm({ member: isAdmin ? form.member : user?.name || '', date: currentDate(), time: currentTime(), client: '', appointmentType: '', appointmentOther: '', source: '', sourceOther: '', outcome: '', conditionDetail: '', objectionDetail: '', yesOptions: [], lessons: '' });
      await loadAll();
      show('Appointment saved.');
    } catch (e: any) { show(`Appointment error: ${e.message}`); }
  }

  async function triggerWeeklyReport() {
    try {
      const res = await fetch('/api/weekly-report');
      const json = await res.json();
      if (!json.success) return show(`Report error: ${json.error || 'Unknown error'}`);
      show(json.emailSent ? 'Weekly report sent.' : 'Report generated. Email variables may be missing.');
    } catch (e: any) { show(`Report error: ${e.message}`); }
  }

  if (!user) {
    return <>
      <div className="login-card card">
        <h1 style={{fontSize:28, marginBottom:6}}>AppLog</h1>
        <p className="muted" style={{marginBottom:16}}>Sign in as an admin or teammate.</p>
        <label>Role</label>
        <select value={loginRole} onChange={e => setLoginRole(e.target.value as any)}><option value="admin">Admin</option><option value="teammate">Teammate</option></select>
        {loginRole === 'admin' ? <div>
          <label>Admin Name</label>
          <select value={loginAdmin} onChange={e => setLoginAdmin(e.target.value)}><option value="">Select admin...</option>{admins.map(a => <option key={a.id || a.name} value={a.name}>{a.name}</option>)}</select>
          <label>Admin Passcode</label>
          <input type="password" value={passcode} onChange={e => setPasscode(e.target.value)} placeholder="Enter admin passcode" />
          <p className="muted" style={{fontSize:12, marginTop:6}}>Default passcode: admin123</p>
        </div> : <div>
          <label>Teammate Name</label>
          <select value={loginTeammate} onChange={e => setLoginTeammate(e.target.value)}><option value="">Select teammate...</option>{activeTeammates.map(t => <option key={t.id || t.name} value={t.name}>{t.name}</option>)}</select>
        </div>}
        <button className="btn btn-primary btn-full" onClick={login}>Log In</button>
        <button className="btn btn-secondary btn-full" onClick={testConnection}>Test Supabase Connection</button>
      </div>
      {status && <div className="status">{status}</div>}
    </>;
  }

  return <div className={isAdmin ? 'app admin' : 'app'}>
    <div className="header"><div><h1>AppLog</h1><p>Track appointments, outcomes, weekly reports, and team numbers.</p></div><div style={{textAlign:'right'}}><div className="badge badge-warning">{user.name} • {isAdmin ? 'Admin' : 'Teammate'}</div><button className="btn btn-secondary" style={{marginTop:8}} onClick={() => setUser(null)}>Log Out</button></div></div>
    <div className="tabs">
      <button className={'tab '+(activeTab==='log'?'active':'')} onClick={() => setActiveTab('log')}>Log Appointment</button>
      <button className={'tab '+(activeTab==='view'?'active':'')} onClick={() => setActiveTab('view')}>View Logs</button>
      <button className={'tab '+(activeTab==='numbers'?'active':'')} onClick={() => setActiveTab('numbers')}>The Numbers</button>
      <button className={'tab admin-only '+(activeTab==='reports'?'active':'')} onClick={() => setActiveTab('reports')}>Reports</button>
      <button className={'tab admin-only '+(activeTab==='settings'?'active':'')} onClick={() => setActiveTab('settings')}>Settings</button>
    </div>

    <section className={'section '+(activeTab==='log'?'active':'') }><div className="card">
      <label>Team Member Name</label><select value={form.member} disabled={!isAdmin} onChange={e => updateForm('member', e.target.value)}><option value="">Select team member...</option>{activeTeammates.map(t => <option key={t.id || t.name} value={t.name}>{t.name}</option>)}</select>
      <div className="grid-2"><div><label>Date</label><input type="date" value={form.date} onChange={e => updateForm('date', e.target.value)} /></div><div><label>Time</label><input type="time" value={form.time} onChange={e => updateForm('time', e.target.value)} /></div></div>
      <label>Prospect / Client Name</label><input value={form.client} onChange={e => updateForm('client', e.target.value)} placeholder="Example: Jane Smith" />
      <label>Appointment Type</label><select value={form.appointmentType} onChange={e => updateForm('appointmentType', e.target.value)}><option value="">Select one...</option>{APPOINTMENT_TYPES.map(x => <option key={x} value={x}>{x}</option>)}</select>
      <div className={'conditional '+(form.appointmentType==='Other'?'show':'')}><label>Other Appointment Type</label><input value={form.appointmentOther} onChange={e => updateForm('appointmentOther', e.target.value)} /></div>
      <label>Source</label><select value={form.source} onChange={e => updateForm('source', e.target.value)}><option value="">Select one...</option>{SOURCES.map(x => <option key={x} value={x}>{x}</option>)}</select>
      <div className={'conditional '+(form.source==='Other'?'show':'')}><label>Other Source</label><input value={form.sourceOther} onChange={e => updateForm('sourceOther', e.target.value)} /></div>
      <label>Outcome</label><select value={form.outcome} onChange={e => updateForm('outcome', e.target.value)}><option value="">Select one...</option><option value="No Ask">I didn’t ask for the close</option><option value="Condition">There was a condition that prevents the close</option><option value="Objection">I couldn’t overcome an objection</option><option value="Yes">I got a YES</option></select>
      <div className={'conditional '+(form.outcome==='Condition'?'show':'')}><label>Details — What condition prevented the close?</label><input value={form.conditionDetail} onChange={e => updateForm('conditionDetail', e.target.value)} placeholder="Example: Client is uninsurable, has no income, or does not qualify right now" /></div>
      <div className={'conditional '+(form.outcome==='Objection'?'show':'')}><label>Details — What objection could not be overcome?</label><input value={form.objectionDetail} onChange={e => updateForm('objectionDetail', e.target.value)} /></div>
      <div className={'conditional '+(form.outcome==='Yes'?'show':'')}><strong>What was the YES?</strong><div className="checks">{YES_OPTIONS.map(opt => <label className="check" key={opt}><input type="checkbox" checked={form.yesOptions.includes(opt)} onChange={e => updateForm('yesOptions', e.target.checked ? [...form.yesOptions, opt] : form.yesOptions.filter(x => x !== opt))} /> {opt}</label>)}</div></div>
      <label>Lessons Learned and Changes Made</label><textarea value={form.lessons} onChange={e => updateForm('lessons', e.target.value)} />
      <button className="btn btn-primary btn-full" onClick={saveAppointment}>Save Appointment</button>
    </div></section>

    <section className={'section '+(activeTab==='view'?'active':'')}><div>{visibleAppointments.length ? visibleAppointments.map(a => <div className="log-item" key={a.id}><div className="log-title">{a.client_name}</div><div className="badges"><span className="badge">{a.member}</span><span className="badge">{a.appointment_date}</span><span className="badge">{a.appointment_type}</span><span className="badge">{a.source}</span><span className={'badge '+(a.outcome==='Yes'?'badge-success':'')}>{a.outcome}{a.detail ? ` - ${a.detail}` : ''}</span></div>{a.lessons && <p className="notes"><strong>Lessons:</strong> {a.lessons}</p>}</div>) : <div className="empty">No appointments found.</div>}</div></section>

    <section className={'section '+(activeTab==='numbers'?'active':'')}><div className="filters"><select value={numbersWeek} onChange={e => setNumbersWeek(e.target.value)}><option value="">All weeks</option>{weeks.map(w => <option key={w} value={w}>{weekLabel(w)}</option>)}</select></div><div className="stats"><div className="stat"><strong>{numbersData.total}</strong><span>Total Appointments</span></div><div className="stat"><strong>{numbersData.yes}</strong><span>YES Outcomes</span></div><div className="stat"><strong>{numbersData.ratio}%</strong><span>YES Ratio</span></div></div><div className="card"><h3>Leaderboard</h3>{numbersData.leaderboard.length ? numbersData.leaderboard.map(([member, stats], idx) => <div className="report-row" key={member}><strong>{idx+1}. {member}</strong><br />{stats.yes} YES / {stats.total} appointments ({yesRatio(stats.total, stats.yes)}%)</div>) : <p className="muted">No numbers yet.</p>}</div></section>

    <section className={'section '+(activeTab==='reports'?'active':'')}><div className="card"><h3>Weekly Reports</h3><p className="muted">Generate and email the weekly report using your Vercel environment variables.</p><button className="btn btn-primary btn-full" onClick={triggerWeeklyReport}>Send Weekly Report Now</button><p className="muted" style={{marginTop:12}}>Test URL: /api/weekly-report</p></div></section>

    <section className={'section '+(activeTab==='settings'?'active':'')}>
      <div className="card"><h3>Supabase</h3><button className="btn btn-secondary" onClick={testConnection}>Test Supabase Connection</button></div>
      <div className="card"><h3>Team Members</h3><div>{activeTeammates.map(t => <div className="member-row" key={t.id || t.name}><div><strong>{t.name}</strong><br/><span className="muted">Rep ID: {t.rep_id || '—'} • {t.phone || 'No phone'} • {t.email || 'No email'} {t.is_admin ? '• Admin' : ''}</span></div>{!t.is_admin && <button className="btn btn-secondary" onClick={() => promoteAdmin(t.name)}>Promote to Co-Admin</button>}</div>)}</div><div className="grid-2"><div><label>Name</label><input value={newMember.name} onChange={e => setNewMember({...newMember, name:e.target.value})} /></div><div><label>Rep ID</label><input value={newMember.rep_id} onChange={e => setNewMember({...newMember, rep_id:e.target.value})} /></div><div><label>Phone</label><input value={newMember.phone} onChange={e => setNewMember({...newMember, phone:e.target.value})} /></div><div><label>Email</label><input value={newMember.email} onChange={e => setNewMember({...newMember, email:e.target.value})} /></div></div><button className="btn btn-primary btn-full" onClick={addMember}>Add Member</button></div>
      <div className="card"><h3>Report Settings</h3><label>Manager Email</label><input value={settings.manager_email || ''} onChange={e => setSettings({...settings, manager_email:e.target.value})} /><label>Admin Passcode</label><input value={settings.admin_passcode} onChange={e => setSettings({...settings, admin_passcode:e.target.value})} /><button className="btn btn-primary btn-full" onClick={saveSettings}>Save Settings</button></div>
    </section>
    {status && <div className="status">{status}</div>}
  </div>;
}
