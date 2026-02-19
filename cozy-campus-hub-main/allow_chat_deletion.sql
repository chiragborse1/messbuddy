-- Enable Deletion Policies for Messages

-- 1. Allow Admins to delete any message (Required for "Clear Chat" and "Disappearing Messages")
create policy "Admins can delete messages"
  on public.messages for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- 2. (Optional) Allow users to delete their own messages
create policy "Users can delete own messages"
  on public.messages for delete
  using (auth.uid() = user_id);
