-- Add reply_to_id column to messages table for threading
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id);

-- No new policies needed as standard select/insert policies cover this column
