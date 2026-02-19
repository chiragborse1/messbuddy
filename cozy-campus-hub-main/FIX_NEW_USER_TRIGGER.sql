-- 1. Fix the handle_new_user function to ensure defaults are correct
-- Run this in Supabase SQL Editor

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, mobile, college, course, role, status, plan, plan_end_date)
  values (
    new.id,
    new.raw_user_meta_data ->> 'name',
    new.email,
    new.raw_user_meta_data ->> 'mobile',
    new.raw_user_meta_data ->> 'college',
    new.raw_user_meta_data ->> 'course',
    coalesce(new.raw_user_meta_data ->> 'role', 'student'),
    'pending', -- Force status to pending
    null,      -- Force plan to null
    null       -- Force plan_end_date to null
  );
  return new;
end;
$$;

-- 2. (Optional) Fix existing users who were wrongly given a plan
-- WARNING: Only run this if you are sure no one has actually paid yet!
-- update public.profiles 
-- set plan = null, plan_end_date = null 
-- where plan is not null and created_at > (now() - interval '1 day');
