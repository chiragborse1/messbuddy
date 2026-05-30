alter table if exists public.payments
  add column if not exists transaction_id text;

alter table if exists public.menu_items
  add column if not exists image_url text;
