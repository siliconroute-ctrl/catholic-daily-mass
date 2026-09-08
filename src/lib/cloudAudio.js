/**
 * Pre-generated HD audio (Google Cloud TTS), produced once a day by
 * scripts/generate-audio.js and published at /audio/YYYY-MM-DD.{mp3,json}.
 * Returns the manifest for a date, or null if no HD audio exists for it —
 * in which case the app falls back to the device's built-in voice.
 */
export function isoDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function fetchAudioManifest(date) {
  const key = isoDateKey(date);
  try {
    const res = await fetch(`/audio/${key}.json`, { cache: "no-cache" });
    if (!res.ok) return null;
    const manifest = await res.json();
    if (!manifest || manifest.date !== key) return null;
    return { ...manifest, src: `/audio/${key}.mp3` };
  } catch {
    return null;
  }
}
