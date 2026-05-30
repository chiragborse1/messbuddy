-- Add date-based menu sessions and transactional voting.

create table if not exists public.menu_sessions (
  id bigserial primary key,
  service_date date not null unique,
  title text,
  status text not null default 'draft',
  voting_closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_sessions_status_check
    check (status in ('draft', 'voting_open', 'closed', 'published', 'served'))
);

create table if not exists public.menu_session_items (
  id bigserial primary key,
  session_id bigint not null references public.menu_sessions(id) on delete cascade,
  menu_item_id bigint not null references public.menu_items(id) on delete restrict,
  meal_type text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint menu_session_items_meal_type_check check (meal_type in ('lunch', 'dinner')),
  constraint menu_session_items_unique unique (session_id, meal_type, menu_item_id)
);

create table if not exists public.menu_votes (
  id bigserial primary key,
  session_id bigint not null references public.menu_sessions(id) on delete cascade,
  session_item_id bigint not null references public.menu_session_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  meal_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_votes_meal_type_check check (meal_type in ('lunch', 'dinner')),
  constraint menu_votes_one_vote_per_meal unique (session_id, meal_type, user_id)
);

create index if not exists menu_sessions_status_date_idx
  on public.menu_sessions (status, service_date);

create index if not exists menu_session_items_session_meal_position_idx
  on public.menu_session_items (session_id, meal_type, position, id);

create index if not exists menu_session_items_menu_item_id_idx
  on public.menu_session_items (menu_item_id);

create index if not exists menu_votes_session_item_id_idx
  on public.menu_votes (session_item_id);

create index if not exists menu_votes_user_session_idx
  on public.menu_votes (user_id, session_id);

create index if not exists menu_items_category_id_idx
  on public.menu_items (category, id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_menu_sessions_updated_at on public.menu_sessions;
create trigger touch_menu_sessions_updated_at
before update on public.menu_sessions
for each row execute function public.touch_updated_at();

drop trigger if exists touch_menu_votes_updated_at on public.menu_votes;
create trigger touch_menu_votes_updated_at
before update on public.menu_votes
for each row execute function public.touch_updated_at();

alter table public.menu_sessions enable row level security;
alter table public.menu_session_items enable row level security;
alter table public.menu_votes enable row level security;

drop policy if exists "Menu sessions are viewable by everyone" on public.menu_sessions;
create policy "Menu sessions are viewable by everyone"
  on public.menu_sessions for select
  using (true);

drop policy if exists "Admins can manage menu sessions" on public.menu_sessions;
create policy "Admins can manage menu sessions"
  on public.menu_sessions for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Menu session items are viewable by everyone" on public.menu_session_items;
create policy "Menu session items are viewable by everyone"
  on public.menu_session_items for select
  using (true);

drop policy if exists "Admins can manage menu session items" on public.menu_session_items;
create policy "Admins can manage menu session items"
  on public.menu_session_items for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Active students can view own menu votes" on public.menu_votes;
create policy "Active students can view own menu votes"
  on public.menu_votes for select
  to authenticated
  using ((select auth.uid()) = user_id and (select public.is_active_student()));

drop policy if exists "Admins can view menu votes" on public.menu_votes;
create policy "Admins can view menu votes"
  on public.menu_votes for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can delete menu votes" on public.menu_votes;
create policy "Admins can delete menu votes"
  on public.menu_votes for delete
  to authenticated
  using ((select public.is_admin()));

create or replace view public.menu_session_item_stats as
select
  msi.session_id,
  msi.id as session_item_id,
  msi.meal_type,
  count(mv.id)::integer as vote_count
from public.menu_session_items msi
left join public.menu_votes mv on mv.session_item_id = msi.id
group by msi.session_id, msi.id, msi.meal_type;

grant select on public.menu_sessions to anon, authenticated;
grant select on public.menu_session_items to anon, authenticated;
grant select on public.menu_session_item_stats to anon, authenticated;
grant select on public.menu_votes to authenticated;
grant insert, update, delete on public.menu_sessions to authenticated;
grant insert, update, delete on public.menu_session_items to authenticated;
grant delete on public.menu_votes to authenticated;
grant usage, select on sequence public.menu_sessions_id_seq to authenticated;
grant usage, select on sequence public.menu_session_items_id_seq to authenticated;
grant usage, select on sequence public.menu_votes_id_seq to authenticated;

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
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_active_student(current_user_id) then
    raise exception 'Student account is not active';
  end if;

  select msi.session_id, msi.meal_type, ms.status
    into target_session_id, target_meal_type, target_status
  from public.menu_session_items msi
  join public.menu_sessions ms on ms.id = msi.session_id
  where msi.id = p_session_item_id;

  if target_session_id is null then
    raise exception 'Menu item not found';
  end if;

  if target_status <> 'voting_open' then
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

-- Preserve the current global menu as tomorrow's first session.
insert into public.menu_sessions (service_date, title, status)
select
  current_date + 1,
  'Tomorrow''s menu',
  case
    when exists (
      select 1
      from public.menu_items
      where category = 'config'
        and name = 'voting_status'
        and votes = 1
    ) then 'voting_open'
    else 'draft'
  end
where exists (
  select 1 from public.menu_items where category in ('lunch', 'dinner')
)
on conflict (service_date) do nothing;

insert into public.menu_session_items (session_id, menu_item_id, meal_type, position)
select
  ms.id,
  mi.id,
  mi.category,
  row_number() over (partition by mi.category order by mi.id)::integer
from public.menu_sessions ms
join public.menu_items mi on mi.category in ('lunch', 'dinner')
where ms.service_date = current_date + 1
on conflict (session_id, meal_type, menu_item_id) do nothing;

insert into public.menu_votes (session_id, session_item_id, user_id, meal_type)
select seeded_votes.session_id, seeded_votes.session_item_id, seeded_votes.user_id, seeded_votes.meal_type
from (
  select distinct on (v.user_id, v.category)
    msi.session_id,
    msi.id as session_item_id,
    v.user_id,
    msi.meal_type,
    v.id as old_vote_id
  from public.votes v
  join public.menu_session_items msi on msi.menu_item_id = v.menu_item_id
  join public.menu_sessions ms on ms.id = msi.session_id
  where ms.service_date = current_date + 1
    and v.category in ('lunch', 'dinner')
  order by v.user_id, v.category, v.id desc
) seeded_votes
on conflict (session_id, meal_type, user_id) do nothing;
