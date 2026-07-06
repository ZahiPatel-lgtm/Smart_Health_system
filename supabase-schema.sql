-- =====================================================
-- Smart Health System — Supabase schema
-- Run this once in the Supabase SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run)
-- =====================================================

-- ─── Profiles table ──────────────────────────────────
-- One row per authenticated user, linked 1:1 to auth.users.
-- Holds the extra signup fields (name, hospital) that
-- Supabase's built-in auth.users table doesn't store.
create table if not exists public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  name      text not null,
  hospital  text not null,
  initials  text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Each user can only see and edit their own profile row.
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Profiles are editable by owner"
  on public.profiles for update
  using (auth.uid() = id);

-- ─── Auto-create a profile row on signup ─────────────
-- Reads the `name` / `hospital` passed in from
-- supabase.auth.signUp({ options: { data: { name, hospital } } })
-- and inserts a matching row here automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, hospital, initials)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.email),
    coalesce(new.raw_user_meta_data ->> 'hospital', 'Unassigned'),
    upper(left(coalesce(new.raw_user_meta_data ->> 'name', new.email), 2))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================
-- OPTIONAL — Phase 2: move uploaded CSV data out of
-- localStorage and into Postgres so it's available on
-- any device, not just the browser it was uploaded from.
-- Uncomment and adapt once you're ready for that step.
-- =====================================================

-- create table if not exists public.centre_data (
--   id           uuid primary key default gen_random_uuid(),
--   user_id      uuid not null references auth.users(id) on delete cascade,
--   dataset_type text not null,   -- 'stock' | 'footfall' | 'bed' | 'attendance' | 'scoring'
--   payload      jsonb not null,
--   uploaded_at  timestamptz not null default now()
-- );
--
-- alter table public.centre_data enable row level security;
--
-- create policy "Users manage their own centre data"
--   on public.centre_data for all
--   using (auth.uid() = user_id)
--   with check (auth.uid() = user_id);
