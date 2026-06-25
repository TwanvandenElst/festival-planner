-- 0010_vriendenboekje_reactions.sql
-- 😂 reactions on individual vriendenboekje answers. Anyone with the link can
-- react to a specific question+answer pair (identified by entry_id + field_name).
-- Reactions are publicly readable (counts + feed) and publicly insertable (tap),
-- but NOT updatable/deletable by anon — same "anon read + insert only" stance as
-- 0008_vriendenboekje.sql. No dedup: multiple taps per person each insert a row.

create table vriendenboekje_reactions (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  -- The entry this reaction belongs to; cascade so reactions vanish with the entry.
  entry_id    uuid        not null
    references vriendenboekjes (id) on delete cascade,

  -- Which answer was reacted to, e.g. 'eerste_indruk', 'seksstandje', or a
  -- stelling key like 'stelling_afterparty'. Free text (no FK to columns).
  field_name  text        not null,

  -- The emoji used. Defaults to 😂; kept as a column so we can add more later.
  reaction    text        not null default '😂'
);

-- Count/lookup reactions per answer (detail page badges + feed aggregation).
create index vriendenboekje_reactions_entry_field_idx
  on vriendenboekje_reactions (entry_id, field_name);

-- ── RLS + grants ──────────────────────────────────────────────────────────────
-- Public read + anon insert ONLY (no anon update/delete), mirroring 0008.

alter table vriendenboekje_reactions enable row level security;

grant select, insert on vriendenboekje_reactions to anon, authenticated;

create policy "public read vriendenboekje_reactions"
  on vriendenboekje_reactions for select
  to anon, authenticated
  using (true);

create policy "anon insert vriendenboekje_reactions"
  on vriendenboekje_reactions for insert
  to anon, authenticated
  with check (true);

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Let the overview feed subscribe to new reactions live.
alter publication supabase_realtime add table vriendenboekje_reactions;
