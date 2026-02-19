-- ============================================================
-- EMERGENCY FIX: Restore login for all users
-- The broken RLS policy on profiles is causing infinite recursion.
-- Run this IMMEDIATELY in Supabase SQL Editor.
-- ============================================================

-- Step 1: Drop the broken policy that causes infinite recursion
DROP POLICY IF EXISTS "Developer can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin and Developer can view all profiles" ON public.profiles;

-- Step 2: Create a SECURITY DEFINER helper function (avoids recursion)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- Step 3: Create the correct profiles SELECT policy (no self-referencing subquery)
CREATE POLICY "Users can view own profile, admins can view all"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = id
  OR public.get_my_role() IN ('admin', 'developer')
);

-- ============================================================
-- All other tables (safe - they don't self-reference)
-- ============================================================

-- PAYMENTS
DROP POLICY IF EXISTS "Developer can view all payments" ON public.payments;
DROP POLICY IF EXISTS "Admin and Developer can view all payments" ON public.payments;
CREATE POLICY "Admin and Developer can view all payments"
ON public.payments FOR SELECT
USING (public.get_my_role() IN ('admin', 'developer'));

DROP POLICY IF EXISTS "Developer can update payments" ON public.payments;
DROP POLICY IF EXISTS "Admin and Developer can update payments" ON public.payments;
CREATE POLICY "Admin and Developer can update payments"
ON public.payments FOR UPDATE
USING (public.get_my_role() IN ('admin', 'developer'));

DROP POLICY IF EXISTS "Developer can delete payments" ON public.payments;
DROP POLICY IF EXISTS "Admin and Developer can delete payments" ON public.payments;
CREATE POLICY "Admin and Developer can delete payments"
ON public.payments FOR DELETE
USING (public.get_my_role() IN ('admin', 'developer'));

-- LEAVE REQUESTS
DROP POLICY IF EXISTS "Developer can view all leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Admin and Developer can view all leave requests" ON public.leave_requests;
CREATE POLICY "Admin and Developer can view all leave requests"
ON public.leave_requests FOR SELECT
USING (public.get_my_role() IN ('admin', 'developer'));

DROP POLICY IF EXISTS "Developer can update leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Admin and Developer can update leave requests" ON public.leave_requests;
CREATE POLICY "Admin and Developer can update leave requests"
ON public.leave_requests FOR UPDATE
USING (public.get_my_role() IN ('admin', 'developer'));

-- MENU ITEMS
DROP POLICY IF EXISTS "Developer can manage menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Admin and Developer can manage menu items" ON public.menu_items;
CREATE POLICY "Admin and Developer can manage menu items"
ON public.menu_items FOR ALL
USING (public.get_my_role() IN ('admin', 'developer'));
