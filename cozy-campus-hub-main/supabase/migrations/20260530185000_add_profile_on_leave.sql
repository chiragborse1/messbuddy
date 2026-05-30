-- The app tracks paused plan days on the profile row.

alter table public.profiles
  add column if not exists on_leave boolean not null default false;

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
    or new.on_leave is distinct from old.on_leave
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
