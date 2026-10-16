begin;
do $$
declare dashboard jsonb; q uuid; p uuid; attempts boolean; i integer; row record;
begin
  if has_function_privilege('anon','public.admin_get_dashboard(integer)','EXECUTE')
    or has_function_privilege('authenticated','public.admin_export_results()','EXECUTE')
    or has_function_privilege('anon','public.admin_claim_login_attempt(text)','EXECUTE')
    or has_table_privilege('anon','public.questions','INSERT') then raise exception 'Admin operations exposed to ordinary users'; end if;
  for i in 1..10 loop
    if not public.admin_claim_login_attempt(repeat('d',64)) then raise exception 'Rate limiter rejected too early'; end if;
  end loop;
  if public.admin_claim_login_attempt(repeat('d',64)) then raise exception 'Rate limit was not enforced'; end if;
  if public.admin_claim_login_attempt('invalid') then raise exception 'Invalid rate key accepted'; end if;
  for i in 1..39 loop
    if not public.admin_claim_login_attempt(lpad(to_hex(i),64,'0')) then raise exception 'Global rate limiter rejected too early'; end if;
  end loop;
  if public.admin_claim_login_attempt(repeat('e',64)) then raise exception 'Global rate limit not enforced'; end if;
  insert into public.participants(name,roll_number) values('Admin result test','ADMIN-' || gen_random_uuid()::text) returning id into p;
  insert into public.questions(question,category,difficulty,correct_answer,points) values('Admin fixture','Test','medium','yes',12) returning id into q;
  perform public.submit_answer(p,q,'yes');
  dashboard:=public.admin_get_dashboard(1);
  if (dashboard->>'participantCount')::bigint <> (select count(*) from public.participants)
    or (dashboard->>'questionCount')::bigint <> (select count(*) from public.questions)
    or (dashboard->>'submissionCount')::bigint <> (select count(*) from public.submissions) then raise exception 'Incorrect admin counts'; end if;
  if not exists(select 1 from jsonb_array_elements(dashboard->'participants') t where t->>'id'=p::text) then raise exception 'Participant missing from admin view'; end if;
  select * into row from public.admin_export_results() where roll_number=(select roll_number from public.participants where id=p);
  if row.total_score <> 12 or row.attempts <> 1 or row.correct_answers <> 1 then raise exception 'Export totals are incorrect'; end if;
  update public.questions set question='Edited fixture',category='Updated',difficulty='hard',correct_answer='new',points=99,active=false where id=q;
  if (select total_score from public.participants where id=p) <> 12 then raise exception 'Editing question changed historical score'; end if;
  with added as (
    insert into public.questions(question,category,difficulty,correct_answer,points)
    select 'Pagination fixture ' || n::text,'Test','easy','yes',0 from generate_series(1,51) n returning id
  ) insert into public.submissions(participant_id,question_id,submitted_answer) select p,id,'yes' from added;
  if jsonb_array_length(public.admin_get_dashboard(1)->'submissions') <> 50
    or jsonb_array_length(public.admin_get_dashboard(2)->'submissions') < 1 then raise exception 'Submission pagination failed'; end if;
  raise notice 'PASS: admin ACLs, rate limiting, counts, participant/export results and historical score preservation';
end;
$$;
set local role service_role;
insert into public.questions(question,category,difficulty,correct_answer,points,active)
values('Service admin fixture','Test','easy','yes',2,false);
update public.questions set active=true where question='Service admin fixture';
reset role;
rollback;
