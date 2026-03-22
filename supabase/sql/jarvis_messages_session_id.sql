-- Run in Supabase SQL editor (or via migration) before using session-scoped chat.

alter table jarvis_messages
add column if not exists session_id text default 'default';

create index if not exists messages_session_idx
on jarvis_messages(user_id, session_id);
