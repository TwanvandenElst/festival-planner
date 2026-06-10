# Artist Tracker App

## What this project is
A personal web app (PWA) that tracks when specific artists perform in
the Netherlands (parties, festivals, concerts). The app scrapes a set of
event/festival agenda websites on a weekly basis, checks whether a
followed artist is performing, checks whether I'm free that day, and
sends a notification. Every show found is stored per artist in a profile
so I can always look back.

## User
Single user (myself). No multi-tenant needed, but keep the code clean as
if it could grow later.

## Stack
- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase (Postgres + auth)
- Vercel (hosting + cron jobs)
- Cheerio for simple scraping, Playwright where JS rendering is needed
- Notifications: Telegram bot (web push possibly later)

## Project structure
- No `src/` directory. Application code lives directly under `app/`.
- Scrapers live in `app/lib/scrapers/<sitename>.ts`.
- Shared utilities live in `app/lib/`.

## Conventions
- TypeScript strict; avoid `any` unless truly necessary
- Server logic lives in API routes / server actions; never leak secrets
  to the client
- One scraper per site in `app/lib/scrapers/<sitename>.ts`, all
  implementing a shared interface (see below)
- Write small, testable functions
- Prefer clarity over cleverness

## Roadmap / build order
1. Supabase data model + base PWA shell
2. Artist management (add / list / remove followed artists)
3. Scrapers for the first few sites + a shared scraper interface
4. Weekly cron job that runs scrapers and stores shows
5. Notifications via Telegram
6. Artist profile pages (history of all found shows)
7. (LAST) Google Calendar integration to check availability

## Calendar
Google Calendar integration is planned but is the LAST feature we build.
Until then, the "am I free that day" check is out of scope — do not build
it yet.

## Data model (first draft)
- artists: id, name, created_at
- shows: id, artist_id, date, venue, city, source_url, source_site,
  found_at
- notifications: id, show_id, sent_at, was_free (bool, nullable for now)

## Scraper interface (first draft)
Each scraper exports a function returning a normalized list of:
{ artistName, date, venue, city, sourceUrl }
The orchestrator matches artistName against followed artists.

## Working agreement with the AI assistant
- Go step by step. Make one focused change at a time.
- Explain what you are about to do before doing it.
- Do not skip ahead in the roadmap without checking in.

## Future ideas (do NOT build yet)
- Festival/shows page should later support filtering between shows I'm
  already attending vs shows where a followed artist plays but I'm not
  attending yet. Requires tracking an 'attending' status per show. Build
  only after the core tracker is solid.