begin;

create table public.participant_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  participant_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at)
);
create index participant_sessions_participant_idx on public.participant_sessions(participant_id);
create index participant_sessions_expiry_idx on public.participant_sessions(expires_at);
alter table public.participant_sessions enable row level security;
revoke all on public.participant_sessions from public, anon, authenticated, service_role;
grant select, delete on public.participant_sessions to service_role;

create function public.register_participant(p_name text, p_roll_number text, p_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare participant uuid;
begin
  if p_name is null or length(btrim(p_name)) not between 2 and 100
    or p_roll_number is null or btrim(p_roll_number) !~ '^[A-Za-z0-9][A-Za-z0-9/_-]{1,49}$' then
    raise exception 'Invalid registration details' using errcode = '22023';
  end if;
  insert into public.participants(name, roll_number)
  values (btrim(p_name), upper(btrim(p_roll_number))) returning id into participant;
  insert into public.participant_sessions(token_hash, participant_id, expires_at)
  values (p_token_hash, participant, now() + interval '24 hours');
  return participant;
end;
$$;
revoke all on function public.register_participant(text,text,text) from public, anon, authenticated;
grant execute on function public.register_participant(text,text,text) to service_role;
commit;
