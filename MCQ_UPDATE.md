# MCQ, scanner and first-correct QR update

## Deploy in this order

1. Back up the existing Supabase database and pause play before changing the rules.
2. Run **only** `supabase/migrations/202610190010_mcq_first_correct.sql` in Supabase SQL Editor after the preceding nine migrations. Do not run the fresh setup file over the existing application. This is a transaction: an error rolls back the migration.
3. Deploy the updated source to Vercel. Keep the six existing environment variables; APP_ORIGIN remains the exact HTTPS event origin. No new secret or service is required.
4. Open `/admin` directly, review the questions, and configure four choices and a correct choice for any custom legacy question marked inactive. Activate those questions from the dashboard after review.
5. Rehearse registration → challenge home → Scan QR code → camera permission → question → radio choice → submission. Test two separate participant browsers: the first correct answer wins, and the other receives an expired response. Verify the scoreboard and QR management.

The new migration is prepared and locally tested; it has not been applied to the hosted database by this change. A service-role REST key cannot execute schema migrations. The existing live database and Vercel deployment are not modified by the local browser tests.

## Changed behavior

- `/challenge` has an in-page camera scanner. It starts only on button press, prefers the rear camera, stops on cancel/navigation/success, and handles denied permission or missing camera. It uses a dynamically loaded ZXing QR decoder. Camera frames stay in the browser; they are not uploaded. Camera access requires HTTPS or localhost, and Permissions-Policy now permits camera access to this site only. Microphone/geolocation remain disabled. Real phone camera testing remains required.
- Scans accept only this site's challenge URLs or the configured canonical event origin, then navigate internally. External sites, admin links, scripts, traversal and answer-bearing query strings are rejected. Existing Google Lens/phone-camera QR links continue to work.
- A correct answer permanently expires that question's QR for everyone, even if the question awards zero points. The printed QR remains readable but its challenge is closed; the application does not erase the printed pattern. Closed questions are excluded from active QR management.
- An exclusive PostgreSQL question-row lock serializes competing answers. Grading, first-winner claim, submission and score increment commit together. Exactly one correct participant can win a question. Invalid choices do not consume an attempt; a valid wrong choice still consumes that participant's one attempt but leaves the QR open for others. The participant/question unique constraint is unchanged.
- Question forms have question text, four distinct nonempty choices, a correct-choice selector and points. The correct-choice selector is required so the database can grade the MCQ; it replaces the former free-text answer field. Category/difficulty are removed from admin/student screens and API projections. Their old database columns are retained with defaults to preserve historical metadata and allow a safe upgrade.
- The public Admin panel navigation link is removed. `/admin` and `/admin/login` remain available directly and retain password/cookie authorization on every protected page/API. Hiding the link does not replace authentication. Participant sessions never authorize administration.

## Existing questions and scores

The migration supplies genuine four-choice options for the ten original sample questions only when their original question text/answer still match. Customized text-answer questions are preserved and deactivated until an administrator supplies choices. No options are invented for custom questions.

Existing correctly solved questions are marked expired using their earliest recorded correct submission. Previous winners' submissions and scores are never rewritten—even if several people earned points under the old rules. Wrong and pending submissions retain their previous values. Existing challenge URLs/UUIDs are retained.

Expired questions cannot be reactivated or have their winner fields cleared through the application. Create a new question to make a new QR challenge. Editing choices/points affects only future valid attempts on open questions; it never recalculates historical scores.

## Verification

- `npm run test:database` runs the legacy SQL regression suites against migrations 001–009, then upgrades to 010 and checks MCQ grading, invalid options, expiry, duplicate protection, protected winner fields and historical-score preservation.
- `npm run test:database-setup` verifies a fresh ten-migration setup, sample questions, MCQ/security/session checks, overwrite refusal and rollback. `npm run prepare:database` regenerates the fresh setup bundle.
- `npm run test:admin` checks MCQ input validation, password/session cryptography and safe CSV escaping.
- `node scripts/test-scan-target.mjs` checks safe scan destinations.
- `node scripts/test-mcq-browser.mjs <path-to-playwright-package>` exercises real Next.js routes with isolated PostgreSQL, simulated Supabase transport, admin MCQ create/edit, hidden public admin navigation, QR printing, 100 competing answers, duplicate/different-question requests and scanning from a generated QR presented through a simulated camera stream. It does not contact hosted event data. Independent hosted PostgreSQL lock contention and physical cameras need rehearsal after migration/deployment.

The old event-readiness measurements describe the earlier all-participants-can-score rules. Under the new rules 100 correct requests for one question must yield one success and 99 expired responses, not 100 successes. The leaderboard, registration, admin exports, rate limits, secure sessions and printing remain part of the app.
