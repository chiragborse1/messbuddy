-- Keep student-created records in safe, reviewable states.

drop policy if exists "Users can insert own payments" on public.payments;
create policy "Users can insert pending own payments"
  on public.payments for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and amount > 0
    and nullif(trim(plan_name), '') is not null
    and nullif(trim(screenshot_url), '') is not null
    and membership_start_date is not null
  );

drop policy if exists "Users can insert own leave requests" on public.leave_requests;
create policy "Users can insert pending own leave requests"
  on public.leave_requests for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and start_date is not null
    and end_date is not null
    and nullif(trim(reason), '') is not null
  );

drop policy if exists "Users can update own leave requests" on public.leave_requests;
