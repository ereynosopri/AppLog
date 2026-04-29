# AppLog V2

A Vercel-ready appointment logging web app with:

- Simple admin/teammate dropdown login
- Admin passcode
- Supabase cloud database
- Appointment logging and editing
- Teammate management
- Co-admin management
- Dashboard charts
- Leaderboard
- Missed-activity alerts
- Manager and individual weekly reports
- CSV/JSON export
- Vercel Cron route for weekly email reports
- Resend email integration placeholder

## Setup

1. Upload this folder to GitHub.
2. Import the GitHub repo into Vercel.
3. Create a Supabase project.
4. Run `database/schema.sql` inside Supabase SQL Editor.
5. Add these Vercel Environment Variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
RESEND_API_KEY=your_resend_api_key
REPORT_FROM_EMAIL=reports@yourdomain.com
```

6. Redeploy in Vercel.

## Default admin

Admin: Emmanuel Reynoso  
Passcode: `admin123`

Change the passcode inside Settings after your first login.

## Weekly email schedule

The included `vercel.json` schedules `/api/weekly-report` at `0 16 * * 5`, which is Friday 8 AM Pacific during standard time / 9 AM Pacific during daylight time. Vercel cron runs in UTC. Adjust the cron expression if needed.

Vercel Cron Jobs are configured with `vercel.json`, and Resend sends email through its Node SDK. Supabase connection values come from your Supabase Project URL and public key.
