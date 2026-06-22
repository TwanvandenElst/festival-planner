-- 0009_vriendenboekje_optional.sql
-- Decision 1: let people skip the daring questions — drop NOT NULL on the four
-- "spicy" open questions so the form can submit them as null when skipped.
-- Decision 2: provision the public Storage bucket for optional photo uploads.

alter table vriendenboekjes
  alter column beschamend     drop not null,
  alter column seksstandje    drop not null,
  alter column laatste_google drop not null,
  alter column ja_zeggen      drop not null;

-- ── Storage: public "vriendenboekje" bucket with anon upload ──────────────────
insert into storage.buckets (id, name, public)
values ('vriendenboekje', 'vriendenboekje', true)
on conflict (id) do nothing;

create policy "vriendenboekje anon upload"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'vriendenboekje');

create policy "vriendenboekje public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'vriendenboekje');
