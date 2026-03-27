-- Manus-style "Projects": persistent instructions + reference context per user.
-- Run in Supabase SQL editor after auth.users exists.

create table if not exists flowos_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  instructions text not null default '',
  context text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flowos_projects_user_idx on flowos_projects (user_id);
create index if not exists flowos_projects_updated_idx on flowos_projects (user_id, updated_at desc);

alter table flowos_projects enable row level security;

create policy "Users manage own flowos_projects"
  on flowos_projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
