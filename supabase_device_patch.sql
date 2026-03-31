alter table public.exam_results add column if not exists client_id text;
alter table public.exam_results add column if not exists device_name text;
alter table public.exam_results add column if not exists user_agent text;
alter table public.exam_results add column if not exists platform text;
alter table public.exam_results add column if not exists language text;
alter table public.exam_results add column if not exists timezone text;
