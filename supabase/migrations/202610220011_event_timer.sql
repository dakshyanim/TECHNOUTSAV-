begin;
create table public.event_control (
 id integer primary key check(id=1),
 running boolean not null default false,
 duration_seconds integer not null default 1800 check(duration_seconds between 1 and 86400),
 started_at timestamptz,
 ends_at timestamptz,
 version bigint not null default 0,
 updated_at timestamptz not null default clock_timestamp(),
 check(not running or (started_at is not null and ends_at is not null))
);
insert into public.event_control(id) values(1);
alter table public.event_control enable row level security;
revoke all on public.event_control from public,anon,authenticated,service_role;

create function public.get_event_state() returns jsonb language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('running',e.running,'is_open',e.running and e.ends_at>clock_timestamp(),
 'duration_seconds',e.duration_seconds,'started_at',e.started_at,'ends_at',e.ends_at,
 'version',e.version,'server_time',clock_timestamp()) from public.event_control e where id=1;
$$;
revoke all on function public.get_event_state() from public;
grant execute on function public.get_event_state() to anon,authenticated,service_role;

create function public.assert_event_open() returns void language plpgsql security definer set search_path='' as $$
declare e public.event_control%rowtype;
begin
 -- Shared lock lets participants proceed together but serializes admin stop/time edits.
 select * into e from public.event_control where id=1 for share;
 if not found or not e.running or e.ends_at is null or e.ends_at<=clock_timestamp() then
  raise exception 'The challenge is not live. Wait for the organizer to start it, or the time has ended.' using errcode='P0101';
 end if;
end; $$;
revoke all on function public.assert_event_open() from public,anon,authenticated,service_role;

create function public.get_live_question(p_code text)
returns table(id uuid,challenge_code text,question text,choices jsonb,points integer,active boolean,claimed_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 perform public.assert_event_open();
 return query select q.id,q.challenge_code,q.question,q.choices,q.points,q.active,q.claimed_at from public.questions q where q.challenge_code=p_code;
 perform public.assert_event_open();
end; $$;
revoke all on function public.get_live_question(text) from public,anon,authenticated;
grant execute on function public.get_live_question(text) to service_role;

create function public.admin_control_event(p_action text,p_seconds integer,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.event_control%rowtype; moment timestamptz;
begin
 if p_action is null or p_action not in('start','stop','set_time') then raise exception 'Invalid event action' using errcode='22023'; end if;
 if p_action<>'stop' and (p_seconds is null or p_seconds not between 1 and 86400) then raise exception 'Duration must be 1-86400 seconds' using errcode='22023'; end if;
 select * into e from public.event_control where id=1 for update;
 if not found then raise exception 'Event setup missing'; end if;
 if p_expected_version is null or p_expected_version<>e.version then raise exception 'Event controls changed in another window. Refresh before trying again.' using errcode='40001'; end if;
 moment:=clock_timestamp();
 if p_action='start' then
  if e.running and e.ends_at>moment then raise exception 'The challenge is already running' using errcode='22023'; end if;
  update public.event_control set running=true,duration_seconds=p_seconds,started_at=moment,ends_at=moment+make_interval(secs=>p_seconds),version=version+1,updated_at=moment where id=1;
 elsif p_action='stop' then
  update public.event_control set running=false,version=version+1,updated_at=moment where id=1;
 else
  update public.event_control set duration_seconds=p_seconds,
   ends_at=case when e.running and e.ends_at>moment then moment+make_interval(secs=>p_seconds) else e.ends_at end,
   version=version+1,updated_at=moment where id=1;
 end if;
 begin
  perform realtime.send('{}'::jsonb,'changed','techno-utsav:event',false);
 exception when others then raise warning 'Event notification unavailable; polling will recover'; end;
 return public.get_event_state();
end; $$;
revoke all on function public.admin_control_event(text,integer,bigint) from public,anon,authenticated;
grant execute on function public.admin_control_event(text,integer,bigint) to service_role;

create or replace function public.grade_submission() returns trigger language plpgsql security definer set search_path='' as $$
declare q public.questions%rowtype;
begin
 perform public.assert_event_open();
 -- Exclusive question lock serializes competing answers: exactly one correct winner.
 select * into q from public.questions where id=new.question_id for update;
 if not found then raise exception 'Question does not exist' using errcode='23503'; end if;
 -- Do not admit an answer that waited for question/participant locks past the deadline.
 perform 1 from public.participants where id=new.participant_id for no key update;
 perform public.assert_event_open();
 if exists(select 1 from public.submissions where participant_id=new.participant_id and question_id=new.question_id) then raise exception 'Already attempted' using errcode='23505'; end if;
 if q.claimed_at is not null then raise exception 'Challenge has expired' using errcode='P0001'; end if;
 if not q.active then raise exception 'Question is inactive' using errcode='55000'; end if;
 if q.choices is null or not exists(select 1 from jsonb_array_elements_text(q.choices) x where lower(btrim(x))=lower(btrim(new.submitted_answer))) then raise exception 'Select one of the four choices' using errcode='22023'; end if;
 new.is_correct:=lower(btrim(new.submitted_answer))=lower(btrim(q.correct_answer));
 new.points_awarded:=case when new.is_correct then q.points else 0 end;
 new.submitted_at:=clock_timestamp();
 if new.is_correct then update public.questions set claimed_at=new.submitted_at,claimed_by=new.participant_id,active=false where id=q.id; end if;
 return new;
end; $$;

commit;
