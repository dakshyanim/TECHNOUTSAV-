-- Run as postgres in Supabase SQL editor after both migrations and seed.sql.
-- All fixtures and submissions roll back. Each failed assertion raises an error.
begin;
do $$
declare
  p uuid;
  q uuid;
  q2 uuid;
  result record;
  score bigint;
  count_questions integer;
begin
  if not public.health_check() then raise exception 'Connection health failed'; end if;
  select count(*) into count_questions from public.questions
  where id in (select ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1,10) n);
  if count_questions <> 10 then raise exception 'Expected ten seeded questions'; end if;

  insert into public.participants(name, roll_number) values ('Database test', 'TEST-' || gen_random_uuid()::text) returning id into p;
  insert into public.questions(question, category, difficulty, correct_answer, points)
  values ('Test correct answer', 'Test', 'easy', 'Stack', 17) returning id into q;
  insert into public.questions(question, category, difficulty, correct_answer, points)
  values ('Test wrong answer', 'Test', 'easy', 'Queue', 23) returning id into q2;

  select * into result from public.submit_answer(p, q, '  sTaCk  ');
  if result.is_correct is distinct from true or result.points_awarded <> 17 or result.total_score <> 17 then
    raise exception 'Correct answer grading failed';
  end if;
  select * into result from public.submit_answer(p, q2, 'wrong');
  if result.is_correct is distinct from false or result.points_awarded <> 0 or result.total_score <> 17 then
    raise exception 'Wrong answer grading failed';
  end if;

  begin
    perform public.submit_answer(p, q, 'Stack');
    raise exception 'Duplicate submission was accepted';
  exception when unique_violation then null;
  end;
  begin
    perform public.submit_answer(p, q2, 'Queue');
    raise exception 'Retry after incorrect answer was accepted';
  exception when unique_violation then null;
  end;
  begin
    perform public.submit_answer(gen_random_uuid(), q, 'Stack');
    raise exception 'Invalid participant was accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    perform public.submit_answer(p, gen_random_uuid(), 'Stack');
    raise exception 'Invalid question was accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    delete from public.participants where id = p;
    raise exception 'Participant relationship was not preserved';
  exception when foreign_key_violation or restrict_violation then null;
  end;
  begin
    update public.submissions set points_awarded = 999 where participant_id = p;
    raise exception 'Submission mutation was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.participants set total_score = 999 where id = p;
    raise exception 'Manual score change was accepted';
  exception when insufficient_privilege then null;
  end;
  update public.questions set active = false where id = q;
  begin
    perform public.submit_answer(p, q, 'Stack');
    raise exception 'Inactive question was accepted';
  exception when invalid_parameter_value then null;
  end;
  select total_score into score from public.participants where id = p;
  if score <> 17 or score <> (select sum(points_awarded) from public.submissions where participant_id = p) then
    raise exception 'Score does not match submissions';
  end if;
  if has_function_privilege('anon', 'public.submit_answer(uuid,uuid,text)', 'EXECUTE')
    or has_table_privilege('anon', 'public.questions', 'SELECT') then
    raise exception 'Anonymous access exposes protected data';
  end if;
  raise notice 'PASS: seed, grading, relationships, duplicates, score integrity and access checks';
end;
$$;
rollback;
