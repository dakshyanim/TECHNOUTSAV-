> Current update (19 October 2026): four-choice MCQs, in-page scanning and first-correct global QR expiry require migration 202610190010_mcq_first_correct.sql. See [MCQ_UPDATE.md](MCQ_UPDATE.md) for deployment order and existing-data handling. Earlier verification/rules below describe their original implementation stage.

# Techno Utsav QR Challenge

Initial infrastructure only: no QR scanning, questions, scoring, or leaderboard.

## Local setup

Use Node.js 22.18+ LTS or Node.js 24 and npm.

1. Run `npm install`. Commit the generated `package-lock.json` for reproducible installs.
2. Copy `.env.example` to `.env.local`.
3. In your Supabase project settings, copy the project URL and publishable key into `.env.local`. Never put a secret or service-role key in a `NEXT_PUBLIC_` variable.
4. Apply every SQL file in `supabase/migrations/` in filename order, including `202610090008_api_limits.sql` and `202610090009_event_readiness.sql`, then seed sample questions if needed. Configure admin credentials as described in `ADMIN.md`.
5. Run `npm run dev`, then visit http://localhost:3000.
6. Visit `/health` and `/api/health`. The API returns 200 only when the database probe succeeds; otherwise it returns 503 with a safe status message. Without credentials the home page still works.
7. Run `npm run typecheck` and `npm run build`. For a production-mode local check, run `npm start` after the build.

## Architecture

```text
src/app/                 React pages, shared layout, error boundary
src/app/api/health/      HTTP health endpoint
src/lib/health.ts        Shared health-check logic
src/lib/supabase/        Configuration and server/browser clients
supabase/migrations/    Versioned PostgreSQL changes
.env.example            Environment variable template
```

One Next.js application serves the frontend and API; Supabase hosts PostgreSQL and provides Realtime. Database access uses Supabase's HTTP API rather than opening a PostgreSQL connection per request. Browser clients are created lazily and reused. This keeps the architecture small for approximately 100 participants; event features will still need load testing once implemented.

The app now includes participant sessions, database-authoritative scoring, a public Realtime leaderboard, protected admin management and printable QR codes. All application tables use RLS and restricted grants. See `SECURITY_AUDIT.md` for trust boundaries, request limits and deployment requirements.

No secret environment values are committed. Dependency directories, build output, and local environment files are ignored. The health endpoint never exposes credentials or raw database errors and uses a five-second timeout.

## Verification status

Local SQL suites, authentication checks, browser/API flows and production builds have passed. A 100-participant concurrent HTTP test passed against an isolated database whose query execution is serialized. Hosted Supabase connectivity, independent-session lock contention and production capacity remain to verify with configured test credentials; see `SECURITY_AUDIT.md` and `EVENT_READINESS.md`. Use `EVENT_DAY_CHECKLIST.md` for deployment, backups, monitoring and incident procedures.
