> Current update (19 October 2026): four-choice MCQs, in-page scanning and first-correct global QR expiry require migration 202610190010_mcq_first_correct.sql. See [MCQ_UPDATE.md](MCQ_UPDATE.md) for deployment order and existing-data handling. Earlier verification/rules below describe their original implementation stage.

# QR challenge stage

Apply all migrations in filename order, including `202610080004_qr_challenges.sql`, then run `seed.sql`. The seed assigns sample UUIDs readable codes Q001–Q010. Migration 004 also assigns these codes to sample questions seeded in an earlier step. The current seed requires all four migrations.

Each question has a unique `challenge_code`, independent of its internal UUID. Sample paths are `/challenge/Q001` through `/challenge/Q010`. New questions default to a unique Q-prefixed code. QR payloads contain only the absolute challenge URL. They contain no answer, participant identity, or session token.

Pages and GET/POST `/api/challenges/[code]` use the participant session. GET returns only question text, category, difficulty, code, ID, active status and an alreadyAttempted flag. POST accepts only an answer as meaningful input. It resolves participant identity from the cookie and verifies question existence, activity, and attempt history. The database unique constraint is the final protection against concurrent duplicate submissions; preflight checks alone are not relied upon. Missing sessions return 401, missing questions 404, inactive questions 410, duplicate attempts 409, validation errors 400 and database failures 503. Mutating requests require same-origin JSON.

Unregistered scans redirect to registration with a strictly validated local return path. Successful registration returns to the scanned question. Existing participants visiting the registration page with a challenge return path resume that question. No arbitrary external redirects are accepted.

New attempts are stored with `is_correct = NULL` and `points_awarded = 0`, explicitly representing pending results. This stage replaces the earlier automatic grading behavior. Existing historical submissions/totals are preserved. The result structure is `{ submissionId, challengeCode, status: 'pending', isCorrect: null, pointsAwarded: 0 }`. Scoring and leaderboard UI remain for later steps. Existing immutable-submission protections will need a controlled grading operation in the scoring step.

The development-only `/dev/questions` page lists all active questions and full QR URLs. It returns not-found outside `next dev`. Set APP_ORIGIN to an origin reachable from your phone, e.g. your computer's LAN address, and open the app using that same origin. localhost on a phone points to the phone itself. This page supplies URLs for your QR generator; it does not generate QR images.

## Verification

Run all three SQL files in `supabase/tests` after setup. `database.sql` now checks deferred scoring. Run `node --env-file=.env.local scripts/verify-database.mjs`, `npm run typecheck`, and `npm run build`.

Browser/API checks:

- Scan/open Q001 without a cookie, register, and verify return to Q001 with its question.
- Submit once; expect 201, a pending result, one saved answer and no score change.
- Reload, scan again, and use a second tab: expect "You have already attempted this challenge." and no answer form. Direct POST must return 409.
- Race two POST requests for one unattempted question; exactly one must succeed.
- Test inactive/missing codes, invalid answers, expired/tampered cookies, and foreign Origins.
- Include another participant_id in the POST body; it must not change identity.
- Inspect page HTML, GET/POST responses and QR URLs; correct_answer must never appear.
- Check `/dev/questions` in development and confirm it returns 404 in production.
- Check form layout and submission from a phone or 320px viewport.

Verification is blocked: local terminal startup still fails, and file readback, Supabase migration execution, type checking and end-to-end testing could not be performed. Patches were submitted but have not been independently confirmed. Do not treat the flow as verified yet.
