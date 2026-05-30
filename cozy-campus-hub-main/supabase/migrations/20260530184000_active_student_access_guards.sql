-- Align student data access with account status.

create or replace function public.is_active_student(user_id uuid default auth.uid())
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
      and role = 'student'
      and coalesce(status, '') not in ('pending', 'rejected', 'suspended', 'deleted')
  );
$$;

revoke execute on function public.is_active_student(uuid) from public, anon;
grant execute on function public.is_active_student(uuid) to authenticated;

drop policy if exists "Users can view own payments" on public.payments;
create policy "Active students can view own payments"
  on public.payments for select
  to authenticated
  using (auth.uid() = user_id and public.is_active_student(auth.uid()));

drop policy if exists "Users can insert pending own payments" on public.payments;
create policy "Active students can insert pending own payments"
  on public.payments for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.is_active_student(auth.uid())
    and status = 'pending'
    and amount > 0
    and nullif(trim(plan_name), '') is not null
    and nullif(trim(screenshot_url), '') is not null
    and membership_start_date is not null
  );

drop policy if exists "Users can view own leave requests" on public.leave_requests;
create policy "Active students can view own leave requests"
  on public.leave_requests for select
  to authenticated
  using (auth.uid() = user_id and public.is_active_student(auth.uid()));

drop policy if exists "Users can insert pending own leave requests" on public.leave_requests;
create policy "Active students can insert pending own leave requests"
  on public.leave_requests for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.is_active_student(auth.uid())
    and status = 'pending'
    and start_date is not null
    and end_date is not null
    and nullif(trim(reason), '') is not null
  );

drop policy if exists "Users can view own votes" on public.votes;
create policy "Active students can view own votes"
  on public.votes for select
  to authenticated
  using (auth.uid() = user_id and public.is_active_student(auth.uid()));

drop policy if exists "Authenticated users can view messages" on public.messages;
create policy "Active students and admins can view messages"
  on public.messages for select
  to authenticated
  using (public.is_active_student(auth.uid()) or public.is_admin(auth.uid()));

drop policy if exists "Users can insert own messages" on public.messages;
create policy "Active students and admins can insert own messages"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = user_id and (public.is_active_student(auth.uid()) or public.is_admin(auth.uid())));

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

  if not public.is_active_student(current_user_id) then
    raise exception 'Student account is not active';
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
