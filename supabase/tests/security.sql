begin;
do $$
declare r text; t text; i integer; p text := '11111111-1111-4111-8111-111111111111';
begin
  foreach r in array array['anon','authenticated'] loop
    foreach t in array array['participants','questions','submissions','participant_sessions','admin_login_attempts','api_request_limits','revoked_admin_sessions','leaderboard_notification_gate'] loop
      if has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE')
        or has_any_column_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE') then raise exception 'Exposed table: % %',r,t; end if;
      if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'Missing RLS: %',t; end if;
    end loop;
    if has_function_privilege(r,'public.submit_answer(uuid,uuid,text)','EXECUTE')
      or has_function_privilege(r,'public.register_participant(text,text,text)','EXECUTE')
      or has_function_privilege(r,'public.claim_api_request(text,text)','EXECUTE')
      or has_function_privilege(r,'public.revoke_admin_session(text)','EXECUTE') then raise exception 'Privileged RPC exposed'; end if;
    if not has_function_privilege(r,'public.get_leaderboard()','EXECUTE') then raise exception 'Public leaderboard unavailable'; end if;
  end loop;
  for i in 1..100 loop
    if not public.claim_api_request('registration','global') then raise exception '100-student registration rejected'; end if;
    if not public.claim_api_request('submission',lpad(to_hex(i),8,'0')||'-1111-4111-8111-111111111111') then raise exception '100-student submissions rejected'; end if;
  end loop;
  for i in 1..30 loop
    if not public.claim_api_request('submission',p) then raise exception 'Submission limit rejected early'; end if;
  end loop;
  if public.claim_api_request('submission',p) then raise exception 'Submission abuse accepted'; end if;
  update public.api_request_limits set window_started=clock_timestamp()-interval '61 seconds' where key=p;
  if not public.claim_api_request('submission',p) then raise exception 'Limiter did not recover'; end if;
  if public.claim_api_request('invented','global') then raise exception 'Invalid scope accepted'; end if;
  perform public.revoke_admin_session(repeat('a',64));
  perform public.revoke_admin_session(repeat('a',64));
  if (select count(*) from public.revoked_admin_sessions where token_hash=repeat('a',64)) <> 1 then raise exception 'Revocation not idempotent'; end if;
end;
$$;
rollback;
