begin;

-- Existing pending submissions remain pending; every new submission is graded.
create or replace function public.grade_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare q public.questions%rowtype;
begin
  -- Hold a shared lock so question edits/deactivation cannot race grading.
  select * into q from public.questions where id = new.question_id for share;
  if not found then raise exception 'Question does not exist' using errcode = '23503'; end if;
  if not q.active then raise exception 'Question is inactive' using errcode = '22023'; end if;
  new.is_correct := lower(btrim(new.submitted_answer)) = lower(btrim(q.correct_answer));
  new.points_awarded := case when new.is_correct then q.points else 0 end;
  new.submitted_at := now();
  return new;
end;
$$;

alter table public.submissions add constraint submissions_result_consistency
check ((is_correct is true) or points_awarded = 0);

-- INSERT, grading, unique enforcement, score UPDATE, and returned result all
-- occur in the same PostgreSQL transaction. The score trigger's row UPDATE
-- serializes distinct concurrent answers from the same participant.
create or replace function public.submit_answer(p_participant_id uuid, p_question_id uuid, p_answer text)
returns table (submission_id uuid, is_correct boolean, points_awarded integer, total_score bigint)
language plpgsql security definer set search_path = '' as $$
declare s public.submissions%rowtype;
begin
  if p_answer is null or length(btrim(p_answer)) not between 1 and 1000 then
    raise exception 'Invalid answer' using errcode = '22023';
  end if;
  insert into public.submissions(participant_id, question_id, submitted_answer)
  values (p_participant_id, p_question_id, btrim(p_answer)) returning * into s;
  return query select s.id, s.is_correct, s.points_awarded, p.total_score
  from public.participants p where p.id = p_participant_id;
end;
$$;
revoke all on function public.grade_submission(), public.submit_answer(uuid,uuid,text)
from public, anon, authenticated;
grant execute on function public.submit_answer(uuid,uuid,text) to service_role;
commit;
