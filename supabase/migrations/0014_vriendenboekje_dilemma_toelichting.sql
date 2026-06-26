-- 0014_vriendenboekje_dilemma_toelichting.sql
-- The `dilemma` question becomes a two-choice question ('Wanneer' / 'Hoe')
-- like the stellingen, with an optional free-text toelichting beside it. The
-- choice keeps living in the existing `dilemma` column; this adds the optional
-- toelichting column to mirror the stelling_*_toelichting pattern.
alter table vriendenboekjes
  add column if not exists dilemma_toelichting text;
