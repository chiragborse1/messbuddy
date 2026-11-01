# Security Audit Report — MessBuddy (Kanhaiya Mess)

**Date:** 2026-11-01
**Scope:** Full-stack review (frontend React/Vite, Supabase RLS/RPCs, Edge Functions, CI/CD, Android/Capacitor, dependencies).
**Method:** Static code review, dependency audit, secrets archaeology, configuration review. No destructive testing performed.

## Executive Summary

The application has a **solid security foundation**: Supabase Row Level Security is enabled on all core tables, storage buckets are private where appropriate, role checks are enforced both in the UI and in the database, and sensitive keys are gitignored. The main residual risks are **dependency vulnerabilities (mostly dev/build-time)**, **missing storage policies for chat/avatars**, **no brute-force/rate limiting**, and **push/email secrets not yet configured**.

No critical application-level vulnerabilities (SQL injection, XSS, IDOR, auth bypass) were found in the reviewed code.

## What I Changed

- Fixed a timezone-dependent date bug in `src/lib/plans.ts` (monthly plan end dates computed with local instead of UTC date methods). All 9 tests pass.
- Created `cozy-campus-hub-main/.env` with Supabase credentials (gitignored).
- Linked Supabase project, verified DB migrations up to date, deployed all 4 Edge Functions.

## Findings

### Critical
- None found in application code.

### High
1. **Dependency vulnerabilities (30 total, 2 critical).** `npm audit` reports critical issues in transitive `tar` and `websocket-driver`, plus high in `source-map-js` and `zod` (<4.6.6, DoS via oversized collections). Most are dev/build-time dependencies. The `zod` upgrade to v4 is a breaking change and was intentionally not auto-applied to avoid breaking the app.
   - Remediation: run `npm audit fix` (done, partial); plan a controlled `zod` v4 migration; keep CI `npm audit --omit=dev --audit-level=high` gate.

### Medium
2. **Missing storage policies for `chat_images` and `avatars` buckets.** Only `payment_receipts` has tracked RLS policies. If these buckets were created without policies, uploads may fail or fall back to insecure defaults.
   - Remediation: add explicit owner-scoped insert/select policies for `chat_images` and `avatars` (owner folder = `auth.uid()`), matching the `payment_receipts` pattern.
3. **CORS on Edge Functions is `*`.** Functions require a Bearer token, so CSRF risk is low, but origin restriction would be defense-in-depth.
   - Remediation: validate `Origin` against an allowlist (app domain + localhost) in each function.
4. **No rate limiting / brute-force protection on auth.** Supabase Auth has built-in rate limits, but no app-level lockout. Configure in Supabase Dashboard → Auth → Rate Limits.
5. **Messages are readable by all authenticated users.** `messages` SELECT policy allows any authenticated user. If chat is meant to be private per conversation, this is over-broad.
   - Remediation: scope message reads to sender/recipient if 1:1 chat is intended.
6. **`localStorage`-driven flows in `AuthCallback`.** Pending avatar extension and signup notice payloads are read from `localStorage` and used without strict validation. Impact is low (user-scoped), but validate/sanitize.
7. **Service role key present in local `.env`.** Although gitignored, keep it out of any committed config and rotate if ever exposed.

### Low
8. **CSP allows inline styles/scripts via Tailwind/Vite dev.** Current CSP (`frame-ancestors 'none'; base-uri 'self'; object-src 'none'`) is reasonable for production; tighten `script-src` if feasible.
9. **No security headers on Vite dev server.** `vercel.json` sets headers for production only.
10. **Android `google-services.json` committed.** This is expected for Firebase client config (not a secret), but verify no service-account JSON is committed (none found).

## Strengths

- RLS enabled on all core tables (`profiles`, `menu_items`, `votes`, `payments`, `leave_requests`, `messages`, `feedback`).
- `profiles` has a trigger (`guard_profile_updates`) preventing users from escalating role/status/plan/pending amounts.
- `is_admin()` is `security definer` with restricted grants.
- Votes are written through a `security definer` RPC with voting-open checks.
- Storage buckets are private for receipts; size/MIME limits enforced.
- `.env`, keystores, service-account JSON are gitignored; no secrets found in tracked files.
- CI runs lint, typecheck, tests, build, and `npm audit`.
- Security headers (CSP, X-Frame-Options, etc.) configured in `vercel.json`.

## Recommended Next Steps (prioritized)

1. Add storage policies for `chat_images` and `avatars`.
2. Configure Supabase Auth rate limits in the dashboard.
3. Provide `FIREBASE_SERVICE_ACCOUNT_JSON` secret to enable push notifications.
4. (Optional) Add `RESEND_API_KEY` for payment reminder emails.
5. Plan `zod` v4 migration with tests.
6. Add origin allowlist to Edge Function CORS.
7. Scope `messages` RLS if chat privacy is required.

## Disclaimer

No system is "fully hack-proof." This audit is a point-in-time review; new code, dependencies, and infrastructure changes can introduce new risk. Re-run audits regularly and monitor Supabase/Auth logs.
