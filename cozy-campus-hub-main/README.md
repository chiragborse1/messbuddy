# MessBuddy / Kanhaiya Mess

MessBuddy is the Kanhaiya Mess management app for students and admins. It handles signups, mess plan status, payments, leave requests, menu voting, student management, and push/email reminders through Supabase and Firebase Cloud Messaging.

## Stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui components
- Supabase Auth, Postgres, RLS, RPCs, and Edge Functions
- Firebase Cloud Messaging for push notifications
- Vitest, ESLint, and TypeScript checks
- Capacitor Android project under `android/`

## Local Setup

Use Node.js with npm, then install dependencies:

```sh
npm ci
```

Create a local `.env` file with the public Supabase browser credentials:

```env
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Do not commit `.env`, service-role keys, Firebase service-account JSON, or other secrets.

Start the Vite dev server:

```sh
npm run dev
```

This repo's Vite config serves the app at `http://127.0.0.1:8080/`.

## Branch Workflow

- Work on the `dev` branch by default.
- Use `main` only when explicitly instructed for a production-ready merge or release.
- Open PRs into `dev` for normal changes unless the maintainer says otherwise.
- Keep migrations and Edge Function changes reviewed together because database rules and app behavior are tightly coupled.

## Supabase

Apply tracked database migrations from `supabase/migrations/`:

```sh
supabase db push
```

Current migration:

- `supabase/migrations/20260530172853_harden_rls_and_voting.sql`
- `supabase/migrations/20260530182502_notification_logs.sql`
- `supabase/migrations/20260530183500_student_submission_guards.sql`
- `supabase/migrations/20260530184000_active_student_access_guards.sql`
- `supabase/migrations/20260530184500_admin_revenue_rpcs.sql`
- `supabase/migrations/20260530185000_add_profile_on_leave.sql`
- `supabase/migrations/20260530185500_add_optional_media_columns.sql`

Deploy Edge Functions:

```sh
supabase functions deploy payment-reminder
supabase functions deploy send-notification
supabase functions deploy delete-student
supabase functions deploy cleanup-chat
```

Current function directories in this repo:

- `payment-reminder`
- `send-notification`
- `delete-student`
- `cleanup-chat`

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for deployment prerequisites and function notes.

## Available Scripts

- `npm run dev` - start the local Vite dev server.
- `npm run build` - create a production build.
- `npm run build:dev` - build in Vite development mode.
- `npm run preview` - serve the built app locally.
- `npm run typecheck` - run TypeScript without emitting files.
- `npm run lint` - run ESLint.
- `npm run test` - run Vitest once.
- `npm run test:watch` - run Vitest in watch mode.

CI runs install, typecheck, lint, tests, and build on `dev` and `main`.

## Security Notes

- Only expose `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the frontend.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, Firebase service-account JSON, and email provider keys in Supabase secrets or the deployment platform secret store.
- Do not make `profiles` publicly readable or store passwords in profile rows.
- Keep voting writes behind the `vote_for_item(item_id, category_name)` RPC.
- Treat admin/developer role checks and RLS migrations as production security boundaries.
