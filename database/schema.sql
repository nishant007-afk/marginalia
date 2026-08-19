-- Marginalia sync schema for Supabase
-- Run this once in: Supabase Dashboard > SQL Editor > New query > Run SQL

-- NOTES ---------------------------------------------------------------------
create table if not exists public.notes (
  id          uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text,
  title       text,
  content     text,
  book        text,
  author      text,
  page        text,
  source_text text,
  tags        jsonb not null default '[]'::jsonb,
  session_id  uuid,
  links       jsonb not null default '[]'::jsonb,
  created_at  timestamptz,
  updated_at  timestamptz
);

-- SESSIONS ------------------------------------------------------------------
create table if not exists public.sessions (
  id          uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  book        text,
  author      text,
  chapter     text,
  page_range  text,
  started_at  timestamptz,
  ended_at    timestamptz,
  created_at  timestamptz,
  updated_at  timestamptz
);

create index if not exists notes_user_updated
  on public.notes (user_id, updated_at);
create index if not exists sessions_user_updated
  on public.sessions (user_id, updated_at);

-- Row Level Security: each user can only see/edit their own rows -------------
alter table public.notes    enable row level security;
alter table public.sessions enable row level security;

drop policy if exists notes_own on public.notes;
create policy notes_own on public.notes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists sessions_own on public.sessions;
create policy sessions_own on public.sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);