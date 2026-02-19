-- 1. Fix "Active" users who have NO plan end date -> Set them to "Approved"
UPDATE profiles
SET status = 'approved'
WHERE status = 'active' AND (plan_end_date IS NULL OR plan_end_date < NOW());

-- 2. Fix "Pending" users who somehow got a plan date (unlikely but possible) -> Set them to "Active"
UPDATE profiles
SET status = 'active'
WHERE status = 'pending' AND plan_end_date > NOW();

-- 3. Ensure all Admins have the correct role (security check)
-- Replace 'YOUR_ADMIN_EMAIL' with actual email if needed, or rely on existing rows
-- UPDATE profiles SET role = 'admin' WHERE email = 'admin@mess.com';
