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

## Voice fixes (latest)

- **No more fake male voice.** Pitch-shifting a female voice to sound male
  was artificial and has been removed entirely. The Gospel now either uses
  a genuinely male-named voice (if the device has one) or the same voice as
  everything else — never a distorted approximation.
- **A notice appears at the bottom of the reading page** if your device has
  no male voice installed, with Samsung-specific steps to add one, and a
  button to make the app pick it up immediately afterward (it otherwise
  remembers whatever voice it originally chose).
- **"Alleluia, alleluia"** in the Gospel Acclamation is now spoken as two
  separate calls with a distinct pause between them, like a short choral
  response, instead of one rushed phrase.
- **Fixed a real bug causing missing pauses**: a safety timer meant only to
  catch a stuck utterance was firing too early on some sentences, queuing
  the next line before the phone had actually finished speaking. It's now
  set with a much safer margin.
- **Slower pace** (rate reduced again) and **longer gaps** between
  sentences and readings.
- **Stronger fix for the "dot" bug**: some sentences end with punctuation
  immediately followed by a closing quote mark (e.g. `...your face.'`),
  which the previous fix didn't catch. Both are now stripped.

## About real, higher-quality voices (future option)

Device text-to-speech (what this app uses now) is free and works offline,
but quality varies a lot by phone. A proper upgrade path later would be a
cloud TTS API — Google Cloud, Azure, or ElevenLabs all offer natural-
sounding, consistent male and female voices that would sound the same on
every device, at a small per-character cost. Worth exploring once the app
is stable and you want to invest in audio quality.
