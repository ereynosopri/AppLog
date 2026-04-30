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

function buildReport(appointments: Appointment[]) {
  const total = appointments.length;
  const yes = appointments.filter((a) => a.outcome === 'Yes').length;
  const byMember = new Map<string, { total: number; yes: number }>();

  appointments.forEach((a) => {
    const current = byMember.get(a.member) || { total: 0, yes: 0 };
    current.total += 1;
    if (a.outcome === 'Yes') current.yes += 1;
    byMember.set(a.member, current);
  });

  const leaderboard = Array.from(byMember.entries())
    .sort((a, b) => b[1].yes - a[1].yes || b[1].total - a[1].total)
    .map(([member, stats], index) => `${index + 1}. ${member} — ${stats.yes} YES / ${stats.total} appointments (${ratio(stats.total, stats.yes)}%)`)
    .join('\n');

  return [
    'AppLog Weekly Report',
    '',
    `Total Appointments: ${total}`,
    `YES Outcomes: ${yes}`,
    `YES Ratio: ${ratio(total, yes)}%`,
    '',
    'Leaderboard:',
    leaderboard || 'No activity logged for this week.'
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

    const report = buildReport((data || []) as Appointment[]);

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
    const sendResult = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: `AppLog Weekly Report — Week of ${weekKey}`,
      text: report
    });

    return NextResponse.json({ success: true, emailSent: true, weekKey, sendResult });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
