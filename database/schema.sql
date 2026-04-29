-- AppLog V2 database setup
-- Run this in Supabase SQL Editor.
-- For the simple dropdown/passcode login system, keep RLS disabled on these tables for Version 2.
-- For a stricter production system, add Supabase Auth + row-level security policies later.

create extension if not exists "uuid-ossp";

create table if not exists teammates (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  rep_id text,
  phone text,
  email text,
  is_admin boolean default false,
  active boolean default true,
  created_at timestamp with time zone default now()
);

create table if not exists app_settings (
  id integer primary key default 1,
  admin_passcode text not null default 'admin123',
  manager_email text,
  report_day text default 'Friday',
  report_time text default '08:00',
  report_frequency text default 'Weekly',
  send_manager_report boolean default true,
  send_individual_reports boolean default true,
  missed_activity_days integer default 7,
  updated_at timestamp with time zone default now(),
  constraint single_settings_row check (id = 1)
);

create table if not exists appointments (
  id uuid primary key default uuid_generate_v4(),
  teammate_id uuid references teammates(id) on delete set null,
  member text not null,
  client_name text not null,
  appointment_date date not null,
  appointment_time text,
  appointment_type text not null,
  source text not null,
  outcome text not null,
  detail text,
  lessons text,
  week_key date not null,
  created_by text,
  updated_by text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists audit_log (
  id uuid primary key default uuid_generate_v4(),
  actor text,
  action text not null,
  entity_type text not null,
  entity_id text,
  notes text,
  created_at timestamp with time zone default now()
);

insert into app_settings (id, admin_passcode)
values (1, 'admin123')
on conflict (id) do nothing;

insert into teammates (name, is_admin, active)
values ('Emmanuel Reynoso', true, true)
on conflict (name) do nothing;
