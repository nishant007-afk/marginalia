-- Run this in the Supabase SQL editor to create the tables.
-- Go to https://supabase.com → your project → SQL Editor → paste and run.

-- Notes table
create table if not exists notes (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  category text not null default 'observe',
  title text default '',
  content text default '',
  book text default '',
  author text default '',
  page text default '',
  source_text text default '',
  date text default '',
  tags jsonb default '[]',
  session_id uuid,
  links jsonb default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sessions table
create table if not exists sessions (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  book text default '',
  author text default '',
  chapter text default '',
  page_range text default '',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row Level Security: users can only read/write their own data
alter table notes enable row level security;
alter table sessions enable row level security;

create policy "Users can read own notes" on notes
  for select using (auth.uid() = user_id);

create policy "Users can insert own notes" on notes
  for insert with check (auth.uid() = user_id);

create policy "Users can update own notes" on notes
  for update using (auth.uid() = user_id);

create policy "Users can delete own notes" on notes
  for delete using (auth.uid() = user_id);

create policy "Users can read own sessions" on sessions
  for select using (auth.uid() = user_id);

create policy "Users can insert own sessions" on sessions
  for insert with check (auth.uid() = user_id);

create policy "Users can update own sessions" on sessions
  for update using (auth.uid() = user_id);

create policy "Users can delete own sessions" on sessions
  for delete using (auth.uid() = user_id);

-- Index for faster queries
create index if not exists notes_user_id_idx on notes(user_id);
create index if not exists sessions_user_id_idx on sessions(user_id);
create index if not exists notes_updated_at_idx on notes(updated_at);
