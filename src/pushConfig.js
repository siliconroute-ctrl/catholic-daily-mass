/**
 * Push notification configuration — Phase 2.
 *
 * Kept in its own file (lesson learned from the Jeremiah app: isolate the
 * VAPID key so App.jsx updates never silently break push).
 *
 * To enable daily push notifications ("Today's Mass readings are ready"):
 *  1. Create a Firebase project (like daily-wisdom-jeremiah).
 *  2. Project settings > Cloud Messaging > Web Push certificates >
 *     generate a key pair, paste the public key below.
 *  3. Paste your Firebase web app config below.
 *  4. Reuse the Jeremiah scheduling approach for the 07:00 SAST send.
 *
 * While VAPID_KEY is empty, the app hides all notification UI.
 */

export const VAPID_KEY = "";

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

export const pushEnabled = () => VAPID_KEY.length > 0;
