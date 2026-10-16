begin;
create table public.api_request_limits (
  scope text not null,
  key text not null,
  attempts integer not null,
  window_started timestamptz not null,
  primary key(scope,key)
);
alter table public.api_request_limits enable row level security;
revoke all on public.api_request_limits from public, anon, authenticated, service_role;

-- Limits are shared by all app processes. Client-supplied forwarding headers
-- are deliberately not used; everyone on the college Wi-Fi shares a budget.
create function public.claim_api_request(p_scope text, p_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare budget integer; tries integer;
begin
  if p_scope = 'registration' and p_key = 'global' then budget := 300;
  elsif p_scope = 'submission' and p_key ~ '^[a-f0-9-]{36}$' then budget := 30;
  else return false; end if;
  insert into public.api_request_limits as a values(p_scope,p_key,1,clock_timestamp())
  on conflict(scope,key) do update set
    attempts = case when a.window_started <= clock_timestamp()-interval '1 minute' then 1 else least(a.attempts+1,301) end,
    window_started = case when a.window_started <= clock_timestamp()-interval '1 minute' then clock_timestamp() else a.window_started end
  returning attempts into tries;
  return tries <= budget;
end;
$$;
revoke all on function public.claim_api_request(text,text) from public, anon, authenticated;
grant execute on function public.claim_api_request(text,text) to service_role;

-- Logout must invalidate a copied signed cookie, not just clear this browser.
create table public.revoked_admin_sessions (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
  revoked_at timestamptz not null default clock_timestamp()
);
alter table public.revoked_admin_sessions enable row level security;
revoke all on public.revoked_admin_sessions from public, anon, authenticated, service_role;
grant select on public.revoked_admin_sessions to service_role;
create function public.revoke_admin_session(p_token_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.revoked_admin_sessions where revoked_at < clock_timestamp()-interval '5 hours';
  insert into public.revoked_admin_sessions(token_hash) values(p_token_hash) on conflict do nothing;
end;
$$;
revoke all on function public.revoke_admin_session(text) from public, anon, authenticated;
grant execute on function public.revoke_admin_session(text) to service_role;
commit;
