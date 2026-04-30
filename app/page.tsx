'use client';

import { createClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';

type Teammate = { id: string; name: string; rep_id?: string | null; phone?: string | null; email?: string | null; is_admin?: boolean | null; active?: boolean | null };
type Appointment = { id: string; teammate_id?: string | null; member: string; client_name: string; appointment_date: string; appointment_time?: string | null; appointment_type: string; source: string; outcome: string; detail?: string | null; lessons?: string | null; week_key: string; created_at?: string };

const APPOINTMENT_TYPES = ['Initial Meeting', 'Review Meeting', 'Carryback', 'Follow-Up', 'Orientation', 'Other'];
const SOURCES = ['Field Training', 'Introduction', 'Other'];
const OUTCOMES = ['No Ask', 'Condition', 'Objection', 'Yes'];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

function getWeekKey(dateString: string) {
  const date = new Date(dateString + 'T00:00:00');
  const day = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().slice(0, 10);
}

function formatDate(dateString?: string | null) {
  if (!dateString) return '';
  return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(time?: string | null) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function weekLabel(weekKey: string) {
  const start = new Date(weekKey + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const f = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${f(start)} - ${f(end)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentTime() {
  return new Date().toTimeString().slice(0, 5);
}

export default function Page() {
  const supabase = useMemo(() => getSupabase(), []);
  const [tab, setTab] = useState('dashboard');
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [newMember, setNewMember] = useState({ name: '', rep_id: '', phone: '', email: '' });
  const [form, setForm] = useState({ teammate_id: '', member: '', date: today(), time: currentTime(), client_name: '', appointment_type: '', appointment_type_other: '', source: '', source_other: '', outcome: '', detail: '', lessons: '' });
  const [filterWeek, setFilterWeek] = useState('');
  const [filterMember, setFilterMember] = useState('');

  async function loadData() {
    setLoading(true);
    setMessage(null);
    try {
      const [tm, appts] = await Promise.all([
        supabase.from('teammates').select('*').eq('active', true).order('name'),
        supabase.from('appointments').select('*').order('created_at', { ascending: false }),
      ]);
      if (tm.error) throw tm.error;
      if (appts.error) throw appts.error;
      setTeammates(tm.data || []);
      setAppointments(appts.data || []);
    } catch (error: any) {
      setMessage({ type: 'err', text: error.message || 'Unable to load data.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const weeks = useMemo(() => Array.from(new Set(appointments.map(a => a.week_key).filter(Boolean))).sort().reverse(), [appointments]);
  const selectedWeek = filterWeek || weeks[0] || getWeekKey(today());
  const dashboardAppointments = appointments.filter(a => !filterWeek || a.week_key === filterWeek).filter(a => !filterMember || a.member === filterMember);
  const yesCount = dashboardAppointments.filter(a => a.outcome === 'Yes').length;
  const yesRatio = dashboardAppointments.length ? Math.round((yesCount / dashboardAppointments.length) * 100) : 0;

  const leaderboard = useMemo(() => {
    const stats: Record<string, { total: number; yes: number }> = {};
    dashboardAppointments.forEach(a => {
      if (!stats[a.member]) stats[a.member] = { total: 0, yes: 0 };
      stats[a.member].total += 1;
      if (a.outcome === 'Yes') stats[a.member].yes += 1;
    });
    return Object.entries(stats).map(([name, s]) => ({ name, total: s.total, yes: s.yes, ratio: s.total ? Math.round((s.yes / s.total) * 100) : 0 })).sort((a, b) => b.yes - a.yes || b.total - a.total || a.name.localeCompare(b.name));
  }, [dashboardAppointments]);

  async function testConnection() {
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.from('teammates').select('id').limit(1);
      if (error) throw error;
      setMessage({ type: 'ok', text: `Supabase connected. Test returned ${(data || []).length} row(s).` });
    } catch (error: any) {
      setMessage({ type: 'err', text: error.message || 'Supabase connection failed.' });
    } finally {
      setLoading(false);
    }
  }

  async function addMember() {
    if (!newMember.name.trim()) {
      setMessage({ type: 'err', text: 'Please enter a member name.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.from('teammates').insert({ name: newMember.name.trim(), rep_id: newMember.rep_id.trim() || null, phone: newMember.phone.trim() || null, email: newMember.email.trim() || null, is_admin: false, active: true });
      if (error) throw error;
      setNewMember({ name: '', rep_id: '', phone: '', email: '' });
      setMessage({ type: 'ok', text: 'Member added successfully.' });
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'err', text: error.message || 'Unable to add member.' });
    } finally {
      setLoading(false);
    }
  }

  async function saveAppointment() {
    const teammate = teammates.find(t => t.id === form.teammate_id);
    const missing = [];
    if (!form.teammate_id) missing.push('Team member');
    if (!form.date) missing.push('Date');
    if (!form.client_name.trim()) missing.push('Prospect / Client Name');
    if (!form.appointment_type) missing.push('Appointment Type');
    if (form.appointment_type === 'Other' && !form.appointment_type_other.trim()) missing.push('Other Appointment Type');
    if (!form.source) missing.push('Source');
    if (form.source === 'Other' && !form.source_other.trim()) missing.push('Other Source');
    if (!form.outcome) missing.push('Outcome');
    if ((form.outcome === 'Condition' || form.outcome === 'Objection') && !form.detail.trim()) missing.push('Outcome Details');
    if (missing.length) {
      setMessage({ type: 'err', text: `Please complete: ${missing.join(', ')}` });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const appointmentType = form.appointment_type === 'Other' ? `Other: ${form.appointment_type_other.trim()}` : form.appointment_type;
      const source = form.source === 'Other' ? `Other: ${form.source_other.trim()}` : form.source;
      const { error } = await supabase.from('appointments').insert({ teammate_id: form.teammate_id, member: teammate?.name || form.member, client_name: form.client_name.trim(), appointment_date: form.date, appointment_time: form.time || null, appointment_type: appointmentType, source, outcome: form.outcome, detail: form.detail.trim() || null, lessons: form.lessons.trim() || null, week_key: getWeekKey(form.date), created_by: teammate?.name || form.member, updated_by: teammate?.name || form.member });
      if (error) throw error;
      setForm({ teammate_id: '', member: '', date: today(), time: currentTime(), client_name: '', appointment_type: '', appointment_type_other: '', source: '', source_other: '', outcome: '', detail: '', lessons: '' });
      setMessage({ type: 'ok', text: 'Appointment saved successfully.' });
      await loadData();
      setTab('dashboard');
    } catch (error: any) {
      setMessage({ type: 'err', text: error.message || 'Unable to save appointment.' });
    } finally {
      setLoading(false);
    }
  }

  function memberNameById(id: string) {
    return teammates.find(t => t.id === id)?.name || '';
  }

  return (
    <main className="app">
      <div className="header">
        <div>
          <h1>AppLog</h1>
          <p className="muted">Cloud-based appointment tracker for your team.</p>
        </div>
        <button className="btn btn-secondary" onClick={testConnection} disabled={loading}>Test Supabase Connection</button>
      </div>

      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      <div className="tabs">
        {['dashboard', 'log appointment', 'appointments', 'settings'].map(t => <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t.replace(/\b\w/g, c => c.toUpperCase())}</button>)}
      </div>

      {tab === 'dashboard' && (
        <section>
          <div className="filters card">
            <div className="grid-2">
              <div>
                <label>Week</label>
                <select value={filterWeek} onChange={e => setFilterWeek(e.target.value)}>
                  <option value="">All weeks</option>
                  {weeks.map(w => <option key={w} value={w}>{weekLabel(w)}</option>)}
                </select>
              </div>
              <div>
                <label>Team Member</label>
                <select value={filterMember} onChange={e => setFilterMember(e.target.value)}>
                  <option value="">All teammates</option>
                  {teammates.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="stats">
            <div className="stat"><strong>{dashboardAppointments.length}</strong><span>Total Appointments</span></div>
            <div className="stat"><strong>{yesCount}</strong><span>YES Outcomes</span></div>
            <div className="stat"><strong>{yesRatio}%</strong><span>YES Ratio</span></div>
            <div className="stat"><strong>{leaderboard.length}</strong><span>Active Teammates</span></div>
          </div>
          <div className="card">
            <h2>Leaderboard</h2>
            <p className="muted">Option A: every appointment marked “Yes” counts as one YES.</p>
            {leaderboard.length ? leaderboard.map((person, index) => (
              <div className="row" key={person.name}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="leaderboard-rank">{index + 1}</div>
                  <div><strong>{person.name}</strong><br /><span className="muted">{person.total} appointments • {person.yes} YES • {person.ratio}% YES ratio</span></div>
                </div>
                <div style={{ minWidth: 180 }}><div className="bar"><div className="bar-fill" style={{ width: `${Math.max(5, person.ratio)}%` }} /></div></div>
              </div>
            )) : <div className="empty">No appointment data yet.</div>}
          </div>
        </section>
      )}

      {tab === 'log appointment' && (
        <section className="card">
          <div className="grid-2">
            <div><label>Team Member</label><select value={form.teammate_id} onChange={e => setForm(f => ({ ...f, teammate_id: e.target.value, member: memberNameById(e.target.value) }))}><option value="">Select team member...</option>{teammates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div><label>Date</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div><label>Time</label><input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} /></div>
            <div><label>Prospect / Client Name</label><input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Example: Jane Smith" /></div>
            <div><label>Appointment Type</label><select value={form.appointment_type} onChange={e => setForm(f => ({ ...f, appointment_type: e.target.value }))}><option value="">Select one...</option>{APPOINTMENT_TYPES.map(x => <option key={x}>{x}</option>)}</select></div>
            {form.appointment_type === 'Other' && <div><label>Other Appointment Type</label><input value={form.appointment_type_other} onChange={e => setForm(f => ({ ...f, appointment_type_other: e.target.value }))} /></div>}
            <div><label>Source</label><select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}><option value="">Select one...</option>{SOURCES.map(x => <option key={x}>{x}</option>)}</select></div>
            {form.source === 'Other' && <div><label>Other Source</label><input value={form.source_other} onChange={e => setForm(f => ({ ...f, source_other: e.target.value }))} /></div>}
            <div><label>Outcome</label><select value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))}><option value="">Select one...</option>{OUTCOMES.map(x => <option key={x}>{x}</option>)}</select></div>
            {(form.outcome === 'Condition' || form.outcome === 'Objection') && <div><label>Outcome Details</label><input value={form.detail} onChange={e => setForm(f => ({ ...f, detail: e.target.value }))} placeholder="Example: Client is uninsurable or has no income" /></div>}
          </div>
          <label>Lessons Learned and Changes Made</label><textarea value={form.lessons} onChange={e => setForm(f => ({ ...f, lessons: e.target.value }))} />
          <button className="btn btn-primary full" onClick={saveAppointment} disabled={loading}>Save Appointment</button>
        </section>
      )}

      {tab === 'appointments' && (
        <section>
          {appointments.length ? appointments.map(a => <div className="log-item" key={a.id}><div className="log-top"><div><div className="log-title">{a.client_name}</div><div className="badges"><span className="badge">{a.member}</span><span className="badge">{formatDate(a.appointment_date)} {a.appointment_time ? `at ${formatTime(a.appointment_time)}` : ''}</span><span className="badge">{a.appointment_type}</span><span className="badge">{a.source}</span><span className={`badge ${a.outcome === 'Yes' ? 'success' : ''}`}>{a.outcome}</span></div></div></div>{a.lessons && <p className="notes"><strong>Lessons:</strong> {a.lessons}</p>}</div>) : <div className="empty">No appointments yet.</div>}
        </section>
      )}

      {tab === 'settings' && (
        <section>
          <div className="card">
            <h2>Add Teammate</h2>
            <div className="grid-2">
              <div><label>Name</label><input value={newMember.name} onChange={e => setNewMember(m => ({ ...m, name: e.target.value }))} /></div>
              <div><label>Rep ID</label><input value={newMember.rep_id} onChange={e => setNewMember(m => ({ ...m, rep_id: e.target.value }))} /></div>
              <div><label>Phone</label><input value={newMember.phone} onChange={e => setNewMember(m => ({ ...m, phone: e.target.value }))} /></div>
              <div><label>Email</label><input value={newMember.email} onChange={e => setNewMember(m => ({ ...m, email: e.target.value }))} /></div>
            </div>
            <button className="btn btn-primary full" onClick={addMember} disabled={loading}>Add Member</button>
          </div>
          <div className="card">
            <h2>Current Teammates</h2>
            {teammates.length ? teammates.map(t => <div className="row" key={t.id}><div><strong>{t.name}</strong><br /><span className="muted">Rep ID: {t.rep_id || '—'} • {t.phone || 'No phone'} • {t.email || 'No email'}</span></div></div>) : <div className="empty">No teammates yet.</div>}
          </div>
        </section>
      )}
    </main>
  );
}
