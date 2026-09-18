/**
 * Playlist lookup/creation + video assignment for YouTube uploads.
 *
 * Requires the broader `https://www.googleapis.com/auth/youtube` (or
 * `.../youtube.force-ssl`) OAuth scope — `youtube.upload` alone only
 * covers uploading, not playlist management, and calls here will fail
 * with an auth error if that scope isn't granted.
 *
 * Playlists are looked up by title (case-insensitive) and created if
 * missing, so no playlist IDs need to be hard-coded or configured.
 */

async function findPlaylistIdByTitle(youtube, title) {
  let pageToken;
  do {
    const res = await youtube.playlists.list({
      part: ["snippet"],
      mine: true,
      maxResults: 50,
      pageToken,
    });
    const match = (res.data.items || []).find(
      (p) => p.snippet?.title?.trim().toLowerCase() === title.trim().toLowerCase()
    );
    if (match) return match.id;
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return null;
}

async function createPlaylist(youtube, title) {
  const res = await youtube.playlists.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: { title },
      status: { privacyStatus: "public" },
    },
  });
  return res.data.id;
}

async function getOrCreatePlaylistId(youtube, title) {
  const existing = await findPlaylistIdByTitle(youtube, title);
  if (existing) return existing;
  return createPlaylist(youtube, title);
}

async function addVideoToPlaylist(youtube, playlistId, videoId) {
  await youtube.playlistItems.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: { kind: "youtube#video", videoId },
      },
    },
  });
}

// Never throws — a playlist-assignment problem shouldn't undo an already
// -successful upload. Returns per-playlist { name, ok, error? } so the
// caller can log what happened.
export async function assignVideoToPlaylists(youtube, videoId, playlistNames) {
  const results = [];
  for (const name of playlistNames) {
    try {
      const playlistId = await getOrCreatePlaylistId(youtube, name);
      await addVideoToPlaylist(youtube, playlistId, videoId);
      results.push({ name, ok: true });
    } catch (err) {
      const detail = err.response?.data?.error || err.message;
      results.push({ name, ok: false, error: detail });
    }
  }
  return results;
}
