-- 0005_festivals_v2.sql
-- Festivals v2: distinguish start/end dates, add attendance status and rating.

begin;

-- 1. Rename `date` -> `start_date` (type/not-null preserved by rename).
alter table festivals rename column date to start_date;

-- Keep the index name in sync with the renamed column.
alter index festivals_date_idx rename to festivals_start_date_idx;

-- 2. Optional end date (e.g. multi-day / weekend festivals).
alter table festivals add column end_date date;

-- 3. Attendance status. Existing rows get the default 'wishlist'.
alter table festivals
  add column status text not null default 'wishlist'
  constraint festivals_status_check
  check (status in ('tickets_gekocht', 'in_optie', 'wishlist'));

-- 4. Optional 1–10 rating.
alter table festivals
  add column rating smallint
  constraint festivals_rating_check
  check (rating is null or (rating between 1 and 10));

commit;
