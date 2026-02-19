-- Create feedback table
create table if not exists public.feedback (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  rating integer check (rating >= 1 and rating <= 5) not null,
  comment text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.feedback enable row level security;

-- Policy for inserting feedback (users can insert)
create policy "Users can insert their own feedback"
  on public.feedback for insert
  with check (auth.uid() = user_id);

-- Policy for viewing feedback (admins can view all, users can view their own)
create policy "Users can view their own feedback"
  on public.feedback for select
  using (auth.uid() = user_id);

-- Depending on admin implementation, we might need an admin policy.
-- Assuming admins have a way to bypass RLS or have a specific role check.
-- For now, let's just allow users to insert.
