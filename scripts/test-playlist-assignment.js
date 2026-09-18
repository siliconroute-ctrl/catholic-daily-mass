/**
 * TEMPORARY diagnostic — not part of the nightly automation.
 * Confirms playlist lookup/creation + item assignment works for a given
 * set of playlist names, against an already-existing video, without
 * uploading anything new. Deleted after use.
 *
 * Usage: node scripts/test-playlist-assignment.js <videoId> <playlist1> [playlist2 ...]
 */
import { google } from "googleapis";
import { assignVideoToPlaylists } from "./lib/youtube-playlists.js";

const [videoId, ...playlistNames] = process.argv.slice(2);
if (!videoId || playlistNames.length === 0) {
  console.error("Usage: node scripts/test-playlist-assignment.js <videoId> <playlist1> [playlist2 ...]");
  process.exit(1);
}

const clientId = process.env.YT_CLIENT_ID?.trim();
const clientSecret = process.env.YT_CLIENT_SECRET?.trim();
const refreshToken = process.env.YT_REFRESH_TOKEN?.trim();

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
oauth2Client.setCredentials({ refresh_token: refreshToken });
await oauth2Client.getAccessToken();
const youtube = google.youtube({ version: "v3", auth: oauth2Client });

console.log(`Assigning video ${videoId} to: ${playlistNames.join(", ")}`);
const results = await assignVideoToPlaylists(youtube, videoId, playlistNames);
console.log(JSON.stringify(results, null, 2));
