begin;
do $start$ begin
if to_regprocedure('public.admin_control_event(text,integer,bigint)') is not null then
 perform public.admin_control_event('start',3600,(public.get_event_state()->>'version')::bigint);
end if;
end; $start$;
do $$
declare a uuid; b uuid; c uuid; q uuid; invalid uuid; r record;
begin
 insert into public.participants(name,roll_number) values('MCQ A','MCQ-A-'||gen_random_uuid()) returning id into a;
 insert into public.participants(name,roll_number) values('MCQ B','MCQ-B-'||gen_random_uuid()) returning id into b;
 insert into public.participants(name,roll_number) values('MCQ C','MCQ-C-'||gen_random_uuid()) returning id into c;
 insert into public.questions(question,choices,correct_answer,points) values('MCQ test','["yes","no","maybe","unknown"]','yes',17) returning id into q;
 insert into public.questions(question,choices,correct_answer,points) values('Invalid option test','["yes","no","maybe","unknown"]','yes',23) returning id into invalid;
 select * into r from public.submit_answer(a,q,'no');
 if r.is_correct or r.points_awarded<>0 or (select claimed_at from public.questions where id=q) is not null then raise exception 'Wrong choice closed or scored'; end if;
 begin perform public.submit_answer(a,q,'yes'); raise exception 'Duplicate accepted'; exception when unique_violation then null; end;
 begin perform public.submit_answer(c,invalid,'forged'); raise exception 'Invalid choice accepted'; exception when invalid_parameter_value then null; end;
 if exists(select 1 from public.submissions where participant_id=c and question_id=invalid) then raise exception 'Invalid choice consumed attempt'; end if;
 select * into r from public.submit_answer(b,q,'yes');
 if not r.is_correct or r.points_awarded<>17 or r.total_score<>17 then raise exception 'Correct choice failed'; end if;
 if not exists(select 1 from public.questions where id=q and not active and claimed_at is not null and claimed_by=b) then raise exception 'QR did not expire'; end if;
 begin perform public.submit_answer(c,q,'yes'); raise exception 'Second winner accepted'; exception when raise_exception then if SQLERRM<>'Challenge has expired' then raise; end if; end;
 begin perform public.submit_answer(b,q,'yes'); raise exception 'Winning participant retried'; exception when unique_violation then null; end;
 begin update public.questions set active=true where id=q; raise exception 'Expired question reactivated'; exception when insufficient_privilege then null; end;
 begin update public.questions set claimed_at=null,claimed_by=null where id=q; raise exception 'Claim reset'; exception when insufficient_privilege then null; end;
 begin insert into public.questions(question,choices,correct_answer,points) values('Bad MCQ','["A","A","B","C"]','A',1); raise exception 'Repeated choices accepted'; exception when check_violation then null; end;
 begin insert into public.questions(question,choices,correct_answer,points) values('Bad answer','["A","B","C","D"]','E',1); raise exception 'Unknown correct answer accepted'; exception when check_violation then null; end;
 if (select sum(total_score) from public.participants where id in(a,b,c))<>17 then raise exception 'Score drift'; end if;
 if exists(select 1 from public.participants where roll_number='MCQ-HISTORY' and total_score<>7) then raise exception 'Historical score changed'; end if;
 if exists(select 1 from public.questions where question='Historical question' and (claimed_at is null or active)) then raise exception 'Historical winner not preserved'; end if;
 if has_column_privilege('anon','public.questions','choices','SELECT') or has_column_privilege('service_role','public.questions','claimed_at','UPDATE') then raise exception 'Question permission leak'; end if;
 if (select count(*) from public.questions where challenge_code ~ '^Q00[1-9]$|^Q010$' and public.valid_mcq(choices,correct_answer))<>10 then raise exception 'Sample MCQs not converted'; end if;
end;
$$;
rollback;
