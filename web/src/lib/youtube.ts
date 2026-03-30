/**
 * YouTube Music integration for Exportify — uses YouTube Data API v3.
 *
 * Auth flow: Google OAuth2 with PKCE (same pattern as our Spotify integration).
 * Transfer: Search for each Spotify track on YouTube, then add to a new playlist.
 */

// ── Constants ─────────────────────────────────────────────────

const YT_SCOPES = [
  "https://www.googleapis.com/auth/youtube",
];

const YT_TOKEN_KEY = "exportify_yt_token";
const YT_VERIFIER_KEY = "exportify_yt_code_verifier";
const YT_CLIENT_ID_KEY = "exportify_google_client_id";
const YT_CLIENT_SECRET_KEY = "exportify_google_client_secret";

const MATCH_CONFIDENCE_THRESHOLD = 0.6;

function isDev(): boolean {
  return process.env.NODE_ENV === "development";
}

// ── Client ID management ──────────────────────────────────────

function getGoogleClientId(): string {
  const envId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (envId) return envId;
  if (typeof window !== "undefined") {
    return localStorage.getItem(YT_CLIENT_ID_KEY) || "";
  }
  return "";
}

export function getStoredGoogleClientId(): string {
  if (typeof window === "undefined") return "";
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || localStorage.getItem(YT_CLIENT_ID_KEY) || "";
}

export function saveGoogleClientId(clientId: string): void {
  localStorage.setItem(YT_CLIENT_ID_KEY, clientId.trim());
}

export function clearGoogleClientId(): void {
  localStorage.removeItem(YT_CLIENT_ID_KEY);
  localStorage.removeItem(YT_CLIENT_SECRET_KEY);
}

// ── Client Secret management ──────────────────────────────────

function getGoogleClientSecret(): string {
  const envSecret = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET;
  if (envSecret) return envSecret;
  if (typeof window !== "undefined") {
    return localStorage.getItem(YT_CLIENT_SECRET_KEY) || "";
  }
  return "";
}

export function getStoredGoogleClientSecret(): string {
  if (typeof window === "undefined") return "";
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET || localStorage.getItem(YT_CLIENT_SECRET_KEY) || "";
}

export function saveGoogleClientSecret(secret: string): void {
  localStorage.setItem(YT_CLIENT_SECRET_KEY, secret.trim());
}

// ── PKCE helpers ──────────────────────────────────────────────

