-- 0015_auth_phase1.sql
-- Phase 1 of multi-user auth (Supabase Auth). Ties festivals and the artists a
-- user follows to auth.users and scopes their RLS to the owner. Shared/public
-- data (artists, shows, the public vriendenboekje form + reactions,
-- festival_joins) stays publicly accessible. All new owner columns are nullable
-- so existing rows survive; a one-time backfill (Phase 1B) claims them for Twan.
--
-- Public /festivals/share keeps working because Phase 1B fetches it server-side
-- with the service-role key (bypasses RLS), filtered by the host user_id baked
-- into the share URL (/festivals/share/[userId]).

begin;

-- ── 1. festivals.user_id ──────────────────────────────────────────────────────
-- Owner of the festival. Nullable so existing rows don't break; backfilled later.
alter table festivals
  add column user_id uuid references auth.users (id);

create index festivals_user_id_idx on festivals (user_id);

-- ── 2. user_artists junction ──────────────────────────────────────────────────
-- Which artists each user follows. artists rows stay shared (scraper data);
-- "following" is per-user and lives here.
create table user_artists (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  artist_id  uuid        not null references artists (id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, artist_id)
);

-- Reverse lookup ("who follows this artist"); the PK already covers user_id-first.
create index user_artists_artist_id_idx on user_artists (artist_id);

-- ── 3. vriendenboekjes.host_user_id ───────────────────────────────────────────
-- The host whose link an entry was filled in under. Nullable: existing entries
-- and anonymous public submissions may have no host.
alter table vriendenboekjes
  add column host_user_id uuid references auth.users (id);

create index vriendenboekjes_host_user_id_idx on vriendenboekjes (host_user_id);

-- ── 4. RLS ────────────────────────────────────────────────────────────────────

-- 4a. festivals: replace the permissive "allow all" with owner-scoped access.
drop policy "allow all for anon" on festivals;

-- One FOR ALL policy covers select/insert/update/delete:
--   using      → which rows are visible/updatable/deletable (the caller's own)
--   with check → which rows may be inserted/updated (must be owned by caller)
create policy "festivals owner access"
  on festivals for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4b. user_artists: enable RLS, grant DML, owner-scoped policies.
alter table user_artists enable row level security;

grant select, insert, delete on user_artists to authenticated;

create policy "user_artists select own"
  on user_artists for select to authenticated
  using (auth.uid() = user_id);

create policy "user_artists insert own"
  on user_artists for insert to authenticated
  with check (auth.uid() = user_id);

create policy "user_artists delete own"
  on user_artists for delete to authenticated
  using (auth.uid() = user_id);

-- 4c. artists + shows: UNCHANGED. Their existing permissive policies keep them
--     publicly readable/writable as shared scraper data (adding an artist still
--     inserts an artists row). Intentionally not touched here.

-- 4d. vriendenboekjes: keep public read + anon insert (public form/overview stay
--     public). Add the requested owner-scoped read policy.
--     NOTE: this is currently REDUNDANT — "public read vriendenboekjes" already
--     lets authenticated users read every row (using true). It only starts to
--     matter if that public-read policy is later scoped down to anon-only.
create policy "vriendenboekjes host read"
  on vriendenboekjes for select to authenticated
  using (host_user_id = auth.uid() or host_user_id is null);

-- 4e. festival_joins: UNCHANGED (tied to a festival, no per-user column).

commit;
