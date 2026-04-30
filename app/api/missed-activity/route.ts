import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 3);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    const { data: teammates, error: teammateError } = await supabase
      .from('teammates')
      .select('*')
      .eq('active', true);

    if (teammateError) {
      return NextResponse.json({ error: teammateError.message });
    }

    const { data: appointments, error: appointmentError } = await supabase
      .from('appointments')
      .select('*')
      .gte('appointment_date', cutoffDate);

    if (appointmentError) {
      return NextResponse.json({ error: appointmentError.message });
    }

    const activeNames = new Set(
      appointments.map((a) => a.member)
    );

    const missed = teammates.filter((t) => !activeNames.has(t.name));

    const report = `
AppLog Missed Activity Alert

Alert Rule:
No appointments logged in the last 3 days.

Teammates Flagged:
${
  missed.length
    ? missed.map((t) => `- ${t.name}`).join('\n')
    : 'No missed activity. Everyone has logged recently.'
}
    `;

    const sendResult = await resend.emails.send({
      from: process.env.REPORT_FROM_EMAIL!,
      to: [process.env.REPORT_TO_EMAIL || process.env.REPORT_FROM_EMAIL!],
      subject: 'AppLog Missed Activity Alert',
      text: report,
    });

    return NextResponse.json({
      success: true,
      cutoffDate,
      flagged: missed.length,
      missed,
      sendResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