function generateRandomString(length: number): string {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest("SHA-256", data);
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ── Redirect URI ──────────────────────────────────────────────

function getYouTubeRedirectUri(): string {
  const envUri = process.env.NEXT_PUBLIC_YOUTUBE_REDIRECT_URI;
  if (envUri) return envUri;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/callback/youtube`;
  }
  return "http://localhost:3000/callback/youtube";
}

export function getConfiguredYouTubeRedirectUri(): string {
  return getYouTubeRedirectUri();
}

// ── Auth ──────────────────────────────────────────────────────

export async function redirectToYouTubeAuth(): Promise<void> {
  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64UrlEncode(hashed);

  localStorage.setItem(YT_VERIFIER_KEY, codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: getGoogleClientId(),
    scope: YT_SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    redirect_uri: getYouTubeRedirectUri(),
    access_type: "offline",
    prompt: "consent",
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeYouTubeCodeForToken(code: string): Promise<boolean> {
  const codeVerifier = localStorage.getItem(YT_VERIFIER_KEY);
  if (!codeVerifier) {
    if (isDev()) console.error("[Exportify] No YouTube code_verifier found");
    return false;
  }

  const body = new URLSearchParams({
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
    grant_type: "authorization_code",
    code,
    redirect_uri: getYouTubeRedirectUri(),
    code_verifier: codeVerifier,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[Exportify] YouTube token exchange failed:", response.status, errorBody);
    return false;
  }

  const data = await response.json();
  const tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  localStorage.setItem(YT_TOKEN_KEY, JSON.stringify(tokenData));
  localStorage.removeItem(YT_VERIFIER_KEY);
  return true;
}

async function refreshYouTubeToken(): Promise<boolean> {
  const stored = localStorage.getItem(YT_TOKEN_KEY);
  if (!stored) return false;

  const tokenData = JSON.parse(stored);
  if (!tokenData.refresh_token) return false;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      grant_type: "refresh_token",
      refresh_token: tokenData.refresh_token,
    }),
  });

  if (!response.ok) return false;

  const data = await response.json();
  tokenData.access_token = data.access_token;
  tokenData.expires_at = Date.now() + data.expires_in * 1000;
  if (data.refresh_token) tokenData.refresh_token = data.refresh_token;
  localStorage.setItem(YT_TOKEN_KEY, JSON.stringify(tokenData));
  return true;
}

export function getYouTubeAccessToken(): string | null {
  const stored = localStorage.getItem(YT_TOKEN_KEY);
  if (!stored) return null;
  const tokenData = JSON.parse(stored);
  return tokenData.access_token || null;
}

export function isYouTubeAuthenticated(): boolean {
  return getYouTubeAccessToken() !== null;
}

export function logoutYouTube(): void {
  localStorage.removeItem(YT_TOKEN_KEY);
  localStorage.removeItem(YT_VERIFIER_KEY);
}

// ── YouTube API calls ─────────────────────────────────────────

async function ytFetch(
  url: string,
  options: RequestInit = {},
  onRetry?: (msg: string) => void
): Promise<Response> {
  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Refresh token if expired
    const stored = localStorage.getItem(YT_TOKEN_KEY);
    if (stored) {
      const tokenData = JSON.parse(stored);
      if (Date.now() >= tokenData.expires_at - 60000) {
        await refreshYouTubeToken();
      }
    }

    const token = getYouTubeAccessToken();
    if (!token) throw new Error("Not authenticated with YouTube");

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || String(2 ** attempt));
      onRetry?.(`YouTube rate limited. Retrying in ${retryAfter}s...`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }

    if (response.status >= 500) {
      const wait = 2 ** attempt;
      onRetry?.(`YouTube server error (${response.status}). Retrying in ${wait}s...`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`YouTube API error: ${response.status} - ${errorBody}`);
    }

    return response;
  }

  // Final attempt
  const token = getYouTubeAccessToken();
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

async function ytGet(url: string, onRetry?: (msg: string) => void) {
  const res = await ytFetch(url, {}, onRetry);
  return res.json();
}

async function ytPost(url: string, body: unknown, onRetry?: (msg: string) => void) {
  const res = await ytFetch(url, {
    method: "POST",
    body: JSON.stringify(body),
  }, onRetry);
  return res.json();
}

// ── Song matching ─────────────────────────────────────────────

function normalize(text: string): string {
  text = text.toLowerCase().trim();
  text = text.replace(/\s*[\(\[].*?[\)\]]/g, "");
  text = text.replace(/[^\w\s]/g, "");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function matchConfidence(
  spotifyName: string,
  spotifyArtist: string,
  ytTitle: string,
  ytChannelTitle: string,
): number {
  const normSpName = normalize(spotifyName);
  const normSpArtist = normalize(spotifyArtist.split(",")[0]);
  const normYtTitle = normalize(ytTitle);
  const normYtChannel = normalize(ytChannelTitle);

  // Title similarity
  let titleScore: number;
  if (normSpName === normYtTitle) {
    titleScore = 1.0;
  } else if (normYtTitle.includes(normSpName) || normSpName.includes(normYtTitle)) {
    titleScore = 0.8;
  } else {
    const spWords = new Set(normSpName.split(" "));
    const ytWords = new Set(normYtTitle.split(" "));
    const intersection = new Set([...spWords].filter((w) => ytWords.has(w)));
    titleScore = spWords.size && ytWords.size
      ? (intersection.size / Math.max(spWords.size, ytWords.size)) * 0.7
      : 0;
  }

  // Check if artist name appears in title (common for YouTube videos)
  const artistInTitle = normYtTitle.includes(normSpArtist) ? 0.1 : 0;

  // Artist/channel similarity
  let artistScore: number;
  if (normSpArtist === normYtChannel) {
    artistScore = 1.0;
  } else if (normYtChannel.includes(normSpArtist) || normSpArtist.includes(normYtChannel)) {
    artistScore = 0.8;
  } else {
    artistScore = 0;
  }

  return titleScore * 0.6 + artistScore * 0.4 + artistInTitle;
}

export type LogFn = (msg: string) => void;

export interface TransferMatch {
  videoId: string;
  title: string;
  channelTitle: string;
  confidence: number;
  isWarning?: boolean;
}

export interface TransferStats {
  matched: number;
  warnings: number;
  notFound: number;
  errors: number;
  total: number;
}

export interface SpotifyTrackForTransfer {
  name: string;
  artist: string;
  album?: string;
}

// ── Search ────────────────────────────────────────────────────

export async function searchYouTubeMusic(
  trackName: string,
  artistName: string,
  log?: LogFn
): Promise<TransferMatch | string | null> {
  // Improve search matching by including both title and artist for high accuracy on YouTube
  const query = `${trackName} ${artistName}`.trim();
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    videoCategoryId: "10", // Music category
    maxResults: "5",
  });

  try {
    const data = await ytGet(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
      log
    );

    if (!data.items || data.items.length === 0) {
      // If the music category filter fails entirely, fallback to a general search just by title
      const fallbackParams = new URLSearchParams({
        part: "snippet",
        q: trackName,
        type: "video",
        maxResults: "5",
      });
      const fallbackData = await ytGet(`https://www.googleapis.com/youtube/v3/search?${fallbackParams.toString()}`, log);
      if (!fallbackData.items || fallbackData.items.length === 0) return null;
      data.items = fallbackData.items;
    }

    let bestMatch: TransferMatch | null = null;
    let bestConfidence = -1; // Init at -1 so we ALWAYS grab at least the first result as a fallback

    for (const item of data.items) {
      const videoId = item.id?.videoId;
      if (!videoId) continue;

      const title = item.snippet?.title || "";
      const channelTitle = item.snippet?.channelTitle || "";

      const confidence = matchConfidence(trackName, artistName, title, channelTitle);

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = { videoId, title, channelTitle, confidence };
      }
    }

    if (bestMatch) {
      if (bestMatch.confidence >= MATCH_CONFIDENCE_THRESHOLD) {
        bestMatch.isWarning = false;
        return bestMatch;
      } else {
        // Fallback: accept the best available match (even if confidence is 0) but mark it as a warning
        bestMatch.isWarning = true;
        return bestMatch;
      }
    }

    return null;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (log) log(`Search error: ${errorMsg}`);
    return `API_ERROR: ${errorMsg}`;
  }
}

