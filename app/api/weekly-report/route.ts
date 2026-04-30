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

    // Get all appointments
    const { data, error } = await supabase
      .from('appointments')
      .select('*');

    if (error) {
      return NextResponse.json({ error: error.message });
    }

    // ===== TEAM SUMMARY =====
    const total = data.length;
    const yes = data.filter((a) => a.outcome === 'Yes').length;
    const ratio = total ? Math.round((yes / total) * 100) : 0;

    // ===== LEADERBOARD =====
    const leaderboardMap: Record<string, number> = {};

    data.forEach((a) => {
      if (a.outcome === 'Yes') {
        leaderboardMap[a.member] = (leaderboardMap[a.member] || 0) + 1;
      }
    });

    const leaderboard = Object.entries(leaderboardMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count], i) => `${i + 1}. ${name} — ${count} YES`)
      .join('\n');

    const managerReport = `
AppLog Weekly Report

Total Appointments: ${total}
YES Outcomes: ${yes}
YES Ratio: ${ratio}%

Leaderboard:
${leaderboard || 'No data'}
    `;

    // ===== SEND MANAGER REPORT =====
    await resend.emails.send({
      from: process.env.REPORT_FROM_EMAIL!,
      to: [process.env.REPORT_FROM_EMAIL!],
      subject: 'Weekly Team Report',
      text: managerReport,
    });

    // ===== INDIVIDUAL REPORTS =====

    // Group appointments by teammate
    const byTeammate: Record<string, any[]> = {};

    data.forEach((a) => {
      if (!byTeammate[a.member]) {
        byTeammate[a.member] = [];
      }
      byTeammate[a.member].push(a);
    });

    // Get teammates with emails
    const { data: teammates } = await supabase
      .from('teammates')
      .select('*');

    // Send each teammate their report
    for (const name in byTeammate) {
      const logs = byTeammate[name];

      const tTotal = logs.length;
      const tYes = logs.filter((a) => a.outcome === 'Yes').length;
      const tRatio = tTotal ? Math.round((tYes / tTotal) * 100) : 0;

      const report = `
Your Weekly Report

Appointments: ${tTotal}
YES: ${tYes}
Ratio: ${tRatio}%
      `;

      const teammate = teammates?.find((t) => t.name === name);

      if (teammate?.email) {
        await resend.emails.send({
          from: process.env.REPORT_FROM_EMAIL!,
          to: [teammate.email],
          subject: 'Your Weekly Report',
          text: report,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Manager + Individual reports sent',
    });

  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
    });
  }
}
