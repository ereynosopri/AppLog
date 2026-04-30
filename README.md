# AppLog Weekly Working Package

This package includes:
- Existing AppLog-style UI
- Admin/teammate simple login
- YES outcome checkbox options
- The Numbers tab
- Reports tab
- `/api/weekly-report` route
- Valid `vercel.json` cron setup

## Required Vercel Environment Variables

Client/database:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Weekly report email:
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `REPORT_FROM_EMAIL`
- `REPORT_TO_EMAIL` optional. If omitted, it sends to `REPORT_FROM_EMAIL`.

## Supabase
Run `supabase/setup.sql` in Supabase SQL Editor.

## Test Weekly Report
After deploy, open:
`https://your-domain.vercel.app/api/weekly-report`

If email variables are missing, the route still returns the generated report instead of failing.
