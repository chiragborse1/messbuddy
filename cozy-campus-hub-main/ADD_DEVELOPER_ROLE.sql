-- Create a new role 'developer' if you haven't strictly defined allowed roles in an ENUM or check constraint.
-- If you have a check constraint on 'role', you might need to update it first.
-- Example of updating check constraint (Run this ONLY if you have a constraint):
-- ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
-- ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('student', 'admin', 'developer'));

-- 1. Create the Auth User (Developer)
-- Replace 'developer@mess.com' and 'SecurePass123!' with your desired credentials.
-- Note: You cannot set the password directly via SQL for Supabase Auth in the public schema usually, 
-- but you can insert into auth.users if you have superuser privileges, OR better:
-- simply sign up this user via the App's Signup page or Supabase Dashboard.

-- 2. Once the user is created in Auth, insert/update their profile to be 'developer' role.
-- Assuming you already have the user_id (UUID) of the developer account:

-- UPDATE profiles 
-- SET role = 'developer', 
--     status = 'approved',
--     name = 'System Developer',
--     college = 'N/A', 
--     course = 'System Admin'
-- WHERE email = 'chiragborse877@gmail.com'; -- Replace with the actual email you used to sign up

-- OR, if you want to insert a placeholder that waits for signup (if your triggers handle it):
-- The best way is to manually update the role after signing up.

-- 3. Update Policies to give 'developer' high power
-- Example: Allow developers to do EVERYTHING on specific tables.

-- Allow Developer to DELETE anything in 'profiles' (higher power than admin who might be restricted)
CREATE POLICY "Enable delete for developers" ON "public"."profiles"
AS PERMISSIVE FOR DELETE
TO public
USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'developer'));

-- Allow Developer to UPDATE anything
CREATE POLICY "Enable update for developers" ON "public"."profiles"
AS PERMISSIVE FOR UPDATE
TO public
USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'developer'))
WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'developer'));

-- Repeat similar unrestricted policies for other tables if 'admin' policies are restrictive.
-- Since most admin policies currently might just check `role = 'admin'`, you can often update the check to:
-- `role IN ('admin', 'developer')`

-- EXAMPLE: Update an existing Admin policy to include Developer
-- DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
-- CREATE POLICY "Admins and Devs can view all profiles" ON profiles
-- FOR SELECT USING (
--   auth.uid() IN (
--     SELECT id FROM profiles WHERE role IN ('admin', 'developer')
--   )
-- );

-- 4. To practically "Add" the profile via SQL involves inserting into auth.users which is restricted.
-- INSTEAD, use this script to upgrade an EXISTING user to Developer:

/* 
   USAGE: 
   1. Sign up a new user (e.g., developer@mess.com) in the app.
   2. Run this SQL block:
*/

DO $$
DECLARE
    target_email TEXT := 'chiragborse877@gmail.com'; -- <<< CHANGE THIS to the developer's email
BEGIN
    UPDATE public.profiles
    SET 
        role = 'developer',
        status = 'approved',
        name = 'Master Developer' -- Optional custom name
    WHERE email = target_email;
    
    RAISE NOTICE 'User % promoted to Developer role.', target_email;
END $$;
