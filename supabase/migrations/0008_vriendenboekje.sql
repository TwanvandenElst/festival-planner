-- 0008_vriendenboekje.sql
-- "Vriendenboekje": public friend-book entries. Anyone with the link can fill in
-- a playful questionnaire about themselves. Entries are publicly readable (the
-- overview lists them) and publicly insertable (the form), but NOT updatable or
-- deletable by anon — matching the requested "anon read + insert only" RLS.

create table vriendenboekjes (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  -- ── Identity ───────────────────────────────────────────────────────────────
  naam        text        not null,
  dj_naam     text,                            -- optional self-given DJ name

  -- ── Open questions ─────────────────────────────────────────────────────────
  ontmoet         text    not null,            -- "Hoe hebben we elkaar ontmoet?"
  eerste_indruk   text    not null,            -- "Wat was je eerste indruk van mij?"
  beschamend      text    not null,            -- most embarrassing festival moment
  seksstandje     text    not null,            -- favorite position
  laatste_google  text    not null,            -- last thing googled
  ja_zeggen       text    not null,            -- how long before saying 'ja' to something dumb

  -- ── Multiple choice (text + check, matching 0005 enum style) ───────────────
  dancefloor  text not null
    constraint vriendenboekjes_dancefloor_check
    check (dancefloor in ('front', 'back', 'bar')),

  naar_huis   text not null
    constraint vriendenboekjes_naar_huis_check
    check (naar_huis in ('voor_middernacht', 'als_muziek_stopt', 'wat_is_naar_huis')),

  -- ── Dance self-rating, 1–10 ────────────────────────────────────────────────
  dans_zelf   smallint not null
    constraint vriendenboekjes_dans_zelf_check  check (dans_zelf  between 1 and 10),
  dans_denkt  smallint not null
    constraint vriendenboekjes_dans_denkt_check check (dans_denkt between 1 and 10),

  -- ── Stellingen: eens (true) / oneens (false) + optional toelichting ────────
  -- All optional: the user may skip a stelling entirely (boolean null).
  stelling_afterparty              boolean,
  stelling_afterparty_toelichting  text,
  stelling_gekust                  boolean,
  stelling_gekust_toelichting      text,
  stelling_festivaldag             boolean,
  stelling_festivaldag_toelichting text,
  stelling_beland                  boolean,
  stelling_beland_toelichting      text,

  -- ── Closing (all optional) ─────────────────────────────────────────────────
  afsluiting      text,                         -- one thing to be remembered by
  foto_url        text,                         -- uploaded photo URL
  telefoonnummer  text                          -- optional phone number
);

-- Overview lists newest first.
create index vriendenboekjes_created_at_idx on vriendenboekjes (created_at desc);

-- ── RLS + grants ──────────────────────────────────────────────────────────────
-- Public read + anon insert ONLY (no anon update/delete). The fill-in link is
-- unauthenticated, so anon must be able to SELECT (overview) and INSERT (form).
-- Note: unlike 0004/0007 this intentionally does NOT grant update/delete.

alter table vriendenboekjes enable row level security;

grant select, insert on vriendenboekjes to anon, authenticated;

create policy "public read vriendenboekjes"
  on vriendenboekjes for select
  to anon, authenticated
  using (true);

create policy "anon insert vriendenboekjes"
  on vriendenboekjes for insert
  to anon, authenticated
  with check (true);
