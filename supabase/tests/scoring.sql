-- Run after all five migrations. All test fixtures roll back.
begin;
do $$
declare p uuid; q uuid; wrong uuid; inactive uuid; forged uuid; r record; score bigint;
begin
  insert into public.participants(name,roll_number) values ('Score test','SCORE-' || gen_random_uuid()::text) returning id into p;
  insert into public.questions(question,category,difficulty,correct_answer,points)
  values ('Correct fixture','Test','easy','Stack',17) returning id into q;
  insert into public.questions(question,category,difficulty,correct_answer,points)
  values ('Wrong fixture','Test','easy','Queue',23) returning id into wrong;
  insert into public.questions(question,category,difficulty,correct_answer,points,active)
  values ('Inactive fixture','Test','easy','Queue',23,false) returning id into inactive;
  insert into public.questions(question,category,difficulty,correct_answer,points)
  values ('Forged score fixture','Test','easy','Right',7) returning id into forged;

  select * into r from public.submit_answer(p,q,'  sTaCk  ');
  if r.is_correct is distinct from true or r.points_awarded <> 17 or r.total_score <> 17 then raise exception 'Correct answer failed'; end if;
  select * into r from public.submit_answer(p,wrong,'wrong');
  if r.is_correct is distinct from false or r.points_awarded <> 0 or r.total_score <> 17 then raise exception 'Wrong answer failed'; end if;
  begin
    perform public.submit_answer(p,q,'Stack');
    raise exception 'Duplicate accepted';
  exception when unique_violation then null;
  end;
  begin
    perform public.submit_answer(p,wrong,'Queue');
    raise exception 'Retry of wrong answer accepted';
  exception when unique_violation then null;
  end;
  begin
    perform public.submit_answer(p,gen_random_uuid(),'answer');
    raise exception 'Missing question accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    perform public.submit_answer(p,inactive,'Queue');
    raise exception 'Inactive question accepted';
  exception when invalid_parameter_value then null;
  end;
  -- Even an admin insert cannot choose grading/points: the trigger overrides them.
  insert into public.submissions(participant_id,question_id,submitted_answer,is_correct,points_awarded)
  values(p,forged,'wrong',true,999);
  if exists(select 1 from public.submissions where participant_id=p and question_id=forged and (is_correct is distinct from false or points_awarded <> 0)) then
    raise exception 'Client supplied grading was trusted';
  end if;
  select total_score into score from public.participants where id=p;
  if score <> 17 or score <> (select sum(points_awarded) from public.submissions where participant_id=p) then raise exception 'Score drift'; end if;
  if (select count(*) from public.submissions where participant_id=p) <> 3 then raise exception 'Unexpected submissions'; end if;
  raise notice 'PASS: correct, wrong, duplicate, score update, invalid and inactive questions, forged score';
end;
$$;
rollback;
