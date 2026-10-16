# Security and reliability audit — 9 October 2026

Scope: participant registration, challenges, scoring, leaderboard, admin, QR management, SQL migrations, permissions and dependencies. No new product features or infrastructure were added.

## Confirmed issues fixed

- **Admin cookie replay after logout:** signed cookies previously remained usable after the browser cleared them. Migration `202610090008_api_limits.sql` adds a private revocation table/RPC. Every valid admin cookie is checked against it, and logout revokes its hash before clearing the cookie. Database failures deny access; no plaintext tokens are stored. Password/secret rotation also invalidates sessions.
- **Unlimited registration/submission writes:** added an atomic PostgreSQL limiter shared by all app processes. Registration permits 300 requests/minute globally; authenticated submission permits 30 requests/minute per database participant, including duplicates. Limits do not trust forwarding headers or client participant IDs. Limiter failure prevents the write. Limits are event guardrails, not DDoS protection; a hostile requester can exhaust the global registration budget temporarily.
- **Requests hanging on database/network problems:** privileged database requests have an eight-second deadline. Existing explicit deadlines are combined with it. No automatic mutation retries are added because a timeout can occur after a committed write; retries remain protected by uniqueness.
- **Slow request bodies:** registration, answer and admin JSON bodies retain byte limits and now have a ten-second total read deadline. Oversized bodies return 413; slow bodies return 408; streams are cancelled. Invalid JSON returns 400.
- **Browser/server boundary:** privileged database code has Next.js's `server-only` build marker. Accidental imports into client components fail the build.
- **Browser hardening:** all routes deny framing, disable MIME sniffing, restrict referrer leakage and disable unused browser camera/microphone/location APIs. Students scan using their phone's external camera app.

## Requested checks

| Area | Finding / protection |
| --- | --- |
| Duplicate submissions / repeated requests | UNIQUE(participant_id,question_id) remains the final protection; wrong answers also consume the attempt. HTTP 409 for duplicates; limiter 429 for excessive repeats. |
| Simultaneous submissions / scores | Insert, question grading and score increment share one database transaction. Shared question lock prevents edits/deactivation racing grading. Participant UPDATE serializes increments; failed unique inserts roll back scoring. |
| Score and client answer manipulation | Backend selects only submitted answer and uses session identity. Stored correct answer/points determine grading; spoofed score/result fields are ignored. Score changes and submission edits are protected by triggers and grants. |
| Participant identity | Random 256-bit HttpOnly cookie; only SHA-256 hash stored, database session expiry checked; unique normalized roll number; existing roll cannot mint a replacement session. Invalid/forged cookies denied. |
| Admin authorization | All admin APIs/pages authorize independently; participant cookies grant no admin rights. Same-origin checks protect mutations, signed cookies are expiring, password uses scrypt, login has database-backed budgets, logout revokes copies. |
| Database access / permissions | RLS enabled on all application tables. anon/authenticated have no application table/column read/write grants and cannot execute privileged RPCs. Only public health and leaderboard projection are granted. Service key remains a trusted server credential. |
| SQL / injection | Application uses structured Supabase filters/RPC arguments; no client-built SQL. Identifier validation bounds QR challenge codes/UUIDs. React escapes text; CSV export neutralizes formula prefixes. Definer functions use an empty search_path and qualified tables. |
| API abuse | Write budgets, body sizes/deadlines, database deadlines and login limits applied. Public reads/Realtime still need hosting/Supabase quotas for hostile traffic; application limits cannot prevent network DDoS. |
| Invalid/inactive question | Invalid/missing codes return 404, inactive questions return 410. Database grading rechecks existence/activity even after API prechecks. Invalid admin UUIDs return 404. |
| Sessions | Production cookies use Secure, HttpOnly and __Host- names; participant SameSite Lax supports external QR navigation, admin Strict; origin checks required for writes. Participant sessions expire after 24 hours, admin after four hours. |
| Environment/secrets | Only Supabase URL/publishable key use NEXT_PUBLIC_. Service key/admin hash/signing secret stay server-side. Only empty `.env.example` exists locally, `.env*` ignored except template. Production requires HTTPS and correct APP_ORIGIN. |
| Realtime leaderboard | Broadcast contains only an empty invalidation signal. Clients refetch canonical public name/rank/score projection; no rolls, answers or tokens exposed. Public senders can spoof invalidations, but never scores. Client coalescing bounds refresh frequency; polling repairs missed events. Hosted channel permissions/quotas remain to verify. |

## Verification and deployment

Apply **all migrations**, including `202610090008_api_limits.sql` and the later `202610090009_event_readiness.sql`, before running updated code. Without the security migration admin checks and limited writes fail closed. No hosted credentials were available; these migrations have not been applied to a hosted database by this audit/review. See `EVENT_READINESS.md` for notification coalescing and the event-day readiness review.

Passed local database suites include constraints, foreign keys, grading, score immutability, inactive/missing questions, session atomicity/expiry, admin ACLs and all-table/column permission assertions. Rate-limit tests permit 100 distinct participants, reject excess requests and verify window recovery. Admin cryptography/CSV tests passed. npm audit reported zero known production vulnerabilities.

Browser/API integration passed registration, scoring, mobile/projector updates, admin protection, active QR downloads/printing, copied-cookie rejection after logout, client grading/identity tampering, invalid/forged identities, duplicate races and 100 concurrent HTTP registrations/submissions. The local PostgreSQL engine serializes queries and HTTP/Realtime transport is simulated. This is **not** proof of independent PostgreSQL session lock contention, hosted Supabase permissions/delivery, deployed HTTPS/cookies or production capacity. Use `scripts/test-scoring.mjs --allow-test-writes` with a configured test Supabase project for independent-session races and `scripts/verify-database.mjs` for hosted permission/connectivity checks; scoring fixtures are persistent test data.

Participant roll numbers are self-declared. Someone who knows another roll can claim it first; preventing that requires an approved roster or verified credential and changes registration requirements. Existing sessions cannot be taken over by supplying that roll or participant ID. A compromised organizer password, service key or database owner is outside participant trust boundaries. Rotate leaked credentials immediately. Public names/scores are intentionally visible on the event leaderboard.
