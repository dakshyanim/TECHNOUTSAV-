# Event-readiness review — 9 October 2026

## Decision

The existing Next.js + Supabase architecture is reasonable for a 100-participant college event. Local simulation and database tests pass. **Production readiness remains conditional** on applying all nine migrations, validating deployed HTTPS/session behavior, checking actual provider quotas and rehearsing independent PostgreSQL sessions against a configured test Supabase project. No hosted credentials were available and no hosted deployment/database was changed by this review.

Use [EVENT_DAY_CHECKLIST.md](EVENT_DAY_CHECKLIST.md) for the operational run sheet. No Redis, queues, microservices or new hosting dependencies are required.

## Scenarios and bottlenecks

| Scenario | Expected behavior and evidence | Remaining risk |
| --- | --- | --- |
| 100 participants open the same challenge | Extended local test issues 100 authenticated GETs concurrently, all 200. Each request uses indexed session token, participant ID, challenge code and participant/question attempt lookups. | About four database HTTP round trips per open (400 in a 100-request burst). Hosted network latency/cold starts and Wi-Fi matter more than the small table size. |
| 100 submissions close together | 100 concurrent POSTs to Q001 all 201; exactly 100 new participants have exactly 1,000 total points, with forged client identity/grading ignored. | About six backend/database round trips per valid submission, including auth, limiter, prechecks and the atomic scoring RPC. Exercise the host's real request/concurrency limits before doors. |
| Different participants answer one question | Shared question locks are compatible; different participant rows and unique keys can progress independently. The 100-submission simulation covers this shape. | Editing/deactivating that question requires an exclusive lock and can wait; freeze approved questions during play. |
| One participant answers one question twice at once | Test sends two concurrent requests: one 201, one 409. UNIQUE(participant_id,question_id) prevents the losing transaction from applying points. | Lost HTTP responses can conceal a committed success; reload in the same browser to check attempt state. |
| Multiple score updates | Different participants update independent rows. Same participant/different questions are serialized by the participant UPDATE; the test submits Q002/Q003 concurrently and reconciles total_score against submission points. | The local engine serializes all queries, so it does not independently establish real PostgreSQL lock-wait timing. The SQL transaction/row-lock protections remain authoritative. |
| 100 users view the leaderboard | 100 simultaneous HTTP reads return canonical database ranks. Shared in-flight public reads reduce duplicate work within one app process. 100 rows require no pagination, extra cache service or render optimization. | Test used 100 HTTP clients, not 100 real browser WebSockets. Multi-instance/serverless processes do not share an in-flight promise; each may perform its own query. |
| Realtime score bursts | Database notifications are coalesced to at most one every two seconds. An empty broadcast only requests a canonical refetch. The local 100-write burst emitted one notification. | 100 subscribed viewers still create about 100 deliveries per broadcast; extra tabs, joins and malicious public sends consume additional project quota. Suppressed trailing updates rely on polling. |
| Temporary API/network failure | Leaderboard retains last known results on 503 and automatically recovers by polling when Realtime delivery is absent. A lost answer response after commit records exactly one attempt; reload shows it as already attempted. A simulated realtime.send exception leaves awarded points committed. | The app requires a network for authoritative writes. Registration can commit before the browser receives its cookie; identity recovery then needs a verified organizer procedure, not roll-only login. |

## Small optimizations implemented

1. **Bound database notification fan-out.** Migration `202610090009_event_readiness.sql` adds one private gate row and a two-second notification window. `pg_try_advisory_xact_lock` is nonblocking: if another transaction holds the gate, scoring skips the redundant notification instead of waiting. Gate/send failures are contained in a subtransaction and do not abort scoring. There is no worker or delayed-event queue. Polling repairs a suppressed final change.
2. **Share overlapping public leaderboard queries.** Identical public reads within one app process reuse an in-flight promise. No settled data or failures are cached, and no session/private information is shared. A new request after completion gets a fresh database snapshot. A unit test verifies 100 overlapping calls use one loader call and that failures recover.
3. **Spread browser refresh load.** Refresh requests include jitter, existing throttling and no overlapping fetches. Fallback polling uses a per-browser 12–18-second interval (15 seconds average), rather than every viewer using an identical interval. Roughly 100 visible viewers average 6.7 fallback requests/second before coalescing; hidden tabs skip reads. Startup/Reconnect bursts can still occur and must fit host quotas.
4. **Reuse the stateless service client.** One Supabase service client is retained per process with persistence/refresh disabled and no per-participant auth mutation. Queries retain their own eight-second deadlines. This avoids constructing several SDK clients for every participant action. Changing credentials requires restart/redeployment as already documented.
5. **Bound participant form waits.** Registration/answer fetches now time out after 30 seconds so a broken connection does not indefinitely disable the form. No automatic write retries are introduced. Unknown submission outcomes tell the participant to check the connection and reload first; the database unique constraint still protects any deliberate retry.

