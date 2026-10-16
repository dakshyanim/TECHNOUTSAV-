-- Run after all four migrations and seed.sql; rolls back all test data.
begin;
do $$
declare p uuid; q uuid; inactive uuid; r record; s public.submissions%rowtype;
begin
  if (select count(*) from public.questions where challenge_code ~ '^Q00[1-9]$' or challenge_code = 'Q010') <> 10 then
    raise exception 'Expected Q001 through Q010 seed codes';
  end if;
  insert into public.participants(name,roll_number) values ('QR Test','QR-' || gen_random_uuid()::text) returning id into p;
  insert into public.questions(question,category,difficulty,correct_answer,points)
  values ('QR fixture','Test','easy','secret',100) returning id into q;
  insert into public.questions(question,category,difficulty,correct_answer,points,active)
  values ('Inactive fixture','Test','easy','secret',100,false) returning id into inactive;
  select * into r from public.submit_answer(p,q,'secret');
  if r.is_correct is distinct from true or r.points_awarded <> 100 or r.total_score <> 100 then
    raise exception 'Correct grading and score update failed';
  end if;
  select * into s from public.submissions where participant_id = p and question_id = q;
  if s.submitted_answer <> 'secret' or s.submitted_at is null then raise exception 'Answer not stored'; end if;
  begin
    perform public.submit_answer(p,q,'another answer');
    raise exception 'Repeat attempt accepted';
  exception when unique_violation then null;
  end;
  begin
    perform public.submit_answer(p,inactive,'answer');
    raise exception 'Inactive question accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.submit_answer(p,gen_random_uuid(),'answer');
    raise exception 'Missing question accepted';
  exception when foreign_key_violation then null;
  end;
  if (select count(*) from public.submissions where participant_id=p) <> 1 then raise exception 'Unexpected attempts'; end if;
  raise notice 'PASS: QR codes, graded answer storage, duplicate, inactive and missing question checks';
end;
$$;
rollback;
