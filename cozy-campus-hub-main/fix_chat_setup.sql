-- Recreate messages table to properly link with profiles
-- We drop the old one to fix the foreign key relationship
-- WARNING: This deletes all existing messages!
drop table if exists public.messages;

create table public.messages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null, -- Changed to reference profiles directly for easier joining
  content text, -- Nullable to allow image-only messages
  image_url text,
  reply_to_id uuid,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint messages_reply_to_id_fkey foreign key (reply_to_id) references public.messages(id)
);

-- Enable RLS
alter table public.messages enable row level security;

-- Policies
create policy "Authenticated users can select messages"
  on public.messages for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert messages"
  on public.messages for insert
  with check (auth.uid() = user_id);

-- Enable Realtime
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for all tables;
commit;

-- Storage for Chat Images
insert into storage.buckets (id, name, public)
values ('chat_images', 'chat_images', true)
on conflict (id) do nothing;

-- Storage Policies
create policy "Authenticated users can upload chat images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'chat_images');

create policy "Public can view chat images"
on storage.objects for select
to public
using (bucket_id = 'chat_images');
