begin;

alter table public.participants add column score_reached_at timestamptz;
-- Wrong/zero-point submissions must not move the tie-break timestamp.
update public.participants p set score_reached_at = coalesce(
  (select max(s.submitted_at) from public.submissions s where s.participant_id = p.id and s.points_awarded > 0),
  p.created_at
);
alter table public.participants alter column score_reached_at set not null;
alter table public.participants alter column score_reached_at set default clock_timestamp();
create index participants_leaderboard_order_idx
on public.participants(total_score desc, score_reached_at asc, id asc);

create or replace function public.protect_participant_score()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    new.total_score := 0;
    new.score_reached_at := new.created_at;
  elsif new.total_score is distinct from old.total_score then
    if pg_trigger_depth() < 2 then
      raise exception 'Scores are maintained by submissions' using errcode = '42501';
    end if;
    -- Set this after obtaining the participant UPDATE lock, not request start.
    new.score_reached_at := clock_timestamp();
  else
    new.score_reached_at := old.score_reached_at;
  end if;
  return new;
end;
$$;

-- Public read-only projection: no roll numbers, session tokens, or answers.
create function public.get_leaderboard()
returns table(rank bigint, participant_id uuid, name text, total_score bigint)
language sql stable security definer set search_path = '' as $$
  select row_number() over(order by p.total_score desc, p.score_reached_at asc, p.id asc),
    p.id, p.name, p.total_score
  from public.participants p
  order by p.total_score desc, p.score_reached_at asc, p.id asc;
$$;
revoke all on function public.get_leaderboard() from public;
grant execute on function public.get_leaderboard() to anon, authenticated, service_role;

create function public.notify_leaderboard_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and new.total_score is not distinct from old.total_score
    and new.name is not distinct from old.name then return null; end if;
  -- Only an invalidation signal is broadcast. Clients fetch canonical DB ranks.
  -- A failed notification must not prevent an otherwise valid submission.
  begin
    perform realtime.send('{}'::jsonb, 'changed', 'techno-utsav:leaderboard', false);
  exception when others then
    raise warning 'Leaderboard notification unavailable; automatic polling will recover';
  end;
  return null;
end;
$$;
revoke all on function public.notify_leaderboard_change() from public, anon, authenticated, service_role;
create trigger notify_leaderboard_change after insert or update or delete
on public.participants for each row execute function public.notify_leaderboard_change();

commit;
