# Techno Utsav database setup

The complete database setup is ready in `supabase/setup.sql`. It includes all nine versioned migrations and ten sample questions with challenge codes Q001–Q010. Correctness and scoring are determined by the database, not the browser.

## Set up the Supabase project

1. Open the intended project in the Supabase dashboard and open **SQL Editor**.
2. For a fresh application database, copy the entire `supabase/setup.sql` file into a new query and run it as the project owner. It creates everything in one transaction and refuses to overwrite existing application tables. If any statement fails, roll back the transaction before retrying; do not remove the safety guard or drop existing event data.
3. The final result should show `database_ok = true`, `question_count = 10`, `active_questions = 10`, and `migrations_applied = 9` for a fresh database.
4. If the application tables already exist, apply only the missing files from `supabase/migrations/` in filename order. Do not run the fresh setup on an existing or partially migrated application. Check migration history and the schema before deciding which migrations are missing.
5. Configure the server-only `SUPABASE_SERVICE_ROLE_KEY` in the ignored `.env.local`. Use the service-role key for the SAME project as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Never paste it into chat or prefix it with NEXT_PUBLIC_. Restart Next.js after changing configuration.
6. Run `node --env-file=.env.local scripts/verify-database.mjs`, then start the app and check `/api/health`. The verifier checks sample questions, backend access, public table isolation, public leaderboard projection and denied admin access.

The generated file also records the nine versions in Supabase migration history, so future CLI migration runs do not replay the initial setup. Keep the individual migrations as the source of truth. Regenerate the setup file with `npm run prepare:database` after changing them. No keys or passwords are included in the SQL file.

## Tables and database protections

- `participants`: unique normalized roll number, name, authoritative total score and score-reach timestamp.
- `questions`: immutable question UUID/challenge code, question text, category, difficulty, correct answer, points and active status.
- `submissions`: foreign keys to participant/question and UNIQUE(participant_id, question_id). Wrong answers also consume the single attempt. Submissions are immutable.
- `participant_sessions`: hashed opaque participant tokens and expiry.
- `admin_login_attempts`, `api_request_limits`: atomic login/write budgets.
- `revoked_admin_sessions`: prevents copied admin cookies being reused after logout.
- `leaderboard_notification_gate`: coalesces Realtime notifications without serializing score transactions.

All application tables have RLS and restricted grants. The browser cannot read questions/answers, participant sessions or raw submissions directly. The public leaderboard RPC exposes only rank, participant UUID, name and total score. Privileged registration, grading and admin functions are restricted to the server service role.

The grading trigger rechecks that the question exists and is active, locks its grading data, compares the submitted answer, and awards stored points or zero. The submission insert and participant score increment occur atomically; duplicate attempts roll back without awarding points. Concurrent score increments use participant row locking. Answer comparison ignores case and surrounding whitespace; synonyms and internal punctuation/spacing remain significant.

## Verification status

`npm run test:database-setup` passed against isolated PostgreSQL: all SQL suites, nine migration records, ten sample questions, duplicate rejection, permissions, safe refusal to overwrite an existing app and complete rollback on a simulated setup failure. Supabase Realtime transport was stubbed in local tests.

As of 15 October 2026, a Supabase URL and public key are present in `.env.local`, but the backend service-role key and a direct database connection are missing. The fresh setup has NOT been applied to the hosted project by this preparation. Hosted connectivity, permissions and Realtime delivery still need verification after the SQL is run and the server key is configured.

See `EVENT_DAY_CHECKLIST.md` for backups, deployment, QR printing and event operations. Avoid running persistent test-write scripts against the final event database.
