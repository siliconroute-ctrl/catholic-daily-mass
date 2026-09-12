/**
 * ONE-TIME setup script — run this locally on your own PC, once, to
 * authorize the Daily Mass automation against your YouTube channel.
 *
 * This is NOT part of the nightly automation. You run it once, get a
 * refresh token, save it as a GitHub secret, and never need to run this
 * again (a refresh token doesn't expire as long as it's used at least
 * once every 6 months — the nightly job uses it every single night, so
 * it will never go stale).
 *
 * Before running this:
 *  1. Go to console.cloud.google.com
 *  2. Create a project (or reuse your existing "daily-mass-text-to-speech"
 *     project — either is fine)
 *  3. Enable the "YouTube Data API v3" for that project
 *  4. Go to "APIs & Services" → "Credentials" → "Create Credentials" →
 *     "OAuth client ID"
 *  5. If asked, configure the OAuth consent screen first:
 *     - User type: External
 *     - Publishing status: Testing (this avoids Google's app review
 *       process entirely — fine since only you will ever authorize this)
 *     - Add your own Google account email as a "test user"
 *  6. Application type: "Desktop app" — this matters, it's what allows
 *     the localhost redirect this script uses
 *  7. Download the credentials (or just copy the Client ID and Client
 *     Secret shown on screen)
 *
 * Usage:
 *   export YT_CLIENT_ID="....apps.googleusercontent.com"
 *   export YT_CLIENT_SECRET="...."
 *   node scripts/youtube-auth-setup.js
 *
 * This opens a browser window for you to sign in with the Google account
 * tied to your YouTube channel, then prints a refresh token to save.
 */

import http from "node:http";
import { google } from "googleapis";

const PORT = 43219;
const REDIRECT_URI = `http://localhost:${PORT}`;

const clientId = process.env.YT_CLIENT_ID;
const clientSecret = process.env.YT_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("FAILED: Set YT_CLIENT_ID and YT_CLIENT_SECRET first — see the comment at the top of this file.");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline", // required to get a refresh token, not just a short-lived one
  prompt: "consent", // forces a refresh token even if you've authorized before
  scope: ["https://www.googleapis.com/auth/youtube.upload"],
});

console.log("\n1. Open this URL in your browser (the one signed in to your YouTube channel):\n");
console.log(authUrl);
console.log("\n2. Sign in and click Allow. This page will handle the rest automatically.\n");
console.log("Waiting for authorization …");

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, REDIRECT_URI);
    const code = url.searchParams.get("code");
    if (!code) {
      res.end("No authorization code received. Check the terminal for details.");
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);

    res.end("Success! You can close this tab and go back to your terminal.");
    server.close();

    console.log("\n--- SUCCESS ---\n");
    if (tokens.refresh_token) {
      console.log("Your refresh token (save this as the GitHub secret YT_REFRESH_TOKEN):\n");
      console.log(tokens.refresh_token);
      console.log(
        "\nAlso save YT_CLIENT_ID and YT_CLIENT_SECRET as GitHub secrets if you haven't already — the nightly job needs all three."
      );
    } else {
      console.log(
        "No refresh token was returned. This usually means you've already authorized this app before.\n" +
          "Go to https://myaccount.google.com/permissions, remove access for this app, and run this script again."
      );
    }
  } catch (err) {
    res.end("Something went wrong — check the terminal.");
    console.error("\nFAILED:", err.message);
    server.close();
  }
});

server.listen(PORT);