// ── Playlist creation ─────────────────────────────────────────

export async function createYouTubePlaylist(
  title: string,
  description: string,
  log?: LogFn
): Promise<string | null> {
  try {
    const data = await ytPost(
      "https://www.googleapis.com/youtube/v3/playlists?part=snippet,status",
      {
        snippet: { title, description },
        status: { privacyStatus: "private" },
      },
      log
    );
    return data.id || null;
  } catch (err) {
    if (log) log(`Failed to create playlist: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function addToYouTubePlaylist(
  playlistId: string,
  videoId: string,
  log?: LogFn
): Promise<boolean> {
  try {
    await ytPost(
      "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet",
      {
        snippet: {
          playlistId,
          resourceId: {
            kind: "youtube#video",
            videoId,
          },
        },
      },
      log
    );
    return true;
  } catch {
    return false;
  }
}

export async function rateYouTubeVideo(
  videoId: string,
  rating: "like" | "dislike" | "none" = "like",
): Promise<boolean> {
  try {
    await ytFetch(
      `https://www.googleapis.com/youtube/v3/videos/rate?id=${encodeURIComponent(videoId)}&rating=${rating}`,
      { method: "POST" },
    );
    return true;
  } catch {
    return false;
  }
}

// ── Transfer orchestration ────────────────────────────────────

export async function transferLikedSongs(
  spotifyTracks: SpotifyTrackForTransfer[],
  onProgress?: (stats: TransferStats, current: SpotifyTrackForTransfer, match: TransferMatch | null) => void,
  log?: LogFn,
): Promise<TransferStats> {
  const stats: TransferStats = {
    matched: 0,
    warnings: 0,
    notFound: 0,
    errors: 0,
    total: spotifyTracks.length,
  };

  for (const track of spotifyTracks) {
    const match = await searchYouTubeMusic(track.name, track.artist, log);

    if (typeof match === "string") {
      stats.errors++;
      onProgress?.(stats, track, null);
    } else if (match) {
      // Rate the video (like it) — we use the rating endpoint
      try {
        await ytPost(
          `https://www.googleapis.com/youtube/v3/videos/rate?id=${encodeURIComponent(match.videoId)}&rating=like`,
          null,
          log
        );
        if (match.isWarning) stats.warnings++;
        else stats.matched++;
      } catch {
        stats.errors++;
      }
      onProgress?.(stats, track, match);
    } else {
      stats.notFound++;
      onProgress?.(stats, track, null);
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 300));
  }

  return stats;
}

export async function transferPlaylist(
  name: string,
  spotifyTracks: SpotifyTrackForTransfer[],
  onProgress?: (stats: TransferStats, current: SpotifyTrackForTransfer, match: TransferMatch | null) => void,
  log?: LogFn,
): Promise<TransferStats & { playlistId: string | null }> {
  const stats: TransferStats & { playlistId: string | null } = {
    matched: 0, warnings: 0, notFound: 0, errors: 0, total: spotifyTracks.length, playlistId: null,
  };

  // Phase 1: Search all tracks
  const matchedVideos: TransferMatch[] = [];

  for (const track of spotifyTracks) {
    const match = await searchYouTubeMusic(track.name, track.artist, log);

    if (typeof match === "string") {
      stats.errors++;
      onProgress?.(stats, track, null);
    } else if (match) {
      matchedVideos.push(match);
      if (match.isWarning) stats.warnings++;
      else stats.matched++;
      onProgress?.(stats, track, match);
    } else {
      stats.notFound++;
      onProgress?.(stats, track, null);
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  // Phase 2: Create playlist and add tracks
  if (matchedVideos.length > 0) {
    const playlistId = await createYouTubePlaylist(
      name,
      `Transferred from Spotify via Exportify`,
      log
    );

    if (playlistId) {
      stats.playlistId = playlistId;

      for (const match of matchedVideos) {
        const success = await addToYouTubePlaylist(playlistId, match.videoId, log);
        if (!success) stats.errors++;
        await new Promise((r) => setTimeout(r, 200));
      }
    } else {
      stats.errors++;
    }
  }

  return stats;
}
