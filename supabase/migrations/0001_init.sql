-- handsup: one question per poll, one vote per (anonymous) user per poll.
-- Anonymous users get the `authenticated` role, so all grants/policies target it.

create table public.polls (
  id         uuid primary key default gen_random_uuid(),
  -- ponytail: 6 hex chars (16M codes), unique constraint rejects the rare collision; client just retries
  code       text not null unique default upper(substr(md5(random()::text), 1, 6)),
  host_id    uuid not null default auth.uid() references auth.users on delete cascade,
  question   text not null check (char_length(question) between 1 and 200),
  options    text[] not null check (array_length(options, 1) between 2 and 6),
  is_open    boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.votes (
  poll_id    uuid not null references public.polls on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  option_idx int not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

alter table public.polls enable row level security;
alter table public.votes enable row level security;

-- "Automatically expose new tables" is off, so grant explicitly. No delete for anyone.
grant select, insert, update on public.polls to authenticated;
grant select, insert, update on public.votes to authenticated;

-- polls: anyone signed in can read; only the host creates/closes their own.
create policy "polls readable" on public.polls
  for select to authenticated using (true);
create policy "host creates poll" on public.polls
  for insert to authenticated with check (host_id = (select auth.uid()));
create policy "host updates poll" on public.polls
  for update to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));

-- votes: readable so everyone sees live counts; you may only cast/change your own,
-- only while the poll is open, and only for an option that exists.
create function public.vote_allowed(p_poll_id uuid, p_option_idx int)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.polls p
    where p.id = p_poll_id
      and p.is_open
      and p_option_idx >= 0
      and p_option_idx < array_length(p.options, 1)
  );
$$;

create policy "votes readable" on public.votes
  for select to authenticated using (true);
create policy "cast own vote" on public.votes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.vote_allowed(poll_id, option_idx));
create policy "change own vote" on public.votes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.vote_allowed(poll_id, option_idx));

-- Live updates: vote changes move the bars, poll updates broadcast "closed".
alter publication supabase_realtime add table public.polls, public.votes;
