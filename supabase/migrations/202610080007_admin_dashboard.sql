begin;

grant insert(question,category,difficulty,correct_answer,points,active),
  update(question,category,difficulty,correct_answer,points,active)
on public.questions to service_role;

create table public.admin_login_attempts (
  key text primary key,
  attempts integer not null,
  window_started timestamptz not null
);
alter table public.admin_login_attempts enable row level security;
revoke all on public.admin_login_attempts from public, anon, authenticated, service_role;

create function public.admin_claim_login_attempt(p_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare tries integer;
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' then return false; end if;
  -- A global budget also prevents forged forwarding headers bypassing the limit.
  insert into public.admin_login_attempts as a values('global',1,now())
  on conflict(key) do update set
    attempts = case when a.window_started < now()-interval '15 minutes' then 1 else a.attempts+1 end,
    window_started = case when a.window_started < now()-interval '15 minutes' then now() else a.window_started end
  returning attempts into tries;
  if tries > 50 then return false; end if;
  delete from public.admin_login_attempts where key <> 'global' and window_started < now()-interval '1 day';
  insert into public.admin_login_attempts as a values(p_key,1,now())
  on conflict(key) do update set
    attempts = case when a.window_started < now()-interval '15 minutes' then 1 else a.attempts+1 end,
    window_started = case when a.window_started < now()-interval '15 minutes' then now() else a.window_started end
  returning attempts into tries;
  return tries <= 10;
end;
$$;

create function public.admin_get_dashboard(p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_page is null or p_page < 1 or p_page > 100000 then raise exception 'Invalid page' using errcode='22023'; end if;
  select jsonb_build_object(
    'participantCount',(select count(*) from public.participants),
    'questionCount',(select count(*) from public.questions),
    'submissionCount',(select count(*) from public.submissions),
    'questions',coalesce((select jsonb_agg(t) from (select id,challenge_code,question,category,difficulty,points,active from public.questions order by created_at desc,id) t),'[]'::jsonb),
    'participants',coalesce((select jsonb_agg(t) from (select id,name,roll_number,total_score,created_at from public.participants order by created_at desc,id) t),'[]'::jsonb),
    'submissions',coalesce((select jsonb_agg(t) from (select s.id,p.name participant_name,p.roll_number,q.challenge_code,s.submitted_answer,s.is_correct,s.points_awarded,s.submitted_at
      from public.submissions s join public.participants p on p.id=s.participant_id join public.questions q on q.id=s.question_id
      order by s.submitted_at desc,s.id limit 50 offset (p_page-1)*50) t),'[]'::jsonb),
    'leaderboard',coalesce((select jsonb_agg(t) from public.get_leaderboard() t),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create function public.admin_export_results()
returns table(rank bigint, name text, roll_number text, total_score bigint, attempts bigint, correct_answers bigint, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.rank,p.name,p.roll_number,p.total_score,
    (select count(*) from public.submissions s where s.participant_id=p.id),
    (select count(*) from public.submissions s where s.participant_id=p.id and s.is_correct is true),p.created_at
  from public.get_leaderboard() l join public.participants p on p.id=l.participant_id order by l.rank;
$$;
revoke all on function public.admin_claim_login_attempt(text), public.admin_get_dashboard(integer), public.admin_export_results()
from public, anon, authenticated;
grant execute on function public.admin_claim_login_attempt(text), public.admin_get_dashboard(integer), public.admin_export_results() to service_role;
commit;
