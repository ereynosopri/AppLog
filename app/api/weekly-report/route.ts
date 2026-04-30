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

    const { data, error } = await supabase
      .from('appointments')
      .select('*');

    if (error) {
      return NextResponse.json({ error: error.message });
    }

    const total = data.length;
    const yes = data.filter((a) => a.outcome === 'Yes').length;
    const ratio = total ? Math.round((yes / total) * 100) : 0;

    const report = `
Weekly Report

Total Appointments: ${total}
YES: ${yes}
Ratio: ${ratio}%
    `;

    await resend.emails.send({
      from: process.env.REPORT_FROM_EMAIL!,
      to: [process.env.REPORT_FROM_EMAIL!],
      subject: 'Weekly Report',
      text: report,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
