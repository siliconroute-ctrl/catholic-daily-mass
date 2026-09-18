/**
 * Catholic Daily Mass — daily REFLECTION YouTube poster
 *
 * A second, separate daily upload containing ONLY the day's quiet
 * reflection (the same reflection shown in the PWA) as a video — the
 * reflection's own HD audio over a backdrop photo. This is distinct from
 * post-to-youtube.js, which posts the full day's readings; this one exists
 * purely to give the reflection its own standalone piece of content.
 *
 * Usage:
 *   node scripts/post-reflection-to-youtube.js                # today (SA time)
 *   node scripts/post-reflection-to-youtube.js 2026-09-11     # a specific date
 *   node scripts/post-reflection-to-youtube.js --dry-run       # build everything, upload nothing
 *
 * Auth: same three secrets as post-to-youtube.js — YT_CLIENT_ID,
 * YT_CLIENT_SECRET, YT_REFRESH_TOKEN.
 *
 * SAFETY:
 *  - One date per run, no retries, no loops.
 *  - A missing reflection for the date is NOT an error — it exits cleanly
 *    (code 0) since reflection generation is a best-effort nightly step
 *    that doesn't always produce one.
 *  - Uploads default to "public", matching post-to-youtube.js.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";
import { reflectionVideoPath } from "./build-reflection-video.js";
import { formatLongDate } from "./lib/format-date.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REFLECTIONS_DIR = path.join(ROOT, "public", "reflections");

const APP_URL = "https://catholic-daily-mass.vercel.app/";
const CHANNEL_URL = "https://www.youtube.com/channel/UC2NDjwPehZIdHaUt3X59zCg";
const PRIVACY_STATUS = "public";
const MAX_TITLE_CHARS = 100;
const MAX_DESCRIPTION_CHARS = 4900;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

function sastToday() {
  const now = new Date(Date.now() + 2 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}
const isoDate = dateArg || sastToday();

// ---------- build the title, description ----------
export function buildTitle({ day }) {
  const base = `Today's Reflection — ${formatLongDate(isoDate)}`;
  const shortDay = day ? day.split(/\s+\bor\b\s+/i)[0] : "";
  const withDay = shortDay ? `${base} — ${shortDay}` : base;
  if (withDay.length <= MAX_TITLE_CHARS) return withDay;
  const truncated = withDay.slice(0, MAX_TITLE_CHARS - 1);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

export function buildDescription({ day, reflectionText }) {
  const lines = [];
  lines.push(`A quiet reflection on today's Mass readings — ${day || isoDate}.`, "");
  lines.push(reflectionText, "");
  lines.push(
    "Read today's full readings, listen to the full Mass, and pray with us daily:",
    APP_URL,
    "",
    "Subscribe for daily Mass readings and a daily reflection:",
    CHANNEL_URL,
    "",
    "#CatholicDailyMass #DailyReflection #CatholicPrayer #WordOfGod"
  );

  let description = lines.join("\n");
  if (description.length > MAX_DESCRIPTION_CHARS) {
    description = description.slice(0, MAX_DESCRIPTION_CHARS - 4) + "\n…";
  }
  return description;
}

const TAGS = [
  "Catholic Daily Mass",
  "Daily Reflection",
  "Catholic Reflection",
  "Catholic Prayer",
  "Daily Gospel Reading",
  "Word of God",
];

// ---------- upload to YouTube ----------
async function uploadVideo({ videoPath, title, description }) {
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

  let res;
  try {
    res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title,
          description,
          tags: TAGS,
          categoryId: "22",
        },
        status: {
          privacyStatus: PRIVACY_STATUS,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(videoPath),
      },
    });
  } catch (err) {
    const detail = err.response?.data?.error || err.errors || err.response?.data || err.message;
    throw new Error(`YouTube upload rejected: ${JSON.stringify(detail)}`);
  }

  return res.data;
}

// ---------- main ----------
async function main() {
  console.log(`Preparing reflection YouTube upload for ${isoDate} …`);

  const reflectionJsonPath = path.join(REFLECTIONS_DIR, `${isoDate}.json`);
  if (!fs.existsSync(reflectionJsonPath)) {
    console.log(`No reflection generated for ${isoDate} — nothing to post today, skipping.`);
    return;
  }

  const videoPath = reflectionVideoPath(ROOT, isoDate);
  if (!fs.existsSync(videoPath)) {
    throw new Error(
      `Reflection exists for ${isoDate} but no pre-built video was found at ` +
        `${path.relative(ROOT, videoPath)}. Run build-reflection-video.js for this date first.`
    );
  }

  const reflection = JSON.parse(fs.readFileSync(reflectionJsonPath, "utf8"));
  const day = reflection.day || "";
  const reflectionText = reflection.text || "";
  if (!reflectionText) {
    throw new Error(`${path.relative(ROOT, reflectionJsonPath)} has no "text" field.`);
  }

  const title = buildTitle({ day });
  const description = buildDescription({ day, reflectionText });

  console.log(`  Title: ${title}`);
  console.log(`  Description length: ${description.length} characters`);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: nothing uploaded to YouTube. ---\n");
    console.log(`TITLE:\n${title}\n`);
    console.log(`DESCRIPTION:\n${description}\n`);
    console.log(`TAGS:\n${TAGS.join(", ")}\n`);
    console.log(`Using pre-built video at: ${videoPath}`);
    return;
  }

  console.log("  Uploading to YouTube (this can take a few minutes) …");
  const result = await uploadVideo({ videoPath, title, description });

  console.log(`\nDone! Video: https://youtu.be/${result.id}`);
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
