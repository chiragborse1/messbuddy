-- Forcefully remove a user by email from both public.profiles AND auth.users
-- This is useful if a signup got stuck or you want to free up an email.

-- 1. Create a function to bypass foreign key constraints if needed (handling deletes gracefully)
-- But usually, deleting from auth.users cascades to public.profiles if setup correctly.
-- If not, we manually delete from profiles first.

DO $$
DECLARE
    target_email TEXT := 'chiragborse877@gmail.com'; -- <<< The email to DELETE
    target_id UUID;
BEGIN
    -- Find the User ID in auth.users
    SELECT id INTO target_id FROM auth.users WHERE email = target_email;

    IF target_id IS NULL THEN
        RAISE NOTICE 'User % not found in auth.users.', target_email;
    ELSE
        -- 1. Delete dependent data in public schema (just to be safe)
        DELETE FROM public.payments WHERE user_id = target_id;
        DELETE FROM public.leave_requests WHERE user_id = target_id;
        DELETE FROM public.votes WHERE user_id = target_id;
        DELETE FROM public.profiles WHERE id = target_id;

        -- 2. Delete from auth.users (The actual login account)
        DELETE FROM auth.users WHERE id = target_id;
        
        RAISE NOTICE 'User % with ID % has been completely DELETED.', target_email, target_id;
    END IF;
END $$;
