-- Copy and Run this in your Supabase SQL Editor to enable full user deletion

create or replace function delete_user_complete(target_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- 1. Delete associated data (Optional if you have ON DELETE CASCADE set up, but safer to include)
  delete from public.payments where user_id = target_user_id;
  delete from public.leave_requests where user_id = target_user_id;
  delete from public.votes where user_id = target_user_id;
  delete from public.profiles where id = target_user_id;

  -- 2. Delete the Auth User (This removes the email/login)
  delete from auth.users where id = target_user_id;
end;
$$;
