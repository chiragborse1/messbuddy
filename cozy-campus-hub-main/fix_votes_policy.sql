-- RUN THIS SQL IN YOUR SUPABASE SQL EDITOR TO FIX VOTING PERMISSIONS

-- 1. Enable Row Level Security on the votes table (if not already enabled)
ALTER TABLE "public"."votes" ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing restrictive policies (adjust names if yours are different)
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON "public"."votes";
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON "public"."votes";
DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."votes";
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON "public"."votes";

-- 3. Create a comprehensive policy that allows EVERYTHING for the vote owner
CREATE POLICY "Users can manage their own votes"
ON "public"."votes"
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. Allow everyone to read vote counts (for anonymous users or public display if needed)
CREATE POLICY "Everyone can see votes"
ON "public"."votes"
FOR SELECT
USING (true);
