# EVENT DAY CHECKLIST

Assign one organizer as event operator and one as backup. Record the event URL, deployed build/commit, hosting and Supabase project names, approved question count, support contact and checkpoint backup times in your private run sheet. Never put passwords, service keys, participant records or backup dumps into Git or a public document.

## Deployment — day before and again one hour before doors

- [ ] Use a stable HTTPS domain reachable from college Wi-Fi and mobile data. Keep it unchanged after QR printing. Use a production build (`npm ci`, `npm run build`, `npm start`) or equivalent managed Next.js deployment; never run `next dev` for the event.
- [ ] Confirm the deployed revision includes both security and event-readiness fixes. Use a supported Node runtime, matching the tested Node 24 runtime where possible. Retain the last working deployment for code rollback.
- [ ] Set the application region close to the Supabase database if the host permits it. Verify host request/concurrency quotas rather than assuming the local simulation establishes deployed capacity.
- [ ] Check `/health` and `/api/health` return healthy/200. Also perform a real registration and scored submission in a separate rehearsal database: the health probe alone does not exercise privileged writes.
- [ ] Rehearse with 100 concurrent HTTP clients in the test environment and two real devices/private browser profiles. Check no unexpected 5xx, one attempt per participant/question, score reconciliation and acceptable latency; aim for most challenge/answer requests to complete within five seconds, and investigate anything approaching the eight-second database deadline.
- [ ] Warm `/`, `/challenge/Q001`, `/leaderboard`, `/admin/login` and QR pages before doors. Test that `/admin` and admin APIs deny participants. Do not deploy or change question answers/points during active play unless fixing a documented incident.

## Database

- [ ] Apply every migration in filename order, including `202610090008_api_limits.sql` and `202610090009_event_readiness.sql`, BEFORE deploying the dependent app code. A mismatch fails closed. These migrations have only been applied to local test databases by this review.
- [ ] Confirm the project is running and not paused; resume it well before the event. Verify question count, active flags, points, correct answers and stable challenge codes with the organizer. Seed only when intended; remove rehearsal data by using a separate clean event project rather than disabling immutable-submission protections.
- [ ] Confirm the participant/question unique constraint, foreign keys, indexes and triggers are present. All application tables, including the notification gate, must have RLS enabled and private grants. Run `node --env-file=.env.local scripts/verify-database.mjs` against the intended project from a trusted operator machine.
- [ ] Run `scripts/test-scoring.mjs --allow-test-writes` through a configured rehearsal app/test Supabase project to test independent database sessions; it creates permanent TEST fixtures, so do not run it against event data. Check simultaneous same-question submissions produce one success/one duplicate, and distinct simultaneous answers produce both score increments.
- [ ] Review Supabase database CPU, memory, disk and API latency. At this scale use the existing managed database; do not add Redis, Kafka or another service.
- [ ] Keep this read-only reconciliation query available to the trusted operator. It must return zero rows. Do not run it in participant browsers:

```sql
select p.id, p.roll_number, p.total_score,
       coalesce(sum(s.points_awarded), 0) as submission_score
from public.participants p
left join public.submissions s on s.participant_id = p.id
group by p.id
having p.total_score <> coalesce(sum(s.points_awarded), 0);
```

## Environment variables

- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` point to the SAME event project and are safe public credentials.
- [ ] `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD_HASH` and `ADMIN_SESSION_SECRET` are configured only as server secrets. Never prefix them with `NEXT_PUBLIC_` or include them in QR codes.
- [ ] `APP_ORIGIN` is the exact HTTPS origin students use, with no path, trailing slash, credentials, query or fragment. Browser Origin checks and QR generation depend on it.
- [ ] Rebuild/redeploy after changing public environment variables; restart/redeploy after changing server variables. Confirm the production cookies have Secure, HttpOnly, correct SameSite settings and __Host- names.
- [ ] Protect operator access to hosting/Supabase dashboards with their account security controls. Keep an approved password-manager copy of recovery credentials available to the backup operator.

## Admin account

- [ ] Run `npm run setup:admin` privately to generate a strong password hash and signing secret. Store the password securely; there is no default password.
- [ ] Login on the operator machine; test counts, question editing in rehearsal, active QR list and CSV download. Logout, verify access is denied, then log back in.
- [ ] Admin sessions last four hours. Schedule a login refresh before that expiry if the event spans it; participant sessions last 24 hours. Students must use the original browser/profile and avoid clearing cookies/private-session closure.
- [ ] Login limits are 10 attempts per address fingerprint and 50 globally per 15 minutes. Avoid repeated password guessing, especially on shared Wi-Fi; keep the correct password accessible to the operator.
- [ ] Freeze the approved question answer/points set before opening. Editing later affects future attempts but never retroactively changes recorded submissions/scores.

## QR codes

- [ ] Generate `/admin/qr` using the FINAL event origin. Verify each active question appears once and its ID/text/code match the placement plan. Decode a sample: payload must be only the challenge URL.
- [ ] Print SVG-based sheets at 100% scale with the full white quiet zone; the supplied layout uses one code per A4 page and an 80mm square QR. Avoid glare, folds, distortion and graphics over the code.
- [ ] Test EVERY placed code with at least one phone under venue lighting; spot-check on another phone/browser and on both Wi-Fi and mobile data. Confirm inactive questions cannot be submitted.
- [ ] Retain an offline print PDF, placement map and spare sheets. Print the human-readable challenge code/URL so volunteers can help if a camera scan fails.
- [ ] Keep QR destinations stable. Replacing the domain requires replacing the printed codes. Never embed a correct answer, token or service credential in a QR.

## Backup

- [ ] Take an operator-controlled database backup BEFORE doors, and verify restore into a separate rehearsal project. Include questions, participants, submissions and participant sessions; a result CSV alone cannot restore the app.
- [ ] Check what backups and retention your actual Supabase plan provides. For Free projects, Supabase recommends CLI exports stored off-site; follow the [official backup guide](https://supabase.com/docs/guides/platform/backups). Do not assume a downloadable backup or point-in-time recovery exists.
- [ ] Keep an encrypted/off-site copy of the dump and schema/migrations, with access restricted because dumps contain personal data, answers and session hashes. Keep deployment configuration/secrets separately in a password manager.
- [ ] Export participant results from admin at agreed checkpoints and immediately after the event. Record timestamps. CSV snapshots supplement the database backup; they do not include individual answers or session state.
- [ ] Do not restore an older backup over the live event just because the display is stale. A restore discards newer attempts; pause, preserve current data and obtain organizer approval first.

## Leaderboard display

- [ ] Open `/leaderboard` on the projector computer before scoring begins; use full-screen, mains power, stable network and disable sleep. Keep a spare laptop/display and mobile hotspot available.
- [ ] Confirm Supabase database Broadcast/public-channel support and `realtime.send` work in the hosted project. Watch a score change from another device; verify names/ranks/scores only, no rolls/answers/tokens.
- [ ] Check actual connection, message and join quotas with headroom for projector, volunteers, extra tabs and reconnects. As checked on 9 October 2026, the [official limits](https://supabase.com/docs/guides/realtime/limits) list Free as 200 connections/100 messages per second and Pro as 500 connections/500 messages per second. These are project-wide, configurable limits, not a guarantee for this event.
- [ ] Notification coalescing reduces bursts to at most one database broadcast per two seconds. With 100 subscribed viewers, each broadcast can still deliver about 100 messages. Public spoofed broadcasts/reconnects can add traffic. If quotas are exceeded, scoring must remain available and polling is the fallback.
- [ ] Expect a suppressed/missed burst update to appear on the next 12–18-second poll plus request latency (roughly 19 seconds of scheduling delay in a visible, healthy tab). Connected/Live does not guarantee an instantaneous snapshot. Rehearse with Realtime unavailable and verify automatic updates continue.
- [ ] Before announcing winners, finish the round, stop accepting new answers by deactivating the event questions, wait for accepted in-flight requests to finish, and compare a fresh admin CSV/database reconciliation with the display. Do not declare winners from a potentially stale projector snapshot.

## Monitoring — during the event

- [ ] Keep one operator watching host request latency/errors and Supabase database/API/Realtime logs and quotas. Check `/api/health` periodically (for example every minute), without adding a new monitoring service.
- [ ] Treat 409 duplicate and 410 inactive responses as expected controls; investigate bursts of 429, any sustained 5xx, failed notification warnings, rising database latency or Realtime disconnections. Write down timestamps and affected question/roll codes; never copy cookies or secret values into incident notes.
- [ ] Reconcile total_score against awarded submissions at checkpoints. Check total participant/submission counts against the expected round progress. Do not manually rewrite scores to match a display.
- [ ] A failing health endpoint indicates the public database probe is unhealthy; a healthy probe does not prove registration/admin/scoring. Confirm those through logs and a separate test project rather than polluting the event with fake attempts.
- [ ] Keep the incident operator, backup operator and event announcer reachable, with one agreed signal to pause the round.

## Emergency procedure

1. **Assess and pause if fairness is affected.** Tell students to keep the same browser open and retain the entered answer. Record the incident time and affected questions. Announce a pause rather than quietly extending one participant's opportunity.
2. **Display-only outage:** keep scoring running if APIs/database are healthy. The projector retains last known results and polls automatically. Restore its network, use the spare display/hotspot, or use a freshly exported admin CSV as a clearly timestamped temporary display. Missing Realtime alone does not invalidate scores.
3. **Uncertain answer submission:** an error may follow a committed transaction. Reload the SAME challenge in the SAME browser to check the authoritative attempt state. A committed attempt remains locked; repeated requests cannot earn extra points. Do not clear cookies or automatically resend a different answer.
4. **Registration/session problem:** reload the original browser first. If the cookie was never received or was lost, the app intentionally cannot recover identity from a roll number alone. An organizer must verify college identity and pause/record any approved repair. Do not register a second roll, share cookies, or delete recorded submissions. There is no self-service session recovery feature.
5. **API/database outage:** stop the round. If available, deactivate questions through admin to prevent new attempts; if the database is unreachable, pause public app traffic using the host's existing controls and make the pause visible to students. Restore network/project availability or roll back ONLY the code to a known compatible build; do not roll back database data/schema during play. Warm and recheck health, scoring logs and reconciliation before reopening.
6. **429 rate limit:** wait a full minute for registration/submission budgets or 15 minutes for admin login limits. Investigate abusive traffic using existing host controls; do not remove the unique constraint, grants or grading triggers. Registration budget is 300/minute globally; submissions are 30/minute per authenticated participant.
7. **Wrong question/answer or suspected corruption:** deactivate the affected question, preserve evidence and current backup/export, and agree the fairness remedy with organizers. Editing an answer only fixes future attempts. Never silently delete attempts or recalculate historical scores during the round.
8. **Secret exposure:** pause access as needed; rotate the service key and admin password/signing secret through the provider, redeploy server configuration, and verify permissions before reopening. Admin secret/hash rotation invalidates signed sessions. Keep secrets out of incident reports.
9. **Recovery and close:** confirm zero score mismatches, correct active questions, hosted multi-device scoring and automatic display recovery. Record the recovery time, announce equal extra time if approved, then reopen. After closing, export final results and take a final protected database backup before retiring the deployment.

No offline answer queue, automatic resubmission, new infrastructure or account-recovery feature is introduced by this review. Paper/offline continuation, if necessary, must be a separately announced organizer procedure with a consistent fairness policy; do not pretend it is synchronized to the app.
