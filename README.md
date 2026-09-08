# Catholic Daily Mass — PWA

A digital missal: today's full Catholic Mass readings, readable and
listenable, installable on any phone.

## What's new in this version

- **Entrance screen**: full-width church photo, date, liturgical year, and
  a country picker, with an "Enter Today's Mass" button
- **Two photo pools**: church **exteriors** on the entrance screen, church
  **interiors/altars** once you've entered — each randomly chosen from
  whichever files you've supplied
- **Country picker**: clearer labelling, auto-detected from the device's
  language/locale on first visit, always changeable afterwards
- **Church bell + opening blessing**: when you press Listen, a bell rings,
  then a short opening blessing is spoken in the Gospel voice, then the
  readings begin
- **Fixed**: Android phones going silent after the first line (see below)
- **Unified font** throughout (previously the page background used a
  slightly different serif than headings)

## Adding photos (two pools)

Drop any number of these files into `public/` — empty slots are skipped
automatically, so you don't need all of them to start.

**Entrance screen (church exteriors):**
`church-1.jpg` through `church-6.jpg`

**Reading screen (interiors / altar during Mass):**
`church-interior-1.jpg` through `church-interior-6.jpg`

Good free, commercially-licensed picks (Unsplash License — no attribution
required) to start with:

Exteriors:
- https://unsplash.com/photos/st-peters-basilica-in-vatican-city-61rBB5NXuUw
- https://unsplash.com/photos/brown-cathedral-during-daytime-d0xjEv-WJQk
- https://unsplash.com/photos/brown-concrete-cathedral-during-daytime-dvNhfTLVWYs

Interiors / altar:
- https://unsplash.com/photos/sunlight-beams-inside-ornate-cathedral--0gBnnMdQPw
- https://unsplash.com/photos/church-interior-GxbFfu6yRN0
- https://unsplash.com/photos/the-interior-of-a-church-with-gold-decorations-4kB471fxQnA
- https://unsplash.com/photos/a-cathedral-with-a-large-stained-glass-window-5BksR6Ne-Vo

Click through, use Unsplash's own **Download** button, then rename and place
each file (watch out for a double `.jpg.jpg` extension — Windows sometimes
does this if you retype the extension when renaming).

## The church bell

`public/church-bell.mp3` is now your real recording (the 4-second version).
The app plays it automatically when Listen is pressed, falling back to a
synthesised chime only if that file is ever missing or fails to load.

Two alternates are included in `bell-alternates/` (9-second and 14-second
versions) if you'd rather use a longer ring later — just copy whichever one
you prefer over `public/church-bell.mp3` and rebuild.

## About the opening blessing

The free Universalis feed this app uses only provides the Mass **readings**
— it does not include the actual daily **Entrance Antiphon** (that's part of
Universalis's fuller product, not their free webmaster service). Rather than
guess or misrepresent a day-specific liturgical text, the app currently
speaks a short, generic opening blessing instead: *"In the name of the
Father, and of the Son, and of the Holy Spirit. Let us prepare our hearts to
hear the Word of the Lord."* If you'd like the actual daily Entrance
Antiphon, that would need a different data source (e.g. Universalis's paid
API) — worth investigating separately if this matters to you.

## The Android silent-audio bug — what was actually wrong

An earlier version periodically paused and resumed the speech engine to
work around a *desktop Chrome* bug. On Android, that same trick silently
breaks the phone's native speech engine — the app kept reporting "still
playing" while no sound was actually coming out. That workaround has been
removed entirely; Android should now play a full reading start to finish
without going silent.

## Run and deploy

```bash
npm install
npm run dev        # local preview
npm run build      # production build in dist/
```

Push to GitHub, import to Vercel (Vite auto-detected) — `vercel.json`
already has the SPA rewrites configured.

## Phase 2 ideas (not built yet)

- Push notifications (VAPID key isolated in `src/pushConfig.js`, dormant
  until filled in)
- Multiple languages (Spanish, French, Portuguese)
- Google Play via TWA (Play Console already approved)
- Sourcing the real daily Entrance Antiphon if a fuller data feed is added
