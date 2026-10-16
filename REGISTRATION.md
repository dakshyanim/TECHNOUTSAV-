# Participant registration

Apply migration `202610080003_participant_sessions.sql` after the preceding migrations. Configure the existing server-only Supabase service-role key. Optionally set `APP_ORIGIN` to the exact application origin, e.g. `http://localhost:3000` locally or your HTTPS origin in production. Do not include a trailing slash.

Registration creates a participant and a session in one PostgreSQL transaction. Unique normalized roll numbers prevent duplicates, including concurrent requests. A 256-bit random token is delivered in an HTTP-only SameSite=Lax cookie; only its SHA-256 hash is stored. Production cookies use Secure and the __Host- prefix. Sessions expire after 24 hours and are checked against the database for every protected request. Participant IDs in request payloads are ignored. No token is placed in localStorage or exposed in JSON.

A valid existing session resumes `/challenge`. An unrecognized browser cannot recover an identity merely by entering a known roll number. It receives a conflict message directing the student to their original browser or an organizer. Automated recovery, logout, identity verification, and organizer tooling are outside this step. Expired/lost sessions require organizer assistance; possession of a roll number alone is not authentication. The roll format assumes 2–50 letters/digits with slash, hyphen, and underscore allowed; adjust if the college uses another format.

The main challenge page is a protected placeholder, with no question or leaderboard UI. Registration uses same-origin JSON POSTs, bounded request bodies, server-side validation, and safe error messages. Before public launch, add deployment-level rate limits to reduce automated registration abuse.

Required complete-flow verification (not yet run):

1. Start the configured app, open `/`, register a new name/roll number, and confirm redirect to `/challenge`.
2. Reload and reopen `/`; confirm the same identity resumes. Inspect the cookie: HttpOnly, SameSite=Lax, expiry 24 hours; Secure and __Host- name on production HTTPS.
3. Confirm one participant row and one session row exist, the session contains a hash rather than the cookie token, and total_score is zero.
4. In another browser, submit the same roll number with different case; expect 409 and no extra participant/session row.
5. Submit empty/invalid/overlong fields, malformed JSON, and a foreign Origin; expect rejection without database changes.
6. Supply a participant_id in JSON; confirm it has no effect. Tamper with the cookie or expire the session row; `/challenge` must redirect to registration.
7. Simultaneously register one new roll number from two browsers; expect exactly one success.
8. Disconnect Supabase; expect a safe unavailable error. Run typecheck/build and mobile browser checks at 320px width.

Host terminal/file runtime failures prevent installing dependencies, reading back changes, browser testing, and live database verification in this environment. Patch operations were submitted but not independently confirmed. Do not treat this step as tested until the above checks succeed.
