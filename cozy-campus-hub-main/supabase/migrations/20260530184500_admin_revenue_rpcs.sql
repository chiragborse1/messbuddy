-- Keep revenue aggregation server-side for admin analytics.

create or replace function public.admin_revenue_summary()
returns table (
  total_revenue numeric,
  monthly_revenue numeric,
  weekly_revenue numeric,
  daily_revenue numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin access required';
  end if;

  return query
  select
    coalesce(sum(amount), 0)::numeric as total_revenue,
    coalesce(sum(amount) filter (where created_at >= date_trunc('month', now())), 0)::numeric as monthly_revenue,
    coalesce(sum(amount) filter (where created_at >= date_trunc('week', now())), 0)::numeric as weekly_revenue,
    coalesce(sum(amount) filter (where created_at >= date_trunc('day', now())), 0)::numeric as daily_revenue
  from public.payments
  where status = 'approved';
end;
$$;

create or replace function public.admin_revenue_between(p_start_date date, p_end_date date)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  revenue numeric;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admin access required';
  end if;

  select coalesce(sum(amount), 0)::numeric into revenue
  from public.payments
  where status = 'approved'
    and created_at >= p_start_date::timestamptz
    and created_at < (p_end_date + 1)::timestamptz;

  return revenue;
end;
$$;

revoke execute on function public.admin_revenue_summary() from public, anon;
revoke execute on function public.admin_revenue_between(date, date) from public, anon;
grant execute on function public.admin_revenue_summary() to authenticated;
grant execute on function public.admin_revenue_between(date, date) to authenticated;
