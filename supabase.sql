create extension if not exists pgcrypto;

create table if not exists public.exam_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submit_time text not null,
  group_no int not null,
  total_count int not null,
  correct_count int not null,
  used_time text not null,
  is_auto_submit boolean not null default false,
  exam_mode text,
  exam_mode_label text,
  client_id text,
  device_name text,
  user_agent text,
  platform text,
  language text,
  timezone text,
  details jsonb not null default '[]'::jsonb
);

alter table public.exam_results enable row level security;

alter table public.exam_results add column if not exists exam_mode text;
alter table public.exam_results add column if not exists exam_mode_label text;

-- Allow anyone to submit exam results from your public page.
drop policy if exists "insert_exam_results" on public.exam_results;
create policy "insert_exam_results"
on public.exam_results
for insert
to anon
with check (true);

-- Allow the public page and admin.html to read exam records.
drop policy if exists "select_exam_results" on public.exam_results;
create policy "select_exam_results"
on public.exam_results
for select
to anon
using (true);
