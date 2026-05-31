-- Launch hardening for expected 300-400 active users.
-- Adds missing feedback support, hot-path indexes, safer receipt storage, and voting close-time enforcement.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if to_regclass('public.profiles') is not null then
    create table if not exists public.feedback (
      id uuid primary key default extensions.gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      rating integer not null check (rating between 1 and 5),
      comment text,
      category text not null default 'food',
      created_at timestamptz not null default now()
    );

    alter table public.feedback enable row level security;

    create index if not exists feedback_user_created_at_idx
      on public.feedback (user_id, created_at desc);

    create index if not exists feedback_created_at_idx
      on public.feedback (created_at desc);

    drop policy if exists "Active students can insert own feedback" on public.feedback;
    create policy "Active students can insert own feedback"
      on public.feedback for insert
      to authenticated
      with check (
        auth.uid() = user_id
        and public.is_active_student(auth.uid())
        and rating between 1 and 5
      );

    drop policy if exists "Users can view own feedback" on public.feedback;
    create policy "Users can view own feedback"
      on public.feedback for select
      to authenticated
      using (auth.uid() = user_id);

    drop policy if exists "Admins can view feedback" on public.feedback;
    create policy "Admins can view feedback"
      on public.feedback for select
      to authenticated
      using (public.is_admin(auth.uid()));

    grant select, insert on public.feedback to authenticated;
  end if;
end $$;

do $$
begin
  if to_regclass('public.profiles') is not null then
    create index if not exists profiles_role_created_at_idx
      on public.profiles (role, created_at desc);
    create index if not exists profiles_role_status_idx
      on public.profiles (role, status);
    create index if not exists profiles_role_plan_end_date_idx
      on public.profiles (role, plan_end_date);
  end if;

  if to_regclass('public.payments') is not null then
    create index if not exists payments_user_created_at_idx
      on public.payments (user_id, created_at desc);
    create index if not exists payments_status_created_at_idx
      on public.payments (status, created_at desc);
    create index if not exists payments_membership_plan_id_idx
      on public.payments (membership_plan_id);
  end if;

  if to_regclass('public.leave_requests') is not null then
    create index if not exists leave_requests_user_created_at_idx
      on public.leave_requests (user_id, created_at desc);
    create index if not exists leave_requests_status_created_at_idx
      on public.leave_requests (status, created_at desc);
  end if;

  if to_regclass('public.messages') is not null then
    create index if not exists messages_created_at_idx
      on public.messages (created_at desc);
    create index if not exists messages_user_id_idx
      on public.messages (user_id);
    create index if not exists messages_reply_to_id_idx
      on public.messages (reply_to_id);
  end if;
end $$;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'payment_receipts',
    'payment_receipts',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  )
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'chat_images',
    'chat_images',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  )
  on conflict (id) do update set
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'avatars',
    'avatars',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  )
  on conflict (id) do update set
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "Any user can view receipts" on storage.objects;
  drop policy if exists "Any authenticated user can upload receipts" on storage.objects;
  drop policy if exists "Payment receipt owners can insert" on storage.objects;
  drop policy if exists "Payment receipt owners can read" on storage.objects;
  drop policy if exists "Admins can read payment receipts" on storage.objects;
  drop policy if exists "Admins can delete payment receipts" on storage.objects;

  create policy "Payment receipt owners can insert"
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'payment_receipts'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  create policy "Payment receipt owners can read"
    on storage.objects for select
    to authenticated
    using (
      bucket_id = 'payment_receipts'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  create policy "Admins can read payment receipts"
    on storage.objects for select
    to authenticated
    using (
      bucket_id = 'payment_receipts'
      and public.is_admin(auth.uid())
    );

  create policy "Admins can delete payment receipts"
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'payment_receipts'
      and public.is_admin(auth.uid())
    );
end $$;

create or replace function public.vote_for_menu_session_item(p_session_item_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_session_id bigint;
  target_meal_type text;
  target_status text;
  target_voting_closes_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_active_student(current_user_id) then
    raise exception 'Student account is not active';
  end if;

  select msi.session_id, msi.meal_type, ms.status, ms.voting_closes_at
    into target_session_id, target_meal_type, target_status, target_voting_closes_at
  from public.menu_session_items msi
  join public.menu_sessions ms on ms.id = msi.session_id
  where msi.id = p_session_item_id;

  if target_session_id is null then
    raise exception 'Menu item not found';
  end if;

  if target_status <> 'voting_open'
    or (target_voting_closes_at is not null and now() >= target_voting_closes_at)
  then
    raise exception 'Voting is closed';
  end if;

  insert into public.menu_votes (session_id, session_item_id, user_id, meal_type)
  values (target_session_id, p_session_item_id, current_user_id, target_meal_type)
  on conflict (session_id, meal_type, user_id)
  do update set
    session_item_id = excluded.session_item_id,
    updated_at = now();
end;
$$;

revoke execute on function public.vote_for_menu_session_item(bigint) from public, anon;
grant execute on function public.vote_for_menu_session_item(bigint) to authenticated;
