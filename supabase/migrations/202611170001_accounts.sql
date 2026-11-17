-- Run once in the Supabase SQL Editor. Uses the visitor's JWT, never a service-role key.
create table public.account_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload text not null check (octet_length(payload) <= 4000000),
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.account_state enable row level security;
revoke all on public.account_state from anon, authenticated;
grant select, insert, update, delete on public.account_state to authenticated;

create policy "Read own account" on public.account_state for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Create own account" on public.account_state for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update own account" on public.account_state for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own account data" on public.account_state for delete to authenticated
  using ((select auth.uid()) = user_id);

-- SECURITY INVOKER deliberately preserves row policies. No owner id is accepted as an argument.
create function public.save_account_state(expected_version bigint, encrypted_payload text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare next_version bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if expected_version = 0 then
    insert into public.account_state(user_id, payload, version)
      values (auth.uid(), encrypted_payload, 1)
      on conflict (user_id) do nothing returning version into next_version;
  else
    update public.account_state
      set payload = encrypted_payload, version = version + 1, updated_at = now()
      where user_id = auth.uid() and version = expected_version
      returning version into next_version;
  end if;
  return next_version;
end;
$$;
revoke all on function public.save_account_state(bigint, text) from public, anon;
grant execute on function public.save_account_state(bigint, text) to authenticated;
