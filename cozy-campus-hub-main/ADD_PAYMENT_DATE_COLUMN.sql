-- Add membership_start_date column to payments table
alter table public.payments 
add column if not exists membership_start_date date;
