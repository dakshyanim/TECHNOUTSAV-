-- Run as postgres in Supabase SQL editor. Fixtures roll back.
begin;
do $$
declare
  roll text := 'REG-' || gen_random_uuid()::text;
  identity uuid;
  stored_name text;
begin
  identity := public.register_participant(' Test Student ', roll, repeat('a',64));
  select name into stored_name from public.participants where id = identity;
  if stored_name <> 'Test Student' then raise exception 'Name normalization failed'; end if;
  if not exists (select 1 from public.participant_sessions
    where token_hash = repeat('a',64) and participant_id = identity
      and expires_at > now() and expires_at <= now() + interval '24 hours') then
    raise exception 'Session relationship/expiry failed';
  end if;
  begin
    perform public.register_participant('Other Student', lower(roll), repeat('b',64));
    raise exception 'Duplicate normalized roll number accepted';
  exception when unique_violation then null;
  end;
  if exists (select 1 from public.participant_sessions where token_hash = repeat('b',64)) then
    raise exception 'Duplicate created a session';
  end if;
  begin
    perform public.register_participant('X', 'INVALID', repeat('c',64));
    raise exception 'Invalid name accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.register_participant('Valid Student', 'ATOMIC-' || roll, 'bad-token');
    raise exception 'Invalid token accepted';
  exception when check_violation then null;
  end;
  if exists (select 1 from public.participants where roll_number = upper('ATOMIC-' || roll)) then
    raise exception 'Failed session insert left an orphan participant';
  end if;
  if has_function_privilege('anon', 'public.register_participant(text,text,text)', 'EXECUTE')
    or has_table_privilege('anon', 'public.participant_sessions', 'SELECT') then
    raise exception 'Anonymous session access allowed';
  end if;
  raise notice 'PASS: registration normalization, uniqueness, atomicity, sessions and privileges';
end;
$$;
rollback;
