import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServerSupabase } from '@/lib/server-supabase';

const YES_CATEGORIES = ['Recruit', 'Life Insurance', 'Investments', 'Client Solutions', 'Carryback'];

function weekKey(dateString: string) {
  const date = new Date(dateString + 'T00:00:00');
  const day = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().slice(0, 10);
}
function currentWeek() { return weekKey(new Date().toISOString().slice(0, 10)); }
function weekLabel(week: string) {
  const start = new Date(week + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const f = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${f(start)} - ${f(end)}`;
}
function yesRatio(items: any[]) { return items.length ? `${Math.round((items.filter(x => x.outcome === 'Yes').length / items.length) * 100)}%` : '0%'; }
function yesCounts(items: any[]) {
  const counts: Record<string, number> = {};
  YES_CATEGORIES.forEach(c => counts[c] = 0);
  items.filter(x => x.outcome === 'Yes').forEach(log => String(log.detail || '').split(',').map(x => x.trim()).filter(Boolean).forEach(x => counts[x] = (counts[x] || 0) + 1));
  return counts;
}
function yesSummary(items: any[]) { const c = yesCounts(items); return YES_CATEGORIES.map(cat => `${cat}: ${c[cat] || 0}`).join('\n'); }
function html(text: string) { return `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.5">${text.replace(/[&<>]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[s] as string))}</pre>`; }

export async function GET() {
  try {
    const supabase = createServerSupabase();
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.REPORT_FROM_EMAIL || 'onboarding@resend.dev';
    if (!resendKey) return NextResponse.json({ ok: false, error: 'Missing RESEND_API_KEY' }, { status: 500 });

    const resend = new Resend(resendKey);
    const week = currentWeek();
    const [{ data: settings }, { data: teammates }, { data: appointments }] = await Promise.all([
      supabase.from('app_settings').select('*').eq('id', 1).single(),
      supabase.from('teammates').select('*').eq('active', true),
      supabase.from('appointments').select('*').eq('week_key', week)
    ]);

    const logs = appointments || [];
    const mates = teammates || [];
    const managerEmail = settings?.manager_email;
    const emails: any[] = [];

    if (settings?.send_manager_report && managerEmail) {
      const people = Array.from(new Set(logs.map((a: any) => a.member))).sort();
      const sections = people.map((person: any) => {
        const personLogs = logs.filter((a: any) => a.member === person);
        const mate: any = mates.find((m: any) => m.name === person) || {};
        return [person, `Rep ID: ${mate.rep_id || '—'} | Phone: ${mate.phone || '—'} | Email: ${mate.email || '—'}`, `Total appointments: ${personLogs.length}`, `YES outcomes: ${personLogs.filter((a: any) => a.outcome === 'Yes').length}`, `YES ratio: ${yesRatio(personLogs)}`, '', 'YES category breakdown:', yesSummary(personLogs)].join('\n');
      }).join('\n\n-------------------------\n\n');
      const text = [`Team Appointment Summary`, `Week of ${weekLabel(week)}`, '', `Total appointments: ${logs.length}`, `YES outcomes: ${logs.filter((a: any) => a.outcome === 'Yes').length}`, `YES ratio: ${yesRatio(logs)}`, '', 'TEAM YES CATEGORY BREAKDOWN', yesSummary(logs), '', '-------------------------', '', sections || 'No appointments logged.'].join('\n');
      emails.push(resend.emails.send({ from, to: managerEmail, subject: `Team Weekly Appointment Report — ${weekLabel(week)}`, html: html(text) }));
    }

    if (settings?.send_individual_reports) {
      for (const mate of mates as any[]) {
        if (!mate.email) continue;
        const personLogs = logs.filter((a: any) => a.member === mate.name);
        const lines = personLogs.map((a: any) => [`• ${a.client_name} — ${a.appointment_date}${a.appointment_time ? ' at ' + a.appointment_time : ''}`, `  Type: ${a.appointment_type}`, `  Source: ${a.source}`, `  Outcome: ${a.outcome}`, a.detail ? `  Details: ${a.detail}` : '', a.lessons ? `  Lessons learned: ${a.lessons}` : ''].filter(Boolean).join('\n')).join('\n\n');
        const text = [`Hi ${mate.name},`, '', `Here is your appointment activity for ${weekLabel(week)}.`, '', 'SUMMARY', `Total appointments: ${personLogs.length}`, `YES outcomes: ${personLogs.filter((a: any) => a.outcome === 'Yes').length}`, `YES ratio: ${yesRatio(personLogs)}`, '', 'YES CATEGORY BREAKDOWN', yesSummary(personLogs), '', 'APPOINTMENT DETAILS', lines || 'No appointments logged.'].join('\n');
        emails.push(resend.emails.send({ from, to: mate.email, subject: `Your Weekly Appointment Report — ${weekLabel(week)}`, html: html(text) }));
      }
    }

    const results = await Promise.allSettled(emails);
    await supabase.from('audit_log').insert({ actor: 'system', action: 'sent weekly reports', entity_type: 'weekly_report', notes: `${results.length} email attempts for ${weekLabel(week)}` });
    return NextResponse.json({ ok: true, emailAttempts: results.length, results });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || 'Unknown error' }, { status: 500 });
  }
}
