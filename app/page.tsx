'use client';

import { useEffect, useMemo, useState } from 'react';
import { hasSupabaseEnv, supabase } from '../lib/supabase';

type Teammate = {
  id?: string;
  name: string;
  rep_id?: string | null;
  phone?: string | null;
  email?: string | null;
  is_admin?: boolean;
  active?: boolean;
};

type AppSettings = {
  id?: number;
  admin_passcode: string;
  manager_email?: string | null;
  report_day?: string;
  report_time?: string;
  report_frequency?: string;
  send_manager_report?: boolean;
  send_individual_reports?: boolean;
  missed_activity_days?: number;
};

type Appointment = {
  id?: string;
  teammate_id?: string | null;
  member: string;
  client_name: string;
  appointment_date: string;
  appointment_time?: string | null;
  appointment_type: string;
  source: string;
  outcome: string;
  detail?: string | null;
  lessons?: string | null;
  week_key: string;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

type CurrentUser = {
  name: string;
  role: 'admin' | 'teammate';
};

const YES_CATEGORIES = ['Recruit', 'Life Insurance', 'Investments', 'Client Solutions', 'Carryback'];
const APPOINTMENT_TYPES = ['Initial Meeting', 'Review Meeting', 'Carryback', 'Follow-Up', 'Orientation', 'Other'];
const SOURCES = ['Field Training', 'Introduction', 'Other'];
const DEFAULT_SETTINGS: AppSettings = {
  admin_passcode: 'admin123',
  manager_email: '',
  report_day: 'Friday',
  report_time: '08:00',
  report_frequency: 'Weekly',
  send_manager_report: true,
  send_individual_reports: true,
  missed_activity_days: 7
};

function getWeekKey(dateString: string) {
  const date = new Date(dateString + 'T00:00:00');
  const day = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().slice(0, 10);
}

function weekLabel(weekKey: string) {
  const start = new Date(weekKey + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const format = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return format(start) + ' - ' + format(end);
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimeString() {
  return new Date().toTimeString().slice(0, 5);
}

function formatTime(time?: string | null) {
  if (!time) return '';
  const [hour, minute] = time.split(':').map(Number);
  return String(hour % 12 || 12) + ':' + String(minute || 0).padStart(2, '0') + ' ' + (hour >= 12 ? 'PM' : 'AM');
}

function getYesRatio(items: Appointment[]) {
  if (!items.length) return '0%';
  const yes = items.filter((item) => item.outcome === 'Yes').length;
  return Math.round((yes / items.length) * 100) + '%';
}

function getYesCategoryCounts(items: Appointment[]) {
  const counts: Record<string, number> = {};
  YES_CATEGORIES.forEach((category) => (counts[category] = 0));
  items
    .filter((item) => item.outcome === 'Yes')
    .forEach((item) => {
      String(item.detail || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .forEach((entry) => {
          counts[entry] = (counts[entry] || 0) + 1;
        });
    });
  return counts;
}

function formatYesCategoryCounts(items: Appointment[]) {
  const counts = getYesCategoryCounts(items);
  return YES_CATEGORIES.map((category) => `${category}: ${counts[category] || 0}`).join('\n');
}

function countBy(items: Appointment[], getKey: (item: Appointment) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = getKey(item) || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function BarChart({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map((entry) => entry[1]));
  if (!entries.length) return <div className="empty">No data yet.</div>;
  return (
    <>
      {entries.map(([label, value]) => (
        <div className="chart-bar" key={label}>
          <div className="chart-bar-label"><span>{label}</span><strong>{value}</strong></div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round((value / max) * 100)}%` }} /></div>
        </div>
      ))}
    </>
  );
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [role, setRole] = useState<'admin' | 'teammate'>('admin');
  const [loginAdmin, setLoginAdmin] = useState('');
  const [loginTeammate, setLoginTeammate] = useState('');
  const [loginPasscode, setLoginPasscode] = useState('');
  const [activeTab, setActiveTab] = useState('log');
  const [status, setStatus] = useState<{ type: 'good' | 'bad' | ''; message: string }>({ type: '', message: '' });
  const [loading, setLoading] = useState(false);

  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const [member, setMember] = useState('');
  const [date, setDate] = useState(todayString());
  const [time, setTime] = useState(nowTimeString());
  const [clientName, setClientName] = useState('');
  const [appointmentType, setAppointmentType] = useState('');
  const [appointmentOther, setAppointmentOther] = useState('');
  const [source, setSource] = useState('');
  const [sourceOther, setSourceOther] = useState('');
  const [outcome, setOutcome] = useState('');
  const [conditionDetail, setConditionDetail] = useState('');
  const [objectionDetail, setObjectionDetail] = useState('');
  const [yesCategories, setYesCategories] = useState<string[]>([]);
  const [lessons, setLessons] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [filterMember, setFilterMember] = useState('');
  const [filterWeek, setFilterWeek] = useState('');
  const [searchLogs, setSearchLogs] = useState('');
  const [reportWeek, setReportWeek] = useState(getWeekKey(todayString()));

  const [newMember, setNewMember] = useState('');
  const [newRepId, setNewRepId] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [promoteName, setPromoteName] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [preview, setPreview] = useState('');

  const admins = useMemo(() => teammates.filter((teammate) => teammate.is_admin && teammate.active !== false), [teammates]);
  const visibleAppointments = useMemo(() => currentUser?.role === 'admin' ? appointments : appointments.filter((item) => item.member === currentUser?.name), [appointments, currentUser]);
  const weeks = useMemo(() => Array.from(new Set(visibleAppointments.map((item) => item.week_key))).filter(Boolean).sort().reverse(), [visibleAppointments]);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (currentUser) setMember(currentUser.name);
  }, [currentUser]);

  async function loadAll() {
    setLoading(true);
    setStatus({ type: '', message: 'Loading data...' });
    if (!hasSupabaseEnv) {
      setStatus({ type: 'bad', message: 'Missing Supabase environment variables in Vercel.' });
      setLoading(false);
      return;
    }
    try {
      const [teamResult, settingsResult, appointmentsResult] = await Promise.all([
        supabase.from('teammates').select('*').order('name'),
        supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('appointments').select('*').order('appointment_date', { ascending: false })
      ]);

      if (teamResult.error) throw teamResult.error;
      if (settingsResult.error) throw settingsResult.error;
      if (appointmentsResult.error) throw appointmentsResult.error;

      setTeammates(teamResult.data || []);
      setSettings({ ...DEFAULT_SETTINGS, ...(settingsResult.data || {}) });
      setAppointments(appointmentsResult.data || []);
      setStatus({ type: 'good', message: 'Data loaded from Supabase.' });
    } catch (error: any) {
      setStatus({ type: 'bad', message: `Load error: ${error.message || String(error)}` });
    } finally {
      setLoading(false);
    }
  }

  async function testSupabaseConnection() {
    setStatus({ type: '', message: 'Testing Supabase connection...' });
    if (!hasSupabaseEnv) {
      setStatus({ type: 'bad', message: 'Missing Supabase environment variables in Vercel.' });
      return;
    }
    const { data, error } = await supabase.from('teammates').select('id,name').limit(1);
    if (error) setStatus({ type: 'bad', message: `Supabase test failed: ${error.message}` });
    else setStatus({ type: 'good', message: `Supabase connected. Test returned ${data?.length || 0} row(s).` });
  }

  function requireAdmin() {
    if (!currentUser || currentUser.role !== 'admin') {
      setStatus({ type: 'bad', message: 'Admin access required.' });
      return false;
    }
    return true;
  }

  async function login() {
    if (role === 'admin') {
      if (!loginAdmin) return setStatus({ type: 'bad', message: 'Please select an admin.' });
      if (loginPasscode !== settings.admin_passcode) return setStatus({ type: 'bad', message: 'Incorrect admin passcode.' });
      setCurrentUser({ name: loginAdmin, role: 'admin' });
      setMember(loginAdmin);
      setStatus({ type: 'good', message: `Logged in as admin: ${loginAdmin}` });
    } else {
      if (!loginTeammate) return setStatus({ type: 'bad', message: 'Please select a teammate.' });
      setCurrentUser({ name: loginTeammate, role: 'teammate' });
      setMember(loginTeammate);
      setStatus({ type: 'good', message: `Logged in as teammate: ${loginTeammate}` });
    }
  }

  function logout() {
    setCurrentUser(null);
    setActiveTab('log');
    setStatus({ type: '', message: 'Logged out.' });
  }

  async function addMember() {
    if (!requireAdmin()) return;
    const name = newMember.trim();
    if (!name) return setStatus({ type: 'bad', message: 'Please enter a teammate name.' });
    setStatus({ type: '', message: 'Adding member...' });
    const { error } = await supabase.from('teammates').insert({ name, rep_id: newRepId.trim(), phone: newPhone.trim(), email: newEmail.trim(), is_admin: false, active: true });
    if (error) return setStatus({ type: 'bad', message: `Add member error: ${error.message}` });
    setNewMember('');
    setNewRepId('');
    setNewPhone('');
    setNewEmail('');
    await loadAll();
    setStatus({ type: 'good', message: 'Member added successfully.' });
  }

  async function removeMember(id?: string) {
    if (!requireAdmin() || !id) return;
    const { error } = await supabase.from('teammates').update({ active: false }).eq('id', id);
    if (error) return setStatus({ type: 'bad', message: `Remove member error: ${error.message}` });
    await loadAll();
    setStatus({ type: 'good', message: 'Member removed.' });
  }

  async function promoteAdmin() {
    if (!requireAdmin() || !promoteName) return setStatus({ type: 'bad', message: 'Select a teammate to promote.' });
    const { error } = await supabase.from('teammates').update({ is_admin: true }).eq('name', promoteName);
    if (error) return setStatus({ type: 'bad', message: `Promote admin error: ${error.message}` });
    setPromoteName('');
    await loadAll();
    setStatus({ type: 'good', message: 'Co-admin promoted.' });
  }

  async function removeAdmin(id?: string) {
    if (!requireAdmin() || !id) return;
    if (admins.length <= 1) return setStatus({ type: 'bad', message: 'You must keep at least one admin.' });
    const { error } = await supabase.from('teammates').update({ is_admin: false }).eq('id', id);
    if (error) return setStatus({ type: 'bad', message: `Remove admin error: ${error.message}` });
    await loadAll();
    setStatus({ type: 'good', message: 'Admin access removed.' });
  }

  async function saveSettings(partial: Partial<AppSettings>) {
    if (!requireAdmin()) return;
    const next = { ...settings, ...partial, id: 1 };
    const { error } = await supabase.from('app_settings').upsert(next);
    if (error) return setStatus({ type: 'bad', message: `Settings error: ${error.message}` });
    setSettings(next);
    await loadAll();
    setStatus({ type: 'good', message: 'Settings saved.' });
  }

  function resetAppointmentForm() {
    setEditingId(null);
    setClientName('');
    setAppointmentType('');
    setAppointmentOther('');
    setSource('');
    setSourceOther('');
    setOutcome('');
    setConditionDetail('');
    setObjectionDetail('');
    setYesCategories([]);
    setLessons('');
    setDate(todayString());
    setTime(nowTimeString());
    if (currentUser) setMember(currentUser.name);
  }

  async function saveAppointment() {
    if (!currentUser) return setStatus({ type: 'bad', message: 'Please log in first.' });
    const finalType = appointmentType === 'Other' ? `Other: ${appointmentOther.trim()}` : appointmentType;
    const finalSource = source === 'Other' ? `Other: ${sourceOther.trim()}` : source;
    let detail = '';
    if (outcome === 'Condition') detail = conditionDetail.trim();
    if (outcome === 'Objection') detail = objectionDetail.trim();
    if (outcome === 'Yes') detail = yesCategories.join(', ');

    const missing: string[] = [];
    if (!member) missing.push('Team Member Name');
    if (!date) missing.push('Date');
    if (!clientName.trim()) missing.push('Prospect / Client Name');
    if (!appointmentType) missing.push('Appointment Type');
    if (appointmentType === 'Other' && !appointmentOther.trim()) missing.push('Other Appointment Type');
    if (!source) missing.push('Source');
    if (source === 'Other' && !sourceOther.trim()) missing.push('Other Source');
    if (!outcome) missing.push('Outcome');
    if ((outcome === 'Condition' || outcome === 'Objection') && !detail) missing.push('Outcome Details');
    if (missing.length) return setStatus({ type: 'bad', message: `Missing: ${missing.join(', ')}` });

    const teammate = teammates.find((item) => item.name === member);
    const entry: Partial<Appointment> = {
      teammate_id: teammate?.id || null,
      member,
      client_name: clientName.trim(),
      appointment_date: date,
      appointment_time: time,
      appointment_type: finalType,
      source: finalSource,
      outcome,
      detail,
      lessons: lessons.trim(),
      week_key: getWeekKey(date),
      updated_by: currentUser.name
    };

    setStatus({ type: '', message: editingId ? 'Updating appointment...' : 'Saving appointment...' });
    const result = editingId
      ? await supabase.from('appointments').update({ ...entry, updated_at: new Date().toISOString() }).eq('id', editingId)
      : await supabase.from('appointments').insert({ ...entry, created_by: currentUser.name });

    if (result.error) return setStatus({ type: 'bad', message: `Appointment error: ${result.error.message}` });
    resetAppointmentForm();
    await loadAll();
    setStatus({ type: 'good', message: editingId ? 'Appointment updated.' : 'Appointment saved.' });
  }

  function editAppointment(item: Appointment) {
    setEditingId(item.id || null);
    setMember(item.member);
    setDate(item.appointment_date);
    setTime(item.appointment_time || '');
    setClientName(item.client_name);
    if (item.appointment_type.startsWith('Other: ')) {
      setAppointmentType('Other');
      setAppointmentOther(item.appointment_type.replace('Other: ', ''));
    } else setAppointmentType(item.appointment_type);
    if (item.source.startsWith('Other: ')) {
      setSource('Other');
      setSourceOther(item.source.replace('Other: ', ''));
    } else setSource(item.source);
    setOutcome(item.outcome);
    setConditionDetail(item.outcome === 'Condition' ? item.detail || '' : '');
    setObjectionDetail(item.outcome === 'Objection' ? item.detail || '' : '');
    setYesCategories(item.outcome === 'Yes' ? String(item.detail || '').split(',').map((x) => x.trim()).filter(Boolean) : []);
    setLessons(item.lessons || '');
    setActiveTab('log');
  }

  async function deleteAppointment(id?: string) {
    if (!id) return;
    const { error } = await supabase.from('appointments').delete().eq('id', id);
    if (error) return setStatus({ type: 'bad', message: `Delete error: ${error.message}` });
    await loadAll();
    setStatus({ type: 'good', message: 'Appointment deleted.' });
  }

  const filteredAppointments = useMemo(() => {
    return visibleAppointments
      .filter((item) => !filterMember || item.member === filterMember)
      .filter((item) => !filterWeek || item.week_key === filterWeek)
      .filter((item) => {
        const search = searchLogs.trim().toLowerCase();
        if (!search) return true;
        return [item.client_name, item.lessons, item.detail, item.source, item.appointment_type].some((value) => String(value || '').toLowerCase().includes(search));
      })
      .sort((a, b) => String(b.appointment_date + b.appointment_time).localeCompare(String(a.appointment_date + a.appointment_time)));
  }, [visibleAppointments, filterMember, filterWeek, searchLogs]);

  function buildReportForPerson(person: string, weekKey: string) {
    const teammate = teammates.find((item) => item.name === person);
    const rows = appointments.filter((item) => item.member === person && item.week_key === weekKey);
    const lines = rows.map((item) => {
      const parts = [
        `• ${item.client_name} — ${item.appointment_date}${item.appointment_time ? ' at ' + formatTime(item.appointment_time) : ''}`,
        `  Type: ${item.appointment_type}`,
        `  Source: ${item.source}`,
        `  Outcome: ${item.outcome}`
      ];
      if (item.detail) parts.push(`  Details: ${item.detail}`);
      if (item.lessons) parts.push(`  Lessons learned: ${item.lessons}`);
      return parts.join('\n');
    }).join('\n\n');
    return [
      `To: ${teammate?.email || '[teammate email]'}`,
      `Subject: Your Weekly Appointment Report — ${weekLabel(weekKey)}`,
      '',
      `Hi ${person},`,
      '',
      `Here is your appointment activity for the week of ${weekLabel(weekKey)}.`,
      '',
      'SUMMARY',
      `Total appointments: ${rows.length}`,
      `YES outcomes: ${rows.filter((item) => item.outcome === 'Yes').length}`,
      `YES ratio: ${getYesRatio(rows)}`,
      '',
      'YES CATEGORY BREAKDOWN',
      formatYesCategoryCounts(rows),
      '',
      'APPOINTMENT DETAILS',
      lines || 'No appointments logged.'
    ].join('\n');
  }

  function buildManagerReport() {
    const weekKey = reportWeek || getWeekKey(todayString());
    const rows = appointments.filter((item) => item.week_key === weekKey);
    const people = Array.from(new Set(rows.map((item) => item.member))).sort();
    const sections = people.map((person) => {
      const personRows = rows.filter((item) => item.member === person);
      const teammate = teammates.find((item) => item.name === person);
      return [
        person,
        `Rep ID: ${teammate?.rep_id || '—'} | Phone: ${teammate?.phone || '—'} | Email: ${teammate?.email || '—'}`,
        `Total appointments: ${personRows.length}`,
        `YES outcomes: ${personRows.filter((item) => item.outcome === 'Yes').length}`,
        `YES ratio: ${getYesRatio(personRows)}`,
        '',
        'YES category breakdown:',
        formatYesCategoryCounts(personRows)
      ].join('\n');
    }).join('\n\n-------------------------\n\n');

    return [
      `To: ${settings.manager_email || '[manager email]'}`,
      `Subject: Team Weekly Appointment Report — ${weekLabel(weekKey)}`,
      '',
      'TEAM SUMMARY',
      `Total appointments: ${rows.length}`,
      `YES outcomes: ${rows.filter((item) => item.outcome === 'Yes').length}`,
      `YES ratio: ${getYesRatio(rows)}`,
      '',
      'TEAM YES CATEGORY BREAKDOWN',
      formatYesCategoryCounts(rows),
      '',
      '-------------------------',
      sections || 'No appointments logged.'
    ].join('\n');
  }

  async function showPreview(text: string, message: string) {
    setPreview(text);
    const copied = await copyToClipboard(text);
    setStatus({ type: copied ? 'good' : '', message: copied ? message : 'Preview created. Copy manually if needed.' });
  }

  function exportCsv() {
    const headers = ['Member', 'Date', 'Time', 'Prospect / Client', 'Appointment Type', 'Source', 'Outcome', 'Details', 'Lessons'];
    const rows = visibleAppointments.map((item) => [item.member, item.appointment_date, item.appointment_time, item.client_name, item.appointment_type, item.source, item.outcome, item.detail, item.lessons]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile('appointment-log.csv', csv, 'text/csv');
  }

  const dashboardRows = visibleAppointments;
  const reportRows = visibleAppointments.filter((item) => item.week_key === reportWeek);
  const reportPeople = Array.from(new Set(reportRows.map((item) => item.member))).sort();
  const inactiveTeammates = teammates.filter((teammate) => teammate.active !== false && !appointments.some((item) => item.member === teammate.name));

  if (!currentUser) {
    return (
      <main className="login-card card">
        <h1 style={{ fontSize: 28, marginBottom: 6 }}>AppLog</h1>
        <p className="muted" style={{ marginBottom: 16 }}>Simple login for admins and teammates.</p>
        <div className={`status ${status.type}`}>{status.message || 'Ready.'}</div>
        <label>Role</label>
        <select value={role} onChange={(event) => setRole(event.target.value as 'admin' | 'teammate')}>
          <option value="admin">Admin</option>
          <option value="teammate">Teammate</option>
        </select>
        {role === 'admin' ? (
          <>
            <label>Admin Name</label>
            <select value={loginAdmin} onChange={(event) => setLoginAdmin(event.target.value)}>
              <option value="">{admins.length ? 'Select admin...' : 'No admins found. Run SQL setup.'}</option>
              {admins.map((admin) => <option key={admin.id || admin.name} value={admin.name}>{admin.name}</option>)}
            </select>
            <label>Admin Passcode</label>
            <input type="password" value={loginPasscode} onChange={(event) => setLoginPasscode(event.target.value)} placeholder="Enter admin passcode" />
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Default passcode: admin123</p>
          </>
        ) : (
          <>
            <label>Teammate Name</label>
            <select value={loginTeammate} onChange={(event) => setLoginTeammate(event.target.value)}>
              <option value="">{teammates.length ? 'Select teammate...' : 'No teammates added yet.'}</option>
              {teammates.filter((teammate) => teammate.active !== false).map((teammate) => <option key={teammate.id || teammate.name} value={teammate.name}>{teammate.name}</option>)}
            </select>
          </>
        )}
        <button className="btn btn-primary btn-full" type="button" onClick={login}>Log In</button>
        <button className="btn btn-secondary btn-full" type="button" onClick={testSupabaseConnection}>Test Supabase Connection</button>
        <button className="btn btn-secondary btn-full" type="button" onClick={loadAll}>Reload Data</button>
      </main>
    );
  }

  return (
    <main className="app">
      <div className="header">
        <div>
          <h1>AppLog</h1>
          <p>Track appointments, outcomes, weekly reports, and team activity.</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="badge badge-warning">{currentUser.name} • {currentUser.role === 'admin' ? 'Admin' : 'Teammate'}</div>
          <button className="btn btn-secondary" type="button" style={{ marginTop: 8 }} onClick={logout}>Log Out</button>
        </div>
      </div>

      <div className={`status ${status.type}`}>{status.message || 'Ready.'}</div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'log' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('log')}>Log Appointment</button>
        <button className={`tab ${activeTab === 'view' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('view')}>View Logs</button>
        {currentUser.role === 'admin' && <button className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('dashboard')}>Dashboard</button>}
        {currentUser.role === 'admin' && <button className={`tab ${activeTab === 'reports' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('reports')}>Reports</button>}
        {currentUser.role === 'admin' && <button className={`tab ${activeTab === 'settings' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('settings')}>Settings</button>}
      </div>

      <section className={`section ${activeTab === 'log' ? 'active' : ''} card`}>
        <label>Team Member Name</label>
        <select value={member} onChange={(event) => setMember(event.target.value)} disabled={currentUser.role !== 'admin'}>
          <option value="">Select team member...</option>
          {teammates.filter((teammate) => teammate.active !== false).map((teammate) => <option key={teammate.id || teammate.name} value={teammate.name}>{teammate.name}</option>)}
        </select>
        <div className="grid-2">
          <div><label>Date</label><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
          <div><label>Time</label><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></div>
        </div>
        <label>Prospect / Client Name</label>
        <input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Example: Jane Smith" />
        <label>Appointment Type</label>
        <select value={appointmentType} onChange={(event) => setAppointmentType(event.target.value)}>
          <option value="">Select one...</option>
          {APPOINTMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        {appointmentType === 'Other' && <div className="conditional show"><label>Other Appointment Type</label><input value={appointmentOther} onChange={(event) => setAppointmentOther(event.target.value)} /></div>}
        <label>Source</label>
        <select value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="">Select one...</option>
          {SOURCES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        {source === 'Other' && <div className="conditional show"><label>Other Source</label><input value={sourceOther} onChange={(event) => setSourceOther(event.target.value)} /></div>}
        <label>Outcome</label>
        <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
          <option value="">Select one...</option>
          <option value="No Ask">I didn’t ask for the close</option>
          <option value="Condition">There was a condition that prevents the close</option>
          <option value="Objection">I couldn’t overcome an objection</option>
          <option value="Yes">I got a YES</option>
        </select>
        {outcome === 'Condition' && <div className="conditional show"><label>Details</label><input value={conditionDetail} onChange={(event) => setConditionDetail(event.target.value)} placeholder="Example: Client is uninsurable, has no income, or does not qualify right now" /></div>}
        {outcome === 'Objection' && <div className="conditional show"><label>Details</label><input value={objectionDetail} onChange={(event) => setObjectionDetail(event.target.value)} placeholder="Example: Wanted to think about it" /></div>}
        {outcome === 'Yes' && (
          <div className="conditional show">
            <strong>What was the YES?</strong>
            <div className="checks">
              {YES_CATEGORIES.map((category) => (
                <label className="check" key={category}><input type="checkbox" checked={yesCategories.includes(category)} onChange={(event) => setYesCategories((prev) => event.target.checked ? [...prev, category] : prev.filter((item) => item !== category))} /> {category}</label>
              ))}
            </div>
          </div>
        )}
        <label>Lessons Learned and Changes Made</label>
        <textarea value={lessons} onChange={(event) => setLessons(event.target.value)} placeholder="What did you learn? What would you do differently next time?" />
        <div className="btn-row">
          <button className="btn btn-primary" type="button" onClick={saveAppointment}>{editingId ? 'Update Appointment' : 'Save Appointment'}</button>
          {editingId && <button className="btn btn-secondary" type="button" onClick={resetAppointmentForm}>Cancel Edit</button>}
        </div>
      </section>

      <section className={`section ${activeTab === 'view' ? 'active' : ''}`}>
        <div className="filters">
          <select value={filterMember} onChange={(event) => setFilterMember(event.target.value)} disabled={currentUser.role !== 'admin'}>
            <option value="">All Team Members</option>
            {teammates.filter((teammate) => teammate.active !== false).map((teammate) => <option key={teammate.id || teammate.name} value={teammate.name}>{teammate.name}</option>)}
          </select>
          <select value={filterWeek} onChange={(event) => setFilterWeek(event.target.value)}>
            <option value="">All Weeks</option>
            {weeks.map((week) => <option key={week} value={week}>{weekLabel(week)}</option>)}
          </select>
          <input value={searchLogs} onChange={(event) => setSearchLogs(event.target.value)} placeholder="Search client or notes" />
        </div>
        {filteredAppointments.length ? filteredAppointments.map((item) => (
          <div className="log-item" key={item.id}>
            <div className="log-top">
              <div>
                <div className="log-title">{item.client_name}</div>
                <div className="badges">
                  <span className="badge">{item.member}</span><span className="badge">{item.appointment_date}{item.appointment_time ? ' at ' + formatTime(item.appointment_time) : ''}</span><span className="badge">{item.appointment_type}</span><span className="badge">{item.source}</span><span className={`badge ${item.outcome === 'Yes' ? 'badge-success' : ''}`}>{item.outcome}{item.detail ? ' - ' + item.detail : ''}</span>
                </div>
              </div>
              <div className="btn-row" style={{ marginTop: 0 }}>
                <button className="btn btn-secondary" type="button" onClick={() => editAppointment(item)}>Edit</button>
                <button className="btn-danger" type="button" onClick={() => deleteAppointment(item.id)}>Delete</button>
              </div>
            </div>
            {item.lessons && <p className="notes"><strong>Lessons learned:</strong> {item.lessons}</p>}
          </div>
        )) : <div className="empty">No appointments found.</div>}
      </section>

      {currentUser.role === 'admin' && <section className={`section ${activeTab === 'dashboard' ? 'active' : ''}`}>
        <div className="stats"><div className="stat"><strong>{dashboardRows.length}</strong><span>Total Appointments</span></div><div className="stat"><strong>{new Set(dashboardRows.map((item) => item.member)).size}</strong><span>Team Members</span></div><div className="stat"><strong>{dashboardRows.filter((item) => item.outcome === 'Yes').length}</strong><span>YES Outcomes</span></div><div className="stat"><strong>{getYesRatio(dashboardRows)}</strong><span>YES Ratio</span></div></div>
        <div className="chart-row"><div className="card"><h3>Appointments by Teammate</h3><BarChart counts={countBy(dashboardRows, (item) => item.member)} /></div><div className="card"><h3>Outcomes</h3><BarChart counts={countBy(dashboardRows, (item) => item.outcome)} /></div><div className="card"><h3>Sources</h3><BarChart counts={countBy(dashboardRows, (item) => item.source)} /></div><div className="card"><h3>YES Breakdown</h3><BarChart counts={getYesCategoryCounts(dashboardRows)} /></div></div>
        <div className="card"><h3>Missed Activity Alerts</h3>{inactiveTeammates.length ? inactiveTeammates.map((teammate) => <div className="report-row" key={teammate.id || teammate.name}>{teammate.name} has no logged appointments yet.</div>) : <p className="muted">No missed activity alerts right now.</p>}</div>
      </section>}

      {currentUser.role === 'admin' && <section className={`section ${activeTab === 'reports' ? 'active' : ''}`}>
        <div className="filters"><select value={reportWeek} onChange={(event) => setReportWeek(event.target.value)}>{(weeks.length ? weeks : [getWeekKey(todayString())]).map((week) => <option key={week} value={week}>{weekLabel(week)}</option>)}</select><button className="btn btn-secondary" type="button" onClick={() => showPreview(buildManagerReport(), 'Manager report copied.')}>Copy Manager Report</button><button className="btn btn-secondary" type="button" onClick={() => showPreview(reportPeople.map((person) => buildReportForPerson(person, reportWeek)).join('\n\n=========================\n\n'), 'Individual reports copied.')}>Copy Individual Reports</button><button className="btn btn-secondary" type="button" onClick={exportCsv}>Export CSV</button><button className="btn btn-secondary" type="button" onClick={() => downloadFile('appointment-log.json', JSON.stringify({ teammates, appointments, settings }, null, 2), 'application/json')}>Export JSON</button></div>
        {reportPeople.length ? reportPeople.map((person) => {
          const rows = reportRows.filter((item) => item.member === person);
          const teammate = teammates.find((item) => item.name === person);
          return <div className="card" key={person}><h3>{person}</h3><p className="muted">Rep ID: {teammate?.rep_id || '—'} • {teammate?.email || 'No email'}</p><p className="muted">Total: {rows.length} • YES: {rows.filter((item) => item.outcome === 'Yes').length} • Ratio: {getYesRatio(rows)}</p><pre className="email-preview" style={{ margin: '10px 0', maxHeight: 'none' }}>{formatYesCategoryCounts(rows)}</pre>{rows.map((item) => <div className="report-row" key={item.id}><strong>{item.client_name}</strong><br />{item.appointment_date}{item.appointment_time ? ' at ' + formatTime(item.appointment_time) : ''} • {item.appointment_type} • {item.source}<br />Outcome: {item.outcome}{item.detail ? ' - ' + item.detail : ''}{item.lessons ? <><br />Lessons: {item.lessons}</> : null}</div>)}</div>;
        }) : <div className="empty">No appointments logged for this week.</div>}
        {preview && <pre className="email-preview">{preview}</pre>}
      </section>}

      {currentUser.role === 'admin' && <section className={`section ${activeTab === 'settings' ? 'active' : ''}`}>
        <div className="card"><h2>Diagnostics</h2><div className="btn-row"><button className="btn btn-secondary" type="button" onClick={testSupabaseConnection}>Test Supabase Connection</button><button className="btn btn-secondary" type="button" onClick={loadAll}>Reload Data</button></div></div>
        <div className="card"><h2>Team Members</h2><p className="muted">Add or remove teammates.</p>{teammates.filter((teammate) => teammate.active !== false).map((teammate) => <div className="member-row" key={teammate.id || teammate.name}><div><strong>{teammate.name}</strong><br /><span className="muted">Rep ID: {teammate.rep_id || '—'} • {teammate.phone || 'No phone'} • {teammate.email || 'No email'} {teammate.is_admin ? '• Admin' : ''}</span></div><button className="btn-danger" type="button" onClick={() => removeMember(teammate.id)}>Remove</button></div>)}<div className="grid-2"><div><label>Name</label><input value={newMember} onChange={(event) => setNewMember(event.target.value)} /></div><div><label>Rep ID</label><input value={newRepId} onChange={(event) => setNewRepId(event.target.value)} /></div><div><label>Phone Number</label><input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} /></div><div><label>Email</label><input value={newEmail} onChange={(event) => setNewEmail(event.target.value)} /></div></div><button className="btn btn-primary btn-full" type="button" onClick={addMember}>Add Member</button></div>
        <div className="card"><h2>Admin Management</h2>{admins.map((admin) => <div className="member-row" key={admin.id || admin.name}><div><strong>{admin.name}</strong><br /><span className="muted">{admin.email || 'No email'}</span></div><button className="btn-danger" type="button" onClick={() => removeAdmin(admin.id)}>Remove Admin</button></div>)}<label>Promote Teammate to Co-Admin</label><select value={promoteName} onChange={(event) => setPromoteName(event.target.value)}><option value="">Select teammate...</option>{teammates.filter((item) => item.active !== false && !item.is_admin).map((item) => <option key={item.id || item.name} value={item.name}>{item.name}</option>)}</select><button className="btn btn-primary btn-full" type="button" onClick={promoteAdmin}>Promote to Co-Admin</button></div>
        <div className="card"><h2>Admin Passcode</h2><label>New Admin Passcode</label><input type="password" value={newPasscode} onChange={(event) => setNewPasscode(event.target.value)} /><button className="btn btn-primary btn-full" type="button" onClick={() => { if (!newPasscode.trim()) return setStatus({ type: 'bad', message: 'Enter a new passcode.' }); saveSettings({ admin_passcode: newPasscode.trim() }); setNewPasscode(''); }}>Save Admin Passcode</button></div>
        <div className="card"><h2>Manager Email</h2><label>Manager Email</label><input value={settings.manager_email || ''} onChange={(event) => setSettings((prev) => ({ ...prev, manager_email: event.target.value }))} /><button className="btn btn-primary btn-full" type="button" onClick={() => saveSettings({ manager_email: settings.manager_email })}>Save Manager Email</button></div>
        <div className="card"><h2>Automated Email Schedule</h2><div className="grid-3"><div><label>Send Day</label><select value={settings.report_day || 'Friday'} onChange={(event) => setSettings((prev) => ({ ...prev, report_day: event.target.value }))}>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day) => <option key={day}>{day}</option>)}</select></div><div><label>Send Time</label><input type="time" value={settings.report_time || '08:00'} onChange={(event) => setSettings((prev) => ({ ...prev, report_time: event.target.value }))} /></div><div><label>Frequency</label><select value={settings.report_frequency || 'Weekly'} onChange={(event) => setSettings((prev) => ({ ...prev, report_frequency: event.target.value }))}>{['Weekly','Every 2 Weeks','Monthly'].map((item) => <option key={item}>{item}</option>)}</select></div></div><label className="check" style={{ marginTop: 14 }}><input type="checkbox" checked={!!settings.send_manager_report} onChange={(event) => setSettings((prev) => ({ ...prev, send_manager_report: event.target.checked }))} /> Send manager report</label><label className="check"><input type="checkbox" checked={!!settings.send_individual_reports} onChange={(event) => setSettings((prev) => ({ ...prev, send_individual_reports: event.target.checked }))} /> Send individual teammate reports</label><button className="btn btn-primary btn-full" type="button" onClick={() => saveSettings(settings)}>Save Email Schedule</button></div>
      </section>}
    </main>
  );
}
