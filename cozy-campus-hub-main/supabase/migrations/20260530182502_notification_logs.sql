create extension if not exists pgcrypto with schema extensions;

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete set null,
  title text not null,
  body text not null,
  image text,
  target_role text,
  topic text,
  user_ids text[] not null default '{}'::text[],
  sent_count integer not null default 0 check (sent_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  created_at timestamptz not null default now()
);

alter table public.notification_logs enable row level security;

revoke all on public.notification_logs from anon, authenticated;
grant select on public.notification_logs to authenticated;
grant insert, select on public.notification_logs to service_role;

drop policy if exists "Admins can read notification logs" on public.notification_logs;
create policy "Admins can read notification logs"
  on public.notification_logs for select
  to authenticated
  using (public.is_admin(auth.uid()));

create index if not exists notification_logs_created_at_idx
  on public.notification_logs (created_at desc);

create index if not exists notification_logs_sender_id_idx
  on public.notification_logs (sender_id);

create index if not exists notification_logs_target_role_idx
  on public.notification_logs (target_role);

create index if not exists notification_logs_topic_idx
  on public.notification_logs (topic);

create index if not exists notification_logs_user_ids_idx
  on public.notification_logs using gin (user_ids);
