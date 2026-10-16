begin;

alter table public.questions add column challenge_code text;
update public.questions set challenge_code = 'Q-' || upper(replace(id::text, '-', ''));
-- Stable, readable codes for the ten sample QR questions.
update public.questions q set challenge_code = 'Q' || lpad(n::text, 3, '0')
from generate_series(1,10) n
where q.id = ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
alter table public.questions alter column challenge_code set not null;
alter table public.questions alter column challenge_code set default ('Q-' || upper(replace(gen_random_uuid()::text, '-', '')));
alter table public.questions add constraint questions_challenge_code_unique unique(challenge_code);
alter table public.questions add constraint questions_challenge_code_format check (challenge_code ~ '^[A-Z0-9-]{1,40}$');

-- Pending grading is represented explicitly, not as an incorrect answer.
-- Previously graded submissions retain their historical values.
alter table public.submissions alter column is_correct drop not null;
create or replace function public.grade_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare q public.questions%rowtype;
begin
  select * into q from public.questions where id = new.question_id for share;
  if not found then raise exception 'Question does not exist' using errcode = '23503'; end if;
  if not q.active then raise exception 'Question is inactive' using errcode = '22023'; end if;
  new.is_correct := null;
  new.points_awarded := 0;
  new.submitted_at := now();
  return new;
end;
$$;
-- The existing AFTER INSERT score trigger adds zero for these pending attempts.
commit;
