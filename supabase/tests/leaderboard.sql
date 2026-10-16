-- Run after all six migrations. Test data rolls back.
begin;
do $$
declare early uuid; late uuid; zero_a uuid; zero_b uuid; q uuid; wrong uuid;
  early_rank bigint; late_rank bigint; first_time timestamptz; after_time timestamptz;
begin
  insert into public.participants(name,roll_number)
  values('Earlier scorer','LB-EARLY-' || gen_random_uuid()::text) returning id into early;
  insert into public.participants(name,roll_number)
  values('Later scorer','LB-LATE-' || gen_random_uuid()::text) returning id into late;
  insert into public.questions(question,category,difficulty,correct_answer,points)
  values('Leaderboard fixture','Test','easy','yes',10) returning id into q;
  insert into public.questions(question,category,difficulty,correct_answer,points)
  values('Wrong answer fixture','Test','easy','yes',20) returning id into wrong;
  perform public.submit_answer(early,q,'yes');
  perform pg_sleep(0.002);
  perform public.submit_answer(late,q,'yes');
  select rank into early_rank from public.get_leaderboard() where participant_id=early;
  select rank into late_rank from public.get_leaderboard() where participant_id=late;
  if early_rank >= late_rank then raise exception 'Earlier equal scorer must rank first'; end if;
  select score_reached_at into first_time from public.participants where id=early;
  perform public.submit_answer(early,wrong,'no');
  select score_reached_at into after_time from public.participants where id=early;
  if after_time is distinct from first_time then raise exception 'Zero points changed score reach time'; end if;
  perform public.submit_answer(late,wrong,'yes');
  select rank into early_rank from public.get_leaderboard() where participant_id=early;
  select rank into late_rank from public.get_leaderboard() where participant_id=late;
  if late_rank >= early_rank then raise exception 'Higher score must rank first'; end if;

  zero_a := gen_random_uuid(); zero_b := gen_random_uuid();
  insert into public.participants(id,name,roll_number,created_at)
  values(zero_a,'Zero A','LB-ZERO-A-' || zero_a::text,'2000-01-01'),
        (zero_b,'Zero B','LB-ZERO-B-' || zero_b::text,'2000-01-01');
  select rank into early_rank from public.get_leaderboard() where participant_id=zero_a;
  select rank into late_rank from public.get_leaderboard() where participant_id=zero_b;
  if (zero_a < zero_b) is distinct from (early_rank < late_rank) then raise exception 'Stable ID fallback failed'; end if;
  if not has_function_privilege('anon','public.get_leaderboard()','EXECUTE') then raise exception 'Public leaderboard is inaccessible'; end if;
  if has_table_privilege('anon','public.participants','SELECT')
    or has_table_privilege('anon','public.participant_sessions','SELECT') then
    raise exception 'Public leaderboard opened private tables';
  end if;
  raise notice 'PASS: score order, reach-time ties, zero-point stability, UUID fallback and safe public access';
end;
$$;
set local role anon;
select rank, name, total_score from public.get_leaderboard();
reset role;
rollback;
