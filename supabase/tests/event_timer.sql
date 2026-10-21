begin;
do $$
declare p uuid; q uuid; e jsonb; version bigint; time_left numeric;
begin
 if (public.get_event_state()->>'is_open')::boolean then raise exception 'Event must default to closed'; end if;
 if has_table_privilege('anon','public.event_control','SELECT,UPDATE') or has_table_privilege('service_role','public.event_control','UPDATE')
   or has_function_privilege('anon','public.admin_control_event(text,integer,bigint)','EXECUTE')
   or has_function_privilege('authenticated','public.get_live_question(text)','EXECUTE')
   or has_function_privilege('anon','public.assert_event_open()','EXECUTE') then raise exception 'Event permissions exposed'; end if;
 if not has_function_privilege('anon','public.get_event_state()','EXECUTE') then raise exception 'Public timer unavailable'; end if;
 insert into public.participants(name,roll_number) values('Event fixture','EVENT-'||gen_random_uuid()) returning id into p;
 insert into public.questions(question,choices,correct_answer,points,challenge_code) values('Secret until start','["A","B","C","D"]','B',19,'EVENT-TEST') returning id into q;
 begin perform * from public.get_live_question('EVENT-TEST'); raise exception 'Question revealed before start'; exception when sqlstate 'P0101' then null; end;
 begin perform public.submit_answer(p,q,'B'); raise exception 'Submission accepted before start'; exception when sqlstate 'P0101' then null; end;
 version:=(public.get_event_state()->>'version')::bigint;
 e:=public.admin_control_event('set_time',120,version);
 if (e->>'is_open')::boolean or (e->>'duration_seconds')::int<>120 then raise exception 'Saving duration opened event'; end if;
 e:=public.admin_control_event('start',60,(e->>'version')::bigint);
 if not (e->>'is_open')::boolean then raise exception 'Start did not open event'; end if;
 if not exists(select 1 from public.get_live_question('EVENT-TEST') where id=q and question='Secret until start') then raise exception 'Live question unavailable'; end if;
 begin perform public.admin_control_event('stop',null,version); raise exception 'Stale admin change accepted'; exception when serialization_failure then null; end;
 e:=public.admin_control_event('set_time',180,(e->>'version')::bigint);
 time_left:=extract(epoch from (e->>'ends_at')::timestamptz-(e->>'server_time')::timestamptz);
 if time_left<179 or time_left>180 then raise exception 'Remaining time adjustment failed'; end if;
 begin perform public.admin_control_event('start',180,(e->>'version')::bigint); raise exception 'Already-live start accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.admin_control_event('set_time',0,(e->>'version')::bigint); raise exception 'Zero duration accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.admin_control_event('set_time',86401,(e->>'version')::bigint); raise exception 'Excess duration accepted'; exception when invalid_parameter_value then null; end;
 -- Wall-clock expiry is checked in the DB; no browser timer or scheduled worker.
 update public.event_control set ends_at=clock_timestamp()-interval '1 second' where id=1;
 if (public.get_event_state()->>'is_open')::boolean then raise exception 'Expired event still open'; end if;
 begin perform * from public.get_live_question('EVENT-TEST'); raise exception 'Question visible after expiry'; exception when sqlstate 'P0101' then null; end;
 begin perform public.submit_answer(p,q,'B'); raise exception 'Late submission accepted'; exception when sqlstate 'P0101' then null; end;
 if exists(select 1 from public.submissions where participant_id=p) or (select claimed_at from public.questions where id=q) is not null then raise exception 'Closed-event request mutated scores/claims'; end if;
 e:=public.admin_control_event('set_time',60,(e->>'version')::bigint);
 if (e->>'is_open')::boolean then raise exception 'Adjusting expired timer silently restarted event'; end if;
 e:=public.admin_control_event('start',60,(e->>'version')::bigint);
 perform public.submit_answer(p,q,'B');
 if (select total_score from public.participants where id=p)<>19 then raise exception 'Live score failed'; end if;
 e:=public.admin_control_event('stop',null,(e->>'version')::bigint);
 if (e->>'is_open')::boolean then raise exception 'Stop failed'; end if;
 begin perform * from public.get_live_question('EVENT-TEST'); raise exception 'Question visible after stop'; exception when sqlstate 'P0101' then null; end;
 e:=public.admin_control_event('start',60,(e->>'version')::bigint);
 if (select total_score from public.participants where id=p)<>19 or not exists(select 1 from public.questions where id=q and claimed_at is not null and not active) then raise exception 'Restart reset event history'; end if;
end;
$$;
rollback;
