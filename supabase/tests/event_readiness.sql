-- Local harness only: requires its realtime.test_broadcasts transport fixture.
begin;
do $$
declare before_count bigint; after_count bigint; p uuid; q uuid; i integer;
begin
  update public.leaderboard_notification_gate set last_sent_at='2000-01-01';
  select count(*) into before_count from realtime.test_broadcasts;
  insert into public.questions(question,category,difficulty,correct_answer,points)
    values('Burst test','Test','easy','yes',1) returning id into q;
  for i in 1..100 loop
    insert into public.participants(name,roll_number) values('Burst Student','BURST-'||gen_random_uuid()::text) returning id into p;
    perform public.submit_answer(p,q,'yes');
  end loop;
  select count(*) into after_count from realtime.test_broadcasts;
  if after_count-before_count > 3 then raise exception 'Notification storm was not coalesced'; end if;
  if (select count(*) from public.submissions where question_id=q) <> 100
    or (select sum(total_score) from public.participants where id in (select participant_id from public.submissions where question_id=q)) <> 100 then raise exception 'Coalescing lost scores'; end if;
  -- A later update can broadcast again without any scheduled worker.
  update public.leaderboard_notification_gate set last_sent_at='2000-01-01';
  insert into public.participants(name,roll_number) values('Later Student','LATER-'||gen_random_uuid()::text);
  if (select count(*) from realtime.test_broadcasts) <= after_count then raise exception 'Notifications never recovered'; end if;
end;
$$;
-- A transport failure must not roll back a participant or awarded points.
create or replace function realtime.send(payload jsonb,event text,topic text,private boolean default true)
returns void language plpgsql as $$ begin raise exception 'Simulated transport outage'; end; $$;
do $$
declare p uuid; q uuid;
begin
  update public.leaderboard_notification_gate set last_sent_at='2000-01-01';
  insert into public.participants(name,roll_number) values('Outage Student','OUTAGE-'||gen_random_uuid()::text) returning id into p;
  insert into public.questions(question,category,difficulty,correct_answer,points)
    values('Outage test','Test','easy','yes',7) returning id into q;
  perform public.submit_answer(p,q,'yes');
  if (select total_score from public.participants where id=p) <> 7
    or (select count(*) from public.submissions where participant_id=p) <> 1 then raise exception 'Notification outage lost a score'; end if;
  if (select last_sent_at from public.leaderboard_notification_gate where id=1) <> '2000-01-01'::timestamptz then raise exception 'Failed send consumed notification gate'; end if;
end;
$$;
rollback;
