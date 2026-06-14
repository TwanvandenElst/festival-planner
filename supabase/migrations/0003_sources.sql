-- 0003_sources.sql
-- Add a sources[] column to shows and deduplicate existing rows.
--
-- Dedup match key = (artist_id, date, fuzzy event key), where the fuzzy key
-- is the FIRST significant word of the normalized venue/title:
--   lowercase -> strip punctuation -> drop pure-number tokens (years/editions)
--   -> drop noise words (the/a/an/festival/fest/event/events/presents)
--   -> take the first remaining word.
-- This collapses prefix variants like:
--   "Awakenings Summer Festival 2026" -> "awakenings summer" -> key "awakenings"
--   "Awakenings Festival 2026"        -> "awakenings"        -> key "awakenings"
--
-- Run order matters: UPDATE survivors' sources BEFORE deleting duplicates,
-- because the source_site values to aggregate live on the duplicate rows.
--
-- CAVEATS:
--  * Titles that are entirely noise/number/null collapse to key '' and merge
--    per (artist_id, date). Rare; acceptable.
--  * Deleting duplicate shows cascades to any notifications rows that
--    reference them (shows -> notifications ON DELETE CASCADE).

begin;

-- ── Temp helper: first significant word of a normalized title ──────────────────
-- Lives in pg_temp; auto-dropped at session end. The orchestrator (TypeScript)
-- mirrors this exact logic in a normalize() helper.
create or replace function pg_temp.fuzzy_event_key(raw text)
returns text
language sql
immutable
as $$
  select coalesce(
    (
      select w
      from unnest(
        regexp_split_to_array(
          regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9]+', ' ', 'g'),
          '\s+'
        )
      ) with ordinality as t(w, ord)
      where w <> ''
        and w !~ '^[0-9]+$'  -- drop pure numbers: years (2026) and editions
        and w not in ('the', 'a', 'an', 'festival', 'fest', 'event', 'events', 'presents')
      order by ord
      limit 1
    ),
    ''
  );
$$;

-- ── 1. Add the sources column ─────────────────────────────────────────────────
alter table shows
  add column sources text[] not null default array[]::text[];

-- ── 2. Set sources on the survivor of each group ──────────────────────────────
-- Survivor = earliest found_at (id as tiebreak). sources = distinct non-null
-- source_site values across the whole group. Single-row groups yield
-- ARRAY[source_site] from this same aggregate.
with grouped as (
  select
    id,
    source_site,
    first_value(id) over (
      partition by artist_id, date, pg_temp.fuzzy_event_key(venue)
      order by found_at asc, id asc
    ) as survivor_id
  from shows
),
survivors as (
  select
    survivor_id,
    array_agg(distinct source_site) filter (where source_site is not null) as sources
  from grouped
  group by survivor_id
)
update shows s
set sources = coalesce(sv.sources, array[]::text[])
from survivors sv
where s.id = sv.survivor_id;

-- ── 3. Delete the duplicate (non-survivor) rows ───────────────────────────────
with grouped as (
  select
    id,
    first_value(id) over (
      partition by artist_id, date, pg_temp.fuzzy_event_key(venue)
      order by found_at asc, id asc
    ) as survivor_id
  from shows
)
delete from shows
where id in (
  select id from grouped where id <> survivor_id
);

commit;
