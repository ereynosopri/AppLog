import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

type Teammate = { name: string; email?: string | null; active?: boolean | null };
type Appointment = { member: string; appointment_date: string };

export async function GET() {
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
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 3);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    const { data: teammateData, error: teammateError } = await supabase
      .from('teammates')
      .select('name,email,active')
      .eq('active', true);

    if (teammateError) {
      return NextResponse.json({ success: false, error: teammateError.message }, { status: 500 });
    }

    const { data: appointmentData, error: appointmentError } = await supabase
      .from('appointments')
      .select('member,appointment_date')
      .gte('appointment_date', cutoffDate);

    if (appointmentError) {
      return NextResponse.json({ success: false, error: appointmentError.message }, { status: 500 });
    }

    const teammates = (teammateData || []) as Teammate[];
    const appointments = (appointmentData || []) as Appointment[];
    const activeNames = new Set(appointments.map((a) => a.member));
    const missed = teammates.filter((t) => !activeNames.has(t.name));

    const report = [
      'AppLog Missed Activity Alert',
      '',
      'Alert Rule: No appointments logged in the last 3 days.',
      `Cutoff Date: ${cutoffDate}`,
      '',
      'Teammates Flagged:',
      missed.length ? missed.map((t) => `- ${t.name}`).join('\n') : 'No missed activity. Everyone has logged recently.'
    ].join('\n');

    if (!resendKey || !fromEmail || !toEmail) {
      return NextResponse.json({ success: true, emailSent: false, cutoffDate, flagged: missed.length, missed, report });
    }

    const resend = new Resend(resendKey);
    const sendResult = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: 'AppLog Missed Activity Alert',
      text: report
    });

    return NextResponse.json({ success: true, emailSent: true, cutoffDate, flagged: missed.length, missed, sendResult });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
