# Supabase Setup

This project uses Supabase for auth, Postgres, row-level security, RPCs, and Edge Functions.

## Browser Environment

The frontend needs only the public Supabase browser values:

```env
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Keep service-role keys, Firebase service-account JSON, Resend/API keys, and downloaded secret files out of git.

## Migrations

Tracked migrations live in `supabase/migrations/`.

Current migration:

- `20260530172853_harden_rls_and_voting.sql` - enables RLS, removes the `profiles.password` column, adds admin helpers, protects profile updates, and keeps voting writes behind `vote_for_item(item_id, category_name)`.
- `20260530182502_notification_logs.sql` - adds admin-readable notification delivery history with RLS and indexes.
- `20260530183500_student_submission_guards.sql` - restricts student-created payments/leaves to safe pending records.
- `20260530184000_active_student_access_guards.sql` - blocks inactive student accounts from student data APIs and voting.
- `20260530184500_admin_revenue_rpcs.sql` - moves admin revenue aggregation into Postgres RPCs.
- `20260530185000_add_profile_on_leave.sql` - adds the `profiles.on_leave` flag used by leave approvals.

Apply migrations to the linked Supabase project:

```sh
supabase db push
```

For a local Supabase stack, run:

```sh
supabase start
supabase db reset
```

## Edge Functions

Current function directories in this checkout:

- `payment-reminder` - admin-protected reminder job for expiring plans and pending balances. It invokes `send-notification` for push delivery and can use an email provider secret for reminders.
- `send-notification` - admin/developer-protected Firebase Cloud Messaging sender for student/admin notifications.
- `delete-student` - admin/developer-protected permanent student deletion flow that cleans related data and removes the Supabase Auth user.
- `cleanup-chat` - admin/developer-protected cleanup flow for 24-hour chat expiry, full admin chat clearing, and chat image object cleanup.

Deploy commands:

```sh
supabase functions deploy payment-reminder
supabase functions deploy send-notification
supabase functions deploy delete-student
supabase functions deploy cleanup-chat
```

## Live Deployment Prerequisites

Before deploying functions to a live project:

- Link the Supabase CLI to the correct project with `supabase link --project-ref <project-ref>`.
- Apply migrations with `supabase db push`.
- Confirm `supabase/config.toml` keeps JWT verification enabled for protected functions.
- Set required Supabase secrets in the live project secret store.
- Add Firebase service-account JSON as a Supabase secret for FCM sending.
- Add the email provider key used by `payment-reminder` if email reminders are enabled.
- Confirm admin/developer profiles exist before testing admin-only functions.

Set secrets with the Supabase CLI, replacing placeholders locally:

```sh
supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON='<service-account-json>'
supabase secrets set RESEND_API_KEY='<resend-api-key>'
```

Do not paste real secret values into commits, issue comments, docs, screenshots, or CI logs.