The score transaction, identity model, question grading, ranking/tie policy and write budgets remain unchanged. Registration supports 300 attempts/minute globally; submissions support 30/minute per authenticated participant, enough for the 100-participant rehearsal. These abuse controls are not network DDoS protection.

## Measured local results

The successful extended browser run used real Next.js routes in development mode, Chrome projector/mobile profiles, 100 concurrent HTTP participants, PGlite PostgreSQL and simulated Supabase HTTP/WebSocket transport:

| Burst | Final request completed after | Result |
| --- | --- | --- |
| 100 challenge opens | 3,708 ms | All 200 |
| 100 public leaderboard reads | 1,748 ms | All 200; four underlying queries, including ongoing display refreshes |
| 100 submissions | 4,440 ms | All 201; one database broadcast; exact score totals |

These are **whole-burst completion times, not p95 per-request latency**, and are not production capacity estimates. Development compilation, local machine load, transport simulation and serialized database execution affect the measurements. Timing varies; the earlier run used three leaderboard queries and two broadcasts, illustrating that coalescing reduces rather than guarantees a fixed request count. One initial test assertion expected 30 instead of the correct 20 points in the recovery fixture; it was corrected and the full rerun passed.

Additional checks passed: all nine migrations/SQL suites, notification burst and transport-failure tests, 100-call shared-query/failure recovery tests, browser admin protection/QR print checks, same/different question concurrency, client-field tampering, copied admin-cookie rejection after logout, and leaderboard 503/missing-Realtime recovery. The production build checks types and route compilation.

## Realtime capacity and freshness

The [official Supabase Realtime limits](https://supabase.com/docs/guides/realtime/limits), checked on 9 October 2026, list Free as 200 concurrent connections, 100 messages/second and 100 joins/second; Pro as 500 connections/messages/joins per second. An event is a delivered or received WebSocket message. These limits can be configured per project and are shared with other project traffic.

**A Free project has little/no message headroom for 100 live viewers plus a projector**, even after coalescing: a single broadcast to 101 sockets can exceed 100 deliveries in a second. Do not assume connection capacity solves message capacity. Verify the actual project's limits and rehearse. Use capacity with headroom if every viewer must receive Realtime reliably; otherwise the app automatically polls when delivery is unavailable. Do not introduce a second service just to distribute this small leaderboard.

There is intentionally no timer-based trailing broadcast after a burst. A visible, healthy tab recovers the final suppressed score within its next 12–18-second poll plus scheduling delay/query latency (roughly 19 seconds of scheduling delay); slow/offline/background browsers can take longer. The Live label indicates channel connectivity, not a guarantee that the last score has already rendered. Check fresh database/admin results before declaring winners.

## Required hosted rehearsal

1. Deploy a rehearsal app with HTTPS and the final environment shape, apply all migrations to a separate test Supabase project, then verify public table isolation and connectivity with `node --env-file=.env.local scripts/verify-database.mjs`.
2. Run `node --env-file=.env.local scripts/test-scoring.mjs --allow-test-writes` with APP_ORIGIN pointing to that rehearsal deployment. This script creates permanent TEST fixtures; its parallel API calls use the provider's independent database sessions. Do not run it on final event participants/questions without a planned cleanup/reset.
3. Rehearse the expected 100-client burst through the deployed host, not only localhost. Record per-request latency/status, database CPU/locks, API failures, rate limits, actual Realtime deliveries and quota errors. A healthy /health alone is insufficient. Stop if there are unexplained 5xx, duplicate points, reconciliation mismatches or recurring near-timeout requests.
4. Test on actual college Wi-Fi and mobile data. Register/answer in separate browser profiles, disconnect/reconnect the projector, and simulate a network loss during submission. Confirm 409 on an already committed attempt and automatic leaderboard recovery. Confirm Secure cookies, admin rejection, QR destination and session persistence.
5. Perform a protected backup and restoration rehearsal into a separate project, then prepare the clean event database. Run the full [event-day checklist](EVENT_DAY_CHECKLIST.md), including the incident pause plan.

The local integration harness can be rerun with `node scripts/test-leaderboard-browser.mjs <path-to-playwright-package>`. Other local checks are `npm run test:database`, `node scripts/test-shared-query.mjs`, `node scripts/test-request-body.mjs`, `npm run test:admin`, and `npm run build`. Outputs/screenshots under test-results are ignored by Git and contain only isolated fake test data.
