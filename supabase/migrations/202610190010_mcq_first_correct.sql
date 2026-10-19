begin;
alter table public.questions add column choices jsonb;
alter table public.questions add column claimed_at timestamptz;
alter table public.questions add column claimed_by uuid references public.participants(id) on delete restrict;
alter table public.questions alter column category set default 'General';
alter table public.questions alter column difficulty set default 'easy';
create function public.valid_mcq(p_choices jsonb,p_answer text) returns boolean
language plpgsql immutable set search_path='' as $$
declare count_valid integer; count_unique integer; has_answer boolean;
begin
 if jsonb_typeof(p_choices) is distinct from 'array' then return false; end if;
 if jsonb_array_length(p_choices) <> 4 then return false; end if;
 select count(*) filter(where jsonb_typeof(value)='string' and length(btrim(value #>> '{}')) between 1 and 500),
 count(distinct lower(btrim(value #>> '{}'))),bool_or(lower(btrim(value #>> '{}'))=lower(btrim(p_answer)))
 into count_valid,count_unique,has_answer from jsonb_array_elements(p_choices);
 return count_valid=4 and count_unique=4 and coalesce(has_answer,false);
end; $$;
revoke all on function public.valid_mcq(jsonb,text) from public,anon,authenticated;
grant execute on function public.valid_mcq(jsonb,text) to service_role;
alter table public.questions add constraint questions_mcq_valid check(choices is null or public.valid_mcq(choices,correct_answer));
alter table public.questions add constraint questions_claim_consistent check((claimed_at is null)=(claimed_by is null));
update public.questions q set choices=v.options from (values
('10000000-0000-4000-8000-000000000001'::uuid,'What does CPU stand for?', '["Central Processing Unit","Computer Power Unit","Central Program Utility","Control Processing User"]'::jsonb),
('10000000-0000-4000-8000-000000000002'::uuid,'Which data structure follows Last In, First Out? Answer with its name.', '["Queue","Stack","Tree","Graph"]'::jsonb),
('10000000-0000-4000-8000-000000000003'::uuid,'What is the decimal value of binary 1010?', '["8","12","10","14"]'::jsonb),
('10000000-0000-4000-8000-000000000004'::uuid,'Which SQL keyword retrieves rows from a table?', '["INSERT","UPDATE","DELETE","SELECT"]'::jsonb),
('10000000-0000-4000-8000-000000000005'::uuid,'What does HTTP stand for?', '["Hypertext Transfer Protocol","High Transfer Text Process","Hyperlink Transmission Program","Host Text Transfer Package"]'::jsonb),
('10000000-0000-4000-8000-000000000006'::uuid,'What is the default HTTPS port? Answer with a number.', '["80","21","443","8080"]'::jsonb),
('10000000-0000-4000-8000-000000000007'::uuid,'In Python, which keyword defines a function?', '["function","define","func","def"]'::jsonb),
('10000000-0000-4000-8000-000000000008'::uuid,'Which Git command copies a remote repository? Answer with the full two-word command.', '["git init","git clone","git pull","git fetch"]'::jsonb),
('10000000-0000-4000-8000-000000000009'::uuid,'What is the worst-case time complexity of binary search on a sorted array? Use notation such as O(n).', '["O(n)","O(log n)","O(n²)","O(1)"]'::jsonb),
('10000000-0000-4000-8000-000000000010'::uuid,'Which ACID property means a transaction is all-or-nothing?', '["Consistency","Isolation","Durability","Atomicity"]'::jsonb)
) as v(id,original_question,options) where q.id=v.id and q.question=v.original_question and q.choices is null and exists(select 1 from jsonb_array_elements_text(v.options) x where lower(btrim(x))=lower(btrim(q.correct_answer)));
-- Custom legacy questions need four choices configured by an administrator.
update public.questions set active=false where choices is null;
-- Earlier winners retain their points. Existing correctly solved questions expire.
update public.questions q set claimed_at=s.submitted_at,claimed_by=s.participant_id,active=false
from (select distinct on(question_id) question_id,submitted_at,participant_id from public.submissions where is_correct is true order by question_id,submitted_at,id) s where q.id=s.question_id;
grant insert(choices),update(choices) on public.questions to service_role;
create function public.protect_question_claim() returns trigger language plpgsql set search_path='' as $$
begin
 if old.claimed_at is not null and new.active then raise exception 'An expired QR cannot be reactivated' using errcode='42501'; end if;
 if (old.claimed_at is not null or pg_trigger_depth()<2) and
 (new.claimed_at is distinct from old.claimed_at or new.claimed_by is distinct from old.claimed_by) then
 raise exception 'A claimed question cannot be reopened' using errcode='42501'; end if;
 return new;
end; $$;
revoke all on function public.protect_question_claim() from public,anon,authenticated,service_role;
create trigger protect_question_claim before update on public.questions for each row execute function public.protect_question_claim();
create or replace function public.grade_submission() returns trigger language plpgsql security definer set search_path='' as $$
declare q public.questions%rowtype;
begin
 -- Exclusive question lock serializes competing answers: exactly one correct winner.
 select * into q from public.questions where id=new.question_id for update;
 if not found then raise exception 'Question does not exist' using errcode='23503'; end if;
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
create or replace function public.admin_get_dashboard(p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_page is null or p_page < 1 or p_page > 100000 then raise exception 'Invalid page' using errcode='22023'; end if;
  select jsonb_build_object(
    'participantCount',(select count(*) from public.participants),
    'questionCount',(select count(*) from public.questions),
    'submissionCount',(select count(*) from public.submissions),
    'questions',coalesce((select jsonb_agg(t) from (select id,challenge_code,question,choices,points,active,claimed_at from public.questions order by created_at desc,id) t),'[]'::jsonb),
    'participants',coalesce((select jsonb_agg(t) from (select id,name,roll_number,total_score,created_at from public.participants order by created_at desc,id) t),'[]'::jsonb),
    'submissions',coalesce((select jsonb_agg(t) from (select s.id,p.name participant_name,p.roll_number,q.challenge_code,s.submitted_answer,s.is_correct,s.points_awarded,s.submitted_at
      from public.submissions s join public.participants p on p.id=s.participant_id join public.questions q on q.id=s.question_id
      order by s.submitted_at desc,s.id limit 50 offset (p_page-1)*50) t),'[]'::jsonb),
    'leaderboard',coalesce((select jsonb_agg(t) from public.get_leaderboard() t),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;


commit;
