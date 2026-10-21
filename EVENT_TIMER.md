# Shared event timer and QR access

## Apply before deploying this update

For an existing database with migration 010 applied, run `supabase/migrations/202610220011_event_timer.sql` once in your Supabase SQL Editor as the project owner. Do not run `supabase/setup.sql` over an existing event database. Fresh installations can use the regenerated setup containing all eleven migrations.

Deploy the updated application after applying the migration. No new environment variables are required. This update has been tested locally; migration 011 has not been applied to your hosted database by this change.

## Organizer controls

Open `/admin`, sign in, and use the event controls:

- Save a duration of 1–1,440 minutes before the event. The initial state is closed.
- **Start challenge** opens QR questions and starts the shared countdown.
- **Set remaining time** changes the live deadline to the entered number of minutes from now.
- **Stop challenge** closes question access and submissions.
- After expiry or stopping, saving a duration does not reopen the event. Explicitly start again when intended.

Starting again preserves participants, submissions, scores and globally won/expired questions. It does not reset the competition. Registration and the leaderboard remain available while the challenge is closed. Administrator question management and QR printing remain available.

## Enforcement and reliability

The database clock determines the deadline. Participants see the same deadline in a banner, using an elapsed-time clock rather than trusting their device wall clock. Supabase Realtime requests a fresh status read after organizer changes; a 6–8 second polling fallback and focus refresh recover missed notifications. The browser hides questions if status cannot be checked, and recovers automatically when connectivity returns.

The server retrieves question content through an event-gated database function. Grading rechecks the deadline after question/participant lock waits. Before start, after stop, or at expiry, direct API requests cannot retrieve question content or submit answers. Client-supplied timer values and scoring fields have no authority. The private control table has no direct browser or service-role table access; only the protected organizer API can invoke the privileged control function. Public status contains timing metadata only.

An organizer stop serializes against admitted grading transactions: a submission already holding the event lock may finish before stop commits. Previously displayed questions cannot be erased from a participant's memory or screenshots. Already awarded scores remain intact. No answers are queued offline.

## Verification

Local PostgreSQL tests cover default closure, permissions, start/stop/adjustment, natural expiry, late submissions, stale organizer updates and preserved scores/claims. Browser tests exercise registration before start, automatic QR opening, shared countdowns, tampered device time, stop/timeout, missed Realtime events and temporary API failure. The browser harness uses simulated Supabase transport; rehearse actual hosted Realtime delivery and simultaneous transactions before the event.
