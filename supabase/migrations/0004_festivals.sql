-- 0004_festivals.sql
-- Personal festival attendance list: festivals the user plans to attend.
-- Separate from `shows` (which are scraper-found artist performances).

create table festivals (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  date        date        not null,
  location    text,
  url         text,
  source      text,                 -- e.g. "festileaks" / "festivalinfo"
  external_id text,                 -- slug or id from the source
  created_at  timestamptz not null default now()
);

create index festivals_date_idx on festivals (date);

-- ── RLS + grants (consistent with 0002_policies.sql) ──────────────────────────
-- Enable RLS so Supabase's Data API doesn't block all access, grant the API
-- roles DML, and add one permissive policy (single-user personal app).
-- Schema usage for anon/authenticated was already granted in 0002.

alter table festivals enable row level security;

grant select, insert, update, delete on festivals to anon, authenticated;

create policy "allow all for anon" on festivals for all to anon, authenticated using (true) with check (true);
