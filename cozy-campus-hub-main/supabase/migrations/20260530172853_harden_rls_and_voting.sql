-- Harden public data access and move vote counting into the database.

alter table if exists public.profiles enable row level security;
alter table if exists public.menu_items enable row level security;
alter table if exists public.votes enable row level security;
alter table if exists public.payments enable row level security;
alter table if exists public.leave_requests enable row level security;
alter table if exists public.messages enable row level security;

alter table if exists public.profiles drop column if exists password;

create or replace function public.is_admin(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and role in ('admin', 'developer')
  );
$$;

revoke execute on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated;

create or replace function public.guard_profile_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if public.is_admin(auth.uid()) then
    return new;
  end if;

  if old.id is distinct from auth.uid() then
    raise exception 'Cannot update another profile';
  end if;

  if new.role is distinct from old.role
    or new.status is distinct from old.status
    or new.plan is distinct from old.plan
    or new.plan_start_date is distinct from old.plan_start_date
    or new.plan_end_date is distinct from old.plan_end_date
    or new.pending_amount is distinct from old.pending_amount
    or new.requested_plan is distinct from old.requested_plan
    or new.requested_plan_start_date is distinct from old.requested_plan_start_date
    or new.requested_pending_amount is distinct from old.requested_pending_amount
  then
    raise exception 'Protected profile fields can only be changed by admins';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_updates on public.profiles;
create trigger guard_profile_updates
before update on public.profiles
for each row execute function public.guard_profile_updates();

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'menu_items', 'votes', 'payments', 'leave_requests', 'messages')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admins can view profiles"
  on public.profiles for select
  using (public.is_admin(auth.uid()));

create policy "Users can update own editable profile fields"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Admins can update profiles"
  on public.profiles for update
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "Menu items are viewable by everyone"
  on public.menu_items for select
  using (true);

create policy "Admins can insert menu items"
  on public.menu_items for insert
  with check (public.is_admin(auth.uid()));

create policy "Admins can update menu items"
  on public.menu_items for update
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "Admins can delete menu items"
  on public.menu_items for delete
  using (public.is_admin(auth.uid()));

create policy "Users can view own votes"
  on public.votes for select
  using (auth.uid() = user_id);

create policy "Admins can view votes"
  on public.votes for select
  using (public.is_admin(auth.uid()));

create policy "Admins can delete votes"
  on public.votes for delete
  using (public.is_admin(auth.uid()));

create or replace function public.vote_for_item(item_id bigint, category_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  voting_enabled boolean;
  item_category text;
  changed_item_ids bigint[];
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select category into item_category
  from public.menu_items
  where id = item_id
    and category = category_name
    and category <> 'config';

  if item_category is null then
    raise exception 'Menu item not found';
  end if;

  select coalesce(votes = 1, false) into voting_enabled
  from public.menu_items
  where category = 'config'
    and name = 'voting_status'
  limit 1;

  if not coalesce(voting_enabled, false) then
    raise exception 'Voting is closed';
  end if;

  select array_agg(distinct menu_item_id) into changed_item_ids
  from public.votes
  where user_id = current_user_id
    and category = category_name;

  delete from public.votes
  where user_id = current_user_id
    and category = category_name;

  insert into public.votes (user_id, menu_item_id, category)
  values (current_user_id, item_id, category_name);

  changed_item_ids := array_append(coalesce(changed_item_ids, array[]::bigint[]), item_id);

  update public.menu_items mi
  set votes = (
    select count(*)::int
    from public.votes v
    where v.menu_item_id = mi.id
  )
  where mi.id = any(changed_item_ids);
end;
$$;

revoke execute on function public.vote_for_item(bigint, text) from public, anon;
grant execute on function public.vote_for_item(bigint, text) to authenticated;

create policy "Users can view own payments"
  on public.payments for select
  using (auth.uid() = user_id);

create policy "Users can insert own payments"
  on public.payments for insert
  with check (auth.uid() = user_id);

create policy "Admins can manage payments"
  on public.payments for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "Users can view own leave requests"
  on public.leave_requests for select
  using (auth.uid() = user_id);

create policy "Users can insert own leave requests"
  on public.leave_requests for insert
  with check (auth.uid() = user_id);

create policy "Users can update own leave requests"
  on public.leave_requests for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Admins can manage leave requests"
  on public.leave_requests for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "Authenticated users can view messages"
  on public.messages for select
  using (auth.role() = 'authenticated');

create policy "Users can insert own messages"
  on public.messages for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own messages"
  on public.messages for delete
  using (auth.uid() = user_id);

create policy "Admins can delete messages"
  on public.messages for delete
  using (public.is_admin(auth.uid()));
