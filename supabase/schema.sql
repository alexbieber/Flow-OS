-- Users vault (encrypted credentials)
create table if not exists vault (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null,
  key text not null,
  label text not null,
  value text not null,
  updated_at timestamptz default now(),
  unique(user_id, key)
);

-- Brains (community published)
create table if not exists brains (
  id text primary key,
  name text not null,
  description text not null,
  author text not null,
  category text not null,
  icon text not null,
  version text not null,
  verified boolean default false,
  trending boolean default false,
  featured boolean default false,
  installs integer default 0,
  rating numeric default 0,
  reviews integer default 0,
  estimated_time text,
  tags text[] default '{}',
  inputs jsonb default '[]',
  steps jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Runs
create table if not exists runs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null,
  brain_id text not null,
  brain_name text not null,
  brain_icon text not null,
  status text default 'queued',
  progress integer default 0,
  total_steps integer default 0,
  current_step text default '',
  logs jsonb default '[]',
  inputs jsonb default '{}',
  result jsonb,
  sandbox_id text,
  stream_url text,
  started_at timestamptz default now(),
  completed_at timestamptz,
  estimated_eta text
);

-- Jarvis messages
create table if not exists jarvis_messages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null,
  role text not null,
  content text not null,
  run_id uuid,
  brain_suggestion jsonb,
  created_at timestamptz default now()
);

-- RLS policies
alter table vault enable row level security;
alter table runs enable row level security;
alter table jarvis_messages enable row level security;

create policy "Users can manage own vault"
  on vault for all using (auth.uid() = user_id);

create policy "Users can manage own runs"
  on runs for all using (auth.uid() = user_id);

create policy "Users can manage own messages"
  on jarvis_messages for all using (auth.uid() = user_id);

-- Indexes
create index if not exists runs_user_id_idx on runs(user_id);
create index if not exists runs_status_idx on runs(status);
create index if not exists vault_user_id_idx on vault(user_id);
create index if not exists messages_user_id_idx on jarvis_messages(user_id);

-- E2B Desktop live viewer (noVNC); safe to re-run
alter table runs add column if not exists stream_url text;
