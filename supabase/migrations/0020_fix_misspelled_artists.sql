-- 0020_fix_misspelled_artists.sql
-- One-off data cleanup of misspelled / duplicate followed-artist rows that broke
-- scraper matching. All affected follows belong to a single user.
--
--   * "Lisan Korver" (typo, 0 shows) → move the follow onto "lisa korver" (the
--     row the scraper already matched 6 shows to), drop the typo row, then fix
--     the survivor's casing to "Lisa Korver".
--   * "Anna Reusch" duplicated → keep one row, drop the redundant duplicate.
--   * "Cosmic Gates" → "Cosmic Gate" (rename only).
--
-- Safe because every deleted row has 0 shows, and user_artists.artist_id is
-- ON DELETE CASCADE, so redundant follows on a deleted row drop automatically.

begin;

-- 1. Lisan Korver → lisa korver (which already holds the 6 matched shows).
insert into user_artists (user_id, artist_id)
select user_id, '37b26134-1a9a-478b-93d6-f8013bf45b27'
from user_artists
where artist_id = '1535046b-eb2b-4133-885f-d4037f283d90'
on conflict (user_id, artist_id) do nothing;

delete from artists where id = '1535046b-eb2b-4133-885f-d4037f283d90';

update artists set name = 'Lisa Korver'
where id = '37b26134-1a9a-478b-93d6-f8013bf45b27';

-- 2. Anna Reusch duplicate → keep a59a955e…, drop d16d0e80… (same user follows both).
delete from artists where id = 'd16d0e80-8f41-4200-bbe7-9bb889d7a180';

-- 3. Cosmic Gates → Cosmic Gate. Remove this statement if "Cosmic Gates" is intentional.
update artists set name = 'Cosmic Gate'
where id = 'd700be7c-7a7f-4c85-b997-7ad0d0bf4f10';

commit;
