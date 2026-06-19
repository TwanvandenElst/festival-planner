-- 0007_festival_joins.sql
-- "Join festival" sign-ups from the public share page: anyone with the share
-- link can add their name to a festival they're also attending.

create table festival_joins (
  id          uuid        primary key default gen_random_uuid(),
  festival_id uuid        not null references festivals(id) on delete cascade,
  name        text        not null,
  created_at  timestamptz not null default now()
);

create index festival_joins_festival_id_idx on festival_joins (festival_id);

-- ── RLS + grants (consistent with 0002_policies.sql / 0004_festivals.sql) ──────
-- Enable RLS, grant the API roles DML, and add one permissive policy. This table
-- is intentionally public-writable: the share link is unauthenticated, so anyone
-- with it must be able to INSERT a join (with check (true) allows that).

alter table festival_joins enable row level security;

grant select, insert, update, delete on festival_joins to anon, authenticated;

create policy "allow all for anon" on festival_joins for all to anon, authenticated using (true) with check (true);
