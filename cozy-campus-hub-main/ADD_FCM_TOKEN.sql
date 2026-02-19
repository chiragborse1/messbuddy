
-- Add a column to store the Firebase Cloud Messaging Token
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS fcm_token TEXT;

-- Verify it was added
SELECT * FROM profiles LIMIT 1;
