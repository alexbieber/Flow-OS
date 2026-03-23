-- Credits for free tier (refill every N hours). Run in Supabase SQL editor.

-- user_id should match auth.users(id) for real accounts; no FK so demo UUIDs still work.
create table if not exists user_credits (
  user_id uuid primary key,
  credits integer not null default 10,
  last_refill timestamptz not null default now(),
  total_runs integer not null default 0
);

create index if not exists user_credits_user_id_idx on user_credits (user_id);

alter table user_credits enable row level security;

-- Users can read their own balance (optional client-side)
create policy "Users can read own credits"
  on user_credits for select
  using (auth.uid() = user_id);

-- Inserts/updates from service role (API) bypass RLS
