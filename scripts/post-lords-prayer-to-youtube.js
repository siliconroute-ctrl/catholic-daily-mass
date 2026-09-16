/**
 * Catholic Daily Mass — Lord's Prayer YouTube poster (ONE-DAY SPECIAL)
 *
 * A special, extra posting for 16 September 2026 ONLY: synthesises the
 * Lord's Prayer as HD audio, packages it with a randomly-chosen backdrop
 * photo from the same pool the app and the other posting scripts use, and
 * uploads it to YouTube. YouTube only — this never posts to Facebook.
 *
 * Meant to run every 2 hours across that single day (see
 * .github/workflows/post-lords-prayer.yml) — each run is independent and
 * produces its own separate video/upload with a freshly-random backdrop.
 *
 * SAFETY:
 *  - Hard-coded to 16 September 2026 only (ALLOWED_DATE below). On any
 *    other date it exits cleanly (code 0) without generating audio,
 *    building a video, or touching YouTube — so the workflow is safe to
 *    leave in the repo indefinitely without needing to delete it
 *    afterward, and safe even if a cron catch-up fires it on a later day.
 *  - No retries, no loops — one run does at most one upload.
 *
 * Usage:
 *   node scripts/post-lords-prayer-to-youtube.js                # today, if it's the allowed date
 *   node scripts/post-lords-prayer-to-youtube.js --dry-run        # build audio+video, upload nothing
 *   node scripts/post-lords-prayer-to-youtube.js --force          # bypass the date guard, for testing
 *
 * Auth: same three secrets as post-to-youtube.js — YT_CLIENT_ID,
 * YT_CLIENT_SECRET, YT_REFRESH_TOKEN. Needs Google Cloud TTS credentials
 * too (GOOGLE_APPLICATION_CREDENTIALS), same as generate-audio.js.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import textToSpeech from "@google-cloud/text-to-speech";
import { google } from "googleapis";
import { buildVideo } from "./lib/social-video.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");

const ALLOWED_DATE = "2026-09-16"; // one-day special — see file header

const APP_URL = "https://catholic-daily-mass.vercel.app/";
const CHANNEL_URL = "https://www.youtube.com/channel/UC2NDjwPehZIdHaUt3X59zCg";
const PRIVACY_STATUS = "public";

// Same voice/pace family as the daily reflection — dignified, unhurried.
const VOICE = process.env.LORDS_PRAYER_VOICE || "en-GB-Neural2-D";
const LANGUAGE = process.env.LORDS_PRAYER_LANGUAGE || "en-GB";
const SPEAKING_RATE = 0.82;

const LORDS_PRAYER_TEXT =
  "Our Father, who art in heaven, hallowed be thy name. Thy kingdom come, thy will be done, " +
  "on earth as it is in heaven. Give us this day our daily bread, and forgive us our trespasses, " +
  "as we forgive those who trespass against us. And lead us not into temptation, but deliver us " +
  "from evil. Amen.";

// Phrase-by-phrase, so the SSML pauses land at the natural liturgical breaks
// rather than only at sentence boundaries.
const LORDS_PRAYER_PHRASES = [
  "Our Father, who art in heaven,",
  "hallowed be thy name.",
  "Thy kingdom come,",
  "thy will be done,",
  "on earth as it is in heaven.",
  "Give us this day our daily bread,",
  "and forgive us our trespasses,",
  "as we forgive those who trespass against us.",
  "And lead us not into temptation,",
  "but deliver us from evil.",
  "Amen.",
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");

function sastToday() {
  const now = new Date(Date.now() + 2 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}
const isoDate = sastToday();

function esc(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSsml() {
  const parts = LORDS_PRAYER_PHRASES.map(
    (p, i) => esc(p) + (i < LORDS_PRAYER_PHRASES.length - 1 ? '<break time="500ms"/>' : "")
  );
  return `<speak>${parts.join(" ")}<break time="700ms"/></speak>`;
}

async function synthesizeAudio() {
  const client = new textToSpeech.TextToSpeechClient();
  const [resp] = await client.synthesizeSpeech({
    input: { ssml: buildSsml() },
    voice: { languageCode: LANGUAGE, name: VOICE },
    audioConfig: { audioEncoding: "MP3", speakingRate: SPEAKING_RATE, pitch: 0 },
  });
  return Buffer.from(resp.audioContent);
}

// ---------- YouTube upload (same pattern as post-to-youtube.js) ----------
async function uploadVideo({ videoPath, title, description, tags }) {
  const clientId = process.env.YT_CLIENT_ID?.trim();
  const clientSecret = process.env.YT_CLIENT_SECRET?.trim();
  const refreshToken = process.env.YT_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("YT_CLIENT_ID, YT_CLIENT_SECRET, and YT_REFRESH_TOKEN must all be set.");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  let youtube;
  try {
    await oauth2Client.getAccessToken();
    youtube = google.youtube({ version: "v3", auth: oauth2Client });
  } catch (err) {
    const reason = err.response?.data?.error || err.message;
    throw new Error(
      `Google OAuth token refresh failed (${reason}). Re-run scripts/youtube-auth-setup.js and update ` +
        `YT_CLIENT_ID/YT_CLIENT_SECRET/YT_REFRESH_TOKEN together.`
    );
  }

  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: { title, description, tags, categoryId: "22" },
      status: { privacyStatus: PRIVACY_STATUS, selfDeclaredMadeForKids: false },
    },
    media: { body: fs.createReadStream(videoPath) },
  });

  return res.data;
}

const TAGS = [
  "Lord's Prayer",
  "Our Father",
  "Catholic Prayer",
  "Catholic Daily Mass",
  "Daily Prayer",
  "Word of God",
];

function buildTitle() {
  return "The Lord's Prayer — Our Father";
}

function buildDescription() {
  return [
    "The Lord's Prayer, prayed together.",
    "",
    LORDS_PRAYER_TEXT,
    "",
    "Read today's full Mass readings, listen to the day's Gospel, and pray with us daily:",
    APP_URL,
    "",
    "Subscribe for daily Mass readings and reflections:",
    CHANNEL_URL,
    "",
    "#LordsPrayer #OurFather #CatholicPrayer #CatholicDailyMass #WordOfGod",
  ].join("\n");
}

// ---------- main ----------
async function main() {
  if (isoDate !== ALLOWED_DATE && !FORCE) {
    console.log(
      `Today (${isoDate}) is not the allowed date for this one-day special (${ALLOWED_DATE}) — skipping, nothing built or posted.`
    );
    return;
  }
  if (FORCE && isoDate !== ALLOWED_DATE) {
    console.log(`--force set: bypassing the date guard (today is ${isoDate}, allowed date is ${ALLOWED_DATE}).`);
  }

  console.log("Synthesising Lord's Prayer audio with Google Cloud TTS …");
  const audioBuffer = await synthesizeAudio();

  const tmpDir = fs.mkdtempSync(path.join(ROOT, ".tmp-lords-prayer-"));
  const audioPath = path.join(tmpDir, "lords-prayer.mp3");
  const videoPath = path.join(tmpDir, "lords-prayer.mp4");
  fs.writeFileSync(audioPath, audioBuffer);

  console.log("Building video (random backdrop + audio) …");
  buildVideo({ audioPath, outPath: videoPath, publicDir: PUBLIC_DIR, tmpParentDir: ROOT });

  const title = buildTitle();
  const description = buildDescription();

  console.log(`  Title: ${title}`);
  console.log(`  Description length: ${description.length} characters`);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: nothing uploaded to YouTube. ---\n");
    console.log(`TITLE:\n${title}\n`);
    console.log(`DESCRIPTION:\n${description}\n`);
    console.log(`TAGS:\n${TAGS.join(", ")}\n`);
    console.log(`Built video at: ${videoPath}`);
    return;
  }

  console.log("Uploading to YouTube …");
  const result = await uploadVideo({ videoPath, title, description, tags: TAGS });
  console.log(`\nDone! Video: https://youtu.be/${result.id}`);

  fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
