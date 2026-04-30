import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

type Appointment = {
  id: string;
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
};

type Teammate = {
  name: string;
  email?: string | null;
  active?: boolean | null;
};

function getMondayKey(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().slice(0, 10);
}

function ratio(total: number, yes: number) {
  return total ? Math.round((yes / total) * 100) : 0;
}

function yesCountForAppointment(a: Appointment) {
  if (a.outcome !== 'Yes') return 0;
  const items = String(a.detail || '').split(',').map((x) => x.trim()).filter(Boolean);
  return items.length || 1;
}

function pointsForAppointment(a: Appointment) {
  return 1 + yesCountForAppointment(a) * 2;
}

function getStats(appointments: Appointment[]) {
  const total = appointments.length;
  const yesAppointments = appointments.filter((a) => a.outcome === 'Yes').length;
  const yesCount = appointments.reduce((sum, a) => sum + yesCountForAppointment(a), 0);
  const points = appointments.reduce((sum, a) => sum + pointsForAppointment(a), 0);
  return { total, yesAppointments, yesCount, points, yesRatio: ratio(total, yesAppointments) };
}

function buildLeaderboard(appointments: Appointment[]) {
  const byMember = new Map<string, { total: number; yesAppointments: number; yesCount: number; points: number }>();

  appointments.forEach((a) => {
    const current = byMember.get(a.member) || { total: 0, yesAppointments: 0, yesCount: 0, points: 0 };
    current.total += 1;
    current.yesAppointments += a.outcome === 'Yes' ? 1 : 0;
    current.yesCount += yesCountForAppointment(a);
    current.points += pointsForAppointment(a);
    byMember.set(a.member, current);
  });

  return Array.from(byMember.entries())
    .sort((a, b) => b[1].points - a[1].points || b[1].yesCount - a[1].yesCount || b[1].total - a[1].total)
    .map(([member, stats], index) => `${index + 1}. ${member} — ${stats.points} points | ${stats.total} appointments | ${stats.yesCount} YES counts | ${stats.yesAppointments} YES appointments (${ratio(stats.total, stats.yesAppointments)}%)`)
    .join('\n');
}

function buildManagerReport(appointments: Appointment[], weekKey: string) {
  const stats = getStats(appointments);
  const leaderboard = buildLeaderboard(appointments);

  return [
    'AppLog Weekly Report',
    `Week of ${weekKey}`,
    '',
    'Point Legend:',
    'Every appointment = 1 point.',
    'Every checked YES option = 2 points.',
    'Example: one appointment with Recruit and Investments checked = 5 points total.',
    '',
    `Total Appointments: ${stats.total}`,
    `YES Appointments: ${stats.yesAppointments}`,
    `YES Counts: ${stats.yesCount}`,
    `Total Points: ${stats.points}`,
    `YES Ratio: ${stats.yesRatio}%`,
    '',
    'Leaderboard:',
    leaderboard || 'No activity logged for this week.'
  ].join('\n');
}

function buildIndividualReport(member: string, appointments: Appointment[], weekKey: string) {
  const stats = getStats(appointments);
  return [
    'Your AppLog Weekly Report',
    `Week of ${weekKey}`,
    '',
    `Teammate: ${member}`,
    '',
    'Point Legend:',
    'Every appointment = 1 point.',
    'Every checked YES option = 2 points.',
    '',
    `Appointments: ${stats.total}`,
    `YES Appointments: ${stats.yesAppointments}`,
    `YES Counts: ${stats.yesCount}`,
    `Points: ${stats.points}`,
    `YES Ratio: ${stats.yesRatio}%`
  ].join('\n');
}

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.REPORT_FROM_EMAIL;
    const toEmail = process.env.REPORT_TO_EMAIL || fromEmail;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, error: 'Missing Supabase environment variables.' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const url = new URL(request.url);
    const weekKey = url.searchParams.get('week') || getMondayKey();

    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('week_key', weekKey)
      .order('appointment_date', { ascending: true });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const appointments = (data || []) as Appointment[];
    const report = buildManagerReport(appointments, weekKey);

    if (!resendKey || !fromEmail || !toEmail) {
      return NextResponse.json({
        success: true,
        emailSent: false,
        message: 'Report generated, but email variables are missing.',
        weekKey,
        report
      });
    }

    const resend = new Resend(resendKey);
    const managerSendResult = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: `AppLog Weekly Report — Week of ${weekKey}`,
      text: report
    });

    const { data: teammateData } = await supabase
      .from('teammates')
      .select('name,email,active')
      .eq('active', true);

    const teammates = (teammateData || []) as Teammate[];
    const individualResults: Array<{ teammate: string; sent: boolean; reason?: string }> = [];

    for (const teammate of teammates) {
      const teammateAppointments = appointments.filter((a) => a.member === teammate.name);
      if (!teammate.email) {
        individualResults.push({ teammate: teammate.name, sent: false, reason: 'Missing email' });
        continue;
      }
      await resend.emails.send({
        from: fromEmail,
        to: [teammate.email],
        subject: `Your AppLog Weekly Report — Week of ${weekKey}`,
        text: buildIndividualReport(teammate.name, teammateAppointments, weekKey)
      });
      individualResults.push({ teammate: teammate.name, sent: true });
    }

    return NextResponse.json({ success: true, emailSent: true, weekKey, managerSendResult, individualResults });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
