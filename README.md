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

---

# HD voices with Google Cloud Text-to-Speech (new)

The app now plays a **pre-generated HD recording** of each day's readings
(Google Cloud TTS: male voice for the blessing and Gospel, female for the
rest, church bell first, proper pauses, "Alleluia … Alleluia" as a
call-and-response). If no recording exists for a date — older archive dates,
or if generation ever fails — the app quietly falls back to the phone's
built-in voice, so nothing breaks. A small "HD voice" / "Device voice" label
under the Listen button shows which is playing.

Audio is generated **once per day for everyone** (not per listener), so a
typical month uses ~100–150k characters — well inside Google's permanent
free tier of 1,000,000/month for these voices. Expected cost: **$0**.

## How it works

1. `scripts/generate-audio.js` fetches the day's readings, builds SSML, calls
   Google TTS, stitches bell + sections into `public/audio/YYYY-MM-DD.mp3`
   and writes `YYYY-MM-DD.json` (section timings for highlighting).
2. A GitHub Action (`.github/workflows/generate-audio.yml`) runs it every
   night at **00:30 South Africa time** and commits the files. Vercel
   redeploys automatically. Audio older than 14 days is pruned.
3. The app checks `/audio/<date>.json`; if present it plays the MP3.

## Safety limits (built in)

- One date per run, no retry loops.
- Hard cap: the script **refuses to run** if a day would exceed 12,000
  characters (a real day is ~3–5k).
- `--dry-run` shows exactly what would be sent, at zero cost.

## One-time setup

### A) Test locally first (recommended)

In Git Bash, inside `daily-mass-pwa`:

```bash
npm install

# point at your key (adjust the filename to your actual .json key)
export GOOGLE_APPLICATION_CREDENTIALS="/c/Users/joao/Documents/Daily Mass Files Assets/YOUR-KEY-FILE.json"

# 1) zero-cost check: fetches readings and prints the plan
npm run generate-audio -- --dry-run

# 2) real run for today (uses ~3–5k characters of your free tier)
npm run generate-audio

# 3) preview: start the app and press Listen — label should say "HD voice"
npm run dev
```

Optional — hear other voices: `npm run list-voices`, then set
`TTS_MALE_VOICE` / `TTS_FEMALE_VOICE` (e.g. `en-GB-Neural2-B`) before running.

### B) Add the key to GitHub (so the nightly job can run)

1. Open your key `.json` in Notepad and copy **all** of its contents.
2. GitHub → your `catholic-daily-mass` repo → **Settings → Secrets and
   variables → Actions → New repository secret**
3. Name: `GOOGLE_CREDENTIALS_JSON` — Value: paste the JSON — **Add secret**.

### C) Run it manually once before trusting the schedule

GitHub → **Actions** tab → **Generate daily Mass audio** → **Run workflow**
(leave date blank). Watch it complete, then check that
`public/audio/<today>.mp3` appeared in the repo and Vercel redeployed.
After that, the nightly schedule takes care of itself.

## Notes

- **Never commit the key file.** `.gitignore` blocks the usual key filenames,
  and your key lives outside the project folder anyway.
- Audio uses the **General** Universalis calendar (readings are the same
  across regions; only local feast titles differ).
- The generator uses the same official Universalis webmaster feed the app
  already displays. If the audience grows substantially, it's worth a
  courtesy email to Universalis confirming audio use is fine with them.
- Google Actions runners include `ffmpeg`, so the bell and speech are
  re-encoded into one clean MP3. Locally without ffmpeg, files are simply
  joined (still plays; install ffmpeg for best results).

---

# Daily reflection (Claude API)

A short, quiet devotional reflection on the day's readings, generated once
per day for everyone (same cost-safe pattern as the audio), and revealed
behind a button on the reading page. Always labelled as AI-generated, offered
for personal reflection — never presented as official teaching or a homily.

**Cost:** effectively nothing — a few hundred words per day, once for
everyone, using a small fast model.

## One-time setup

1. Get an API key at **console.anthropic.com** (Settings → API Keys)
2. GitHub → your repo → **Settings → Secrets and variables → Actions →
   New repository secret**
   Name: `ANTHROPIC_API_KEY` — Value: paste your key

## Test locally first

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
node scripts/generate-reflection.js --dry-run   # zero cost, shows the prompt
node scripts/generate-reflection.js             # real run for today
npm run dev                                     # check the button appears
```

## How it fits in

- Runs automatically as part of the same nightly GitHub Action as the audio.
- If it ever fails, it does **not** block the audio from being generated —
  the reflection is a bonus feature, not core.
- If no reflection exists for a date, the button simply doesn't appear —
  no error shown to the reader.
- The prompt deliberately asks for a *gentle, contemplative* reflection,
  not analysis or doctrine, and explicitly avoids inventing claims not in
  the text. Worth spot-checking the tone occasionally, especially early on.

## Reflection now includes HD audio (Google Cloud TTS)

The daily reflection is now spoken in the same voice quality as the
readings (Google Cloud TTS), not the device's built-in voice — avoiding
the jarring quality drop between a polished HD reading and a robotic
device voice for the reflection right after it.

- Uses the **same voice** as the readings (`en-GB-Neural2-A` by default)
- Generated as part of the same nightly job — no separate setup needed
  beyond the `ANTHROPIC_API_KEY` and existing `GOOGLE_CREDENTIALS_JSON`
  secrets already configured
- If reflection generation fails for any reason, it does not block the
  audio — the reflection (text and audio) simply won't appear that day
- Tapping the reflection button reveals the text **and** starts playback
  together, in one action
