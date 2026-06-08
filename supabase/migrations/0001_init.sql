create table artists (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  created_at timestamptz not null default now()
);

create table shows (
  id          uuid        primary key default gen_random_uuid(),
  artist_id   uuid        not null references artists(id) on delete cascade,
  date        date,
  venue       text,
  city        text,
  source_url  text,
  source_site text,
  found_at    timestamptz not null default now()
);

create table notifications (
  id       uuid        primary key default gen_random_uuid(),
  show_id  uuid        not null references shows(id) on delete cascade,
  sent_at  timestamptz not null default now(),
  was_free boolean
);

create index shows_artist_id_idx on shows (artist_id);
create index shows_date_idx      on shows (date);
