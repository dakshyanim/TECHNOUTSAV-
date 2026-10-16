begin;
-- One small private row bounds notification fan-out across app processes.
create table public.leaderboard_notification_gate (
  id integer primary key check(id=1),
  last_sent_at timestamptz not null
);
insert into public.leaderboard_notification_gate values(1,'2000-01-01');
alter table public.leaderboard_notification_gate enable row level security;
revoke all on public.leaderboard_notification_gate from public, anon, authenticated, service_role;

create or replace function public.notify_leaderboard_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and new.total_score is not distinct from old.total_score
    and new.name is not distinct from old.name then return null; end if;
  begin
    -- Never queue score transactions behind the notification gate.
    if not pg_try_advisory_xact_lock(173627,1) then return null; end if;
    update public.leaderboard_notification_gate set last_sent_at=clock_timestamp()
      where id=1 and last_sent_at <= clock_timestamp()-interval '2 seconds';
    if not found then return null; end if;
    perform realtime.send('{}'::jsonb,'changed','techno-utsav:leaderboard',false);
  exception when others then
    -- Includes the gate UPDATE: a failed send rolls it back for the next attempt.
    raise warning 'Leaderboard notification unavailable; automatic polling will recover';
  end;
  -- Events inside the window are intentionally coalesced, not queued.
  -- Periodic canonical refetches recover the final score of a quiet burst.
  return null;
end;
$$;
revoke all on function public.notify_leaderboard_change() from public, anon, authenticated, service_role;
commit;
