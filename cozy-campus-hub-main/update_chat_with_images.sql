-- Add image_url to messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Make content nullable (allow image-only messages)
ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;

-- Create storage bucket for chat images if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat_images', 'chat_images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
-- Allow authenticated users to upload to chat_images
-- Check if policy exists before creating to avoid errors (or drop and recreate)
DROP POLICY IF EXISTS "Authenticated users can upload chat images" ON storage.objects;
CREATE POLICY "Authenticated users can upload chat images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat_images');

DROP POLICY IF EXISTS "Public can view chat images" ON storage.objects;
CREATE POLICY "Public can view chat images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chat_images');
