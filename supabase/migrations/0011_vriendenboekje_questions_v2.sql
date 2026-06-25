-- 0011_vriendenboekje_questions_v2.sql
-- Swap the questionnaire to a new question set. NON-DESTRUCTIVE: legacy columns
-- are kept but made nullable, so existing entries stay intact and readable, and
-- the new open questions are added as nullable text. Identity columns (naam,
-- dj_naam, telefoonnummer, foto_url) and the two kept stellingen (afterparty,
-- festivaldag) are unchanged.

-- ── Relax legacy NOT NULLs so the new form can omit them ──────────────────────
alter table vriendenboekjes
  alter column ontmoet       drop not null,
  alter column eerste_indruk drop not null,
  alter column dancefloor    drop not null,
  alter column naar_huis     drop not null,
  alter column dans_zelf     drop not null,
  alter column dans_denkt    drop not null;

-- ── New open questions (all nullable — every question is skippable) ───────────
alter table vriendenboekjes
  add column if not exists snack           text,  -- "Beschrijf jezelf als een snack"
  add column if not exists guilty_pleasure text,  -- "Wat is je guilty pleasure?"
  add column if not exists bijnaam         text,  -- "Grappigste bijnaam gekregen of gegeven?"
  add column if not exists jeugdheld       text,  -- "Jouw jeugdheld?"
  add column if not exists dilemma         text,  -- "Weten wanneer je dood gaat of weten hoe je dood gaat?"
  add column if not exists stopwoordje     text,  -- "Jouw stopwoordje?"
  add column if not exists meezingen       text,  -- "Welk nummer zing jij volle borst mee?"
  add column if not exists onthoud_mij     text;  -- "Eén ding dat ik over jou onthoud?"

-- eerste_indruk already exists (kept, now nullable). The kept stellingen
-- stelling_afterparty(+_toelichting) and stelling_festivaldag(+_toelichting)
-- already exist and are nullable — no change needed.

-- Now UNUSED by the form but kept (nullable) to preserve existing entries:
--   ontmoet, dancefloor, naar_huis, dans_zelf, dans_denkt, beschamend,
--   seksstandje, laatste_google, ja_zeggen, afsluiting,
--   stelling_gekust(+_toelichting), stelling_beland(+_toelichting).
