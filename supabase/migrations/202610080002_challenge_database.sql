begin;

grant execute on function public.health_check() to service_role;

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  roll_number text not null check (length(btrim(roll_number)) between 1 and 50),
  total_score bigint not null default 0 check (total_score >= 0),
  created_at timestamptz not null default now()
);
create unique index participants_roll_number_unique on public.participants (lower(btrim(roll_number)));

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  question text not null check (length(btrim(question)) between 1 and 4000),
  category text not null check (length(btrim(category)) between 1 and 100),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  correct_answer text not null check (length(btrim(correct_answer)) between 1 and 1000),
  points integer not null check (points between 0 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index questions_active_category_idx on public.questions (category) where active;

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete restrict,
  question_id uuid not null references public.questions(id) on delete restrict,
  submitted_answer text not null check (length(btrim(submitted_answer)) between 1 and 1000),
  is_correct boolean not null,
  points_awarded integer not null check (points_awarded >= 0),
  submitted_at timestamptz not null default now(),
  constraint submissions_participant_question_unique unique (participant_id, question_id)
);
-- The unique index already covers participant_id lookups.
create index submissions_question_id_idx on public.submissions(question_id);

alter table public.participants enable row level security;
alter table public.questions enable row level security;
alter table public.submissions enable row level security;
revoke all on public.participants, public.questions, public.submissions from anon, authenticated, service_role;
grant select on public.participants, public.questions, public.submissions to service_role;
grant insert (name, roll_number) on public.participants to service_role;

create function public.protect_participant_score()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    new.total_score := 0;
  elsif new.total_score is distinct from old.total_score and pg_trigger_depth() < 2 then
    raise exception 'Scores are maintained by submissions' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger protect_participant_score before insert or update on public.participants
for each row execute function public.protect_participant_score();

create function public.grade_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare q public.questions%rowtype;
begin
  select * into q from public.questions where id = new.question_id for share;
  if not found then
    raise exception 'Question does not exist' using errcode = '23503';
  end if;
  if not q.active then
    raise exception 'Question is inactive' using errcode = '22023';
  end if;
  new.is_correct := lower(btrim(new.submitted_answer)) = lower(btrim(q.correct_answer));
  new.points_awarded := case when new.is_correct then q.points else 0 end;
  new.submitted_at := now();
  return new;
end;
$$;
create trigger grade_submission before insert on public.submissions
for each row execute function public.grade_submission();

create function public.apply_submission_score()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- UPDATE locks the participant row; concurrent answers cannot lose increments.
  update public.participants set total_score = total_score + new.points_awarded
  where id = new.participant_id;
  return new;
end;
$$;
create trigger apply_submission_score after insert on public.submissions
for each row execute function public.apply_submission_score();

create function public.reject_submission_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Submissions are immutable' using errcode = '42501';
end;
$$;
create trigger reject_submission_change before update or delete on public.submissions
for each row execute function public.reject_submission_change();

create function public.submit_answer(p_participant_id uuid, p_question_id uuid, p_answer text)
returns table (submission_id uuid, is_correct boolean, points_awarded integer, total_score bigint)
language plpgsql security definer set search_path = '' as $$
declare s public.submissions%rowtype;
begin
  insert into public.submissions(participant_id, question_id, submitted_answer)
  values (p_participant_id, p_question_id, p_answer) returning * into s;
  return query select s.id, s.is_correct, s.points_awarded, p.total_score
  from public.participants p where p.id = p_participant_id;
end;
$$;

revoke all on function public.protect_participant_score(), public.grade_submission(),
  public.apply_submission_score(), public.reject_submission_change(),
  public.submit_answer(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.submit_answer(uuid, uuid, text) to service_role;

commit;
