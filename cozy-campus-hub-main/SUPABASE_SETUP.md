
# ⚡️ Supabase Setup Instructions

1.  **Create a Project:** Go to [database.new](https://database.new) and create a new project.
2.  **Get Credentials:** Go to **Project Settings > API** and copy the `URL` and `anon public` key.
3.  **Update `.env`:** Add these to your `.env` file (create one if it doesn't exist):
    ```env
    VITE_SUPABASE_URL=your-project-url
    VITE_SUPABASE_ANON_KEY=your-anon-key
    ```
4.  **Run migrations:** Apply the SQL files in `supabase/migrations/` from the Supabase CLI or SQL Editor. Do not make `profiles` publicly readable, do not store passwords in `profiles`, and keep voting writes behind the `vote_for_item(item_id, category_name)` RPC.

    Current hardening migration:
    `supabase/migrations/20260530172853_harden_rls_and_voting.sql`
