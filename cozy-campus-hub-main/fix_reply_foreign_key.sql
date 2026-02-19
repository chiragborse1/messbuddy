-- Add the foreign key if it missing (safe to run)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'messages_reply_to_id_fkey') THEN
        ALTER TABLE public.messages
        ADD CONSTRAINT messages_reply_to_id_fkey
        FOREIGN KEY (reply_to_id)
        REFERENCES public.messages(id);
    END IF;
END $$;

-- Force a schema cache reload (usually happens automatically but good to ensure)
NOTIFY pgrst, 'reload config';
