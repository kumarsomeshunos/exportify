const SCOPES = [
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-top-read",
  "user-read-recently-played",
  "user-follow-read",
  "user-read-private",
];

const TOKEN_KEY = "exportify_token";
const VERIFIER_KEY = "exportify_code_verifier";
const CLIENT_ID_KEY = "exportify_client_id";

function getClientId(): string {
  // Env var takes priority (for self-hosters), then localStorage (for visitors)
  const envId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  if (envId) return envId;
  if (typeof window !== "undefined") {
    return localStorage.getItem(CLIENT_ID_KEY) || "";
  }
  return "";
}

export function getStoredClientId(): string {
  if (typeof window === "undefined") return "";
  return process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || localStorage.getItem(CLIENT_ID_KEY) || "";
}

export function saveClientId(clientId: string): void {
  localStorage.setItem(CLIENT_ID_KEY, clientId.trim());
}

export function clearClientId(): void {
  localStorage.removeItem(CLIENT_ID_KEY);
}

function getRedirectUri(): string {
  const envUri = process.env.NEXT_PUBLIC_REDIRECT_URI;
  if (envUri) return envUri;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/callback`;
  }
  return "http://localhost:3000/callback";
}

export function getConfiguredRedirectUri(): string {
  return getRedirectUri();
}

// ── PKCE Helpers ──────────────────────────────────────────────

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

// ── Auth ──────────────────────────────────────────────────────

export async function redirectToSpotifyAuth(): Promise<void> {
  // Ensure browser origin matches redirect URI origin to keep localStorage consistent
  const redirectUri = getRedirectUri();
  const redirectOrigin = new URL(redirectUri).origin;
  if (window.location.origin !== redirectOrigin) {
    window.location.href = redirectOrigin + window.location.pathname;
    return;
  }

  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64UrlEncode(hashed);

  localStorage.setItem(VERIFIER_KEY, codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: getClientId(),
    scope: SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    redirect_uri: redirectUri,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<boolean> {
  const codeVerifier = localStorage.getItem(VERIFIER_KEY);
  if (!codeVerifier) {
    console.error("[Exportify] No code_verifier found in localStorage");
    return false;
  }

  const body = new URLSearchParams({
    client_id: getClientId(),
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: codeVerifier,
  });

  console.log("[Exportify] Token exchange redirect_uri:", getRedirectUri());

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[Exportify] Token exchange failed:", response.status, errorBody);
    return false;
  }

  const data = await response.json();
  const tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokenData));
  localStorage.removeItem(VERIFIER_KEY);
  return true;
}

async function refreshAccessToken(): Promise<boolean> {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (!stored) return false;

  const tokenData = JSON.parse(stored);
  if (!tokenData.refresh_token) return false;

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getClientId(),
      grant_type: "refresh_token",
      refresh_token: tokenData.refresh_token,
    }),
  });

  if (!response.ok) return false;

  const data = await response.json();
  tokenData.access_token = data.access_token;
  tokenData.expires_at = Date.now() + data.expires_in * 1000;
  if (data.refresh_token) tokenData.refresh_token = data.refresh_token;
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokenData));
  return true;
}

export function getAccessToken(): string | null {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (!stored) return null;
  const tokenData = JSON.parse(stored);
  return tokenData.access_token || null;
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(VERIFIER_KEY);
}

// ── API Calls with retry ─────────────────────────────────────

async function spotifyFetch(
  url: string,
  onRetry?: (msg: string) => void
): Promise<Response> {
  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Refresh token if expired
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      const tokenData = JSON.parse(stored);
      if (Date.now() >= tokenData.expires_at - 60000) {
        await refreshAccessToken();
      }
    }

    const token = getAccessToken();
    if (!token) throw new Error("Not authenticated");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || String(2 ** attempt));
      onRetry?.(`Rate limited. Retrying in ${retryAfter}s...`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }

    if (response.status >= 500) {
      const wait = 2 ** attempt;
      onRetry?.(`Server error (${response.status}). Retrying in ${wait}s...`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status}`);
    }

    return response;
  }

  // Final attempt
  const token = getAccessToken();
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

async function spotifyGet(url: string, onRetry?: (msg: string) => void) {
  const res = await spotifyFetch(url, onRetry);
  return res.json();
}

// ── User ──────────────────────────────────────────────────────

export interface SpotifyUser {
  display_name: string;
  id: string;
  country?: string;
  images?: { url: string }[];
}

export async function fetchCurrentUser(): Promise<SpotifyUser> {
  return spotifyGet("https://api.spotify.com/v1/me");
}

// ── Data Fetchers ─────────────────────────────────────────────

export type LogFn = (msg: string) => void;

interface PaginatedResponse {
  items: Record<string, unknown>[];
  next: string | null;
  total?: number;
}

async function fetchAllPages(
  url: string,
  log?: LogFn
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let currentUrl: string | null = url;
  while (currentUrl) {
    const data: PaginatedResponse = await spotifyGet(currentUrl, log);
    items.push(...data.items);
    currentUrl = data.next;
  }
  return items;
}

export interface TrackItem {
  name: string;
  artist: string;
  album: string;
  added_at?: string;
  played_at?: string;
  duration_ms: number;
  spotify_url: string;
  uri: string;
  rank?: number;
  popularity?: number;
}

export interface PlaylistItem {
  name: string;
  id: string;
  description: string;
  owner: string;
  public: boolean | null;
  total_tracks: number;
  spotify_url: string;
  uri: string;
}

export interface ArtistItem {
  name: string;
  genres: string;
  followers: number;
  popularity: number;
  spotify_url: string;
  uri: string;
  rank?: number;
}

function parseTrack(item: Record<string, unknown>, addedKey = "added_at"): TrackItem | null {
  // The /items endpoint returns track data under "item", /tracks uses "track"
  const track = (item.track ?? item.item) as Record<string, unknown> | null;
  if (!track) return null;
  const artists = (track.artists as Record<string, unknown>[]) || [];
  const album = (track.album as Record<string, unknown>) || {};
  const extUrls = (track.external_urls as Record<string, string>) || {};
  return {
    name: (track.name as string) || "",
    artist: artists.map((a) => (a.name as string) || "").join(", "),
    album: (album.name as string) || "",
    [addedKey]: (item[addedKey] as string) || "",
    duration_ms: (track.duration_ms as number) || 0,
    spotify_url: extUrls.spotify || "",
    uri: (track.uri as string) || "",
  };
}

export async function fetchLikedSongs(log?: LogFn): Promise<TrackItem[]> {
  const items = await fetchAllPages(
    "https://api.spotify.com/v1/me/tracks?limit=50",
    log
  );
  return items.map((item) => parseTrack(item)!).filter(Boolean);
}

export async function fetchPlaylists(log?: LogFn): Promise<PlaylistItem[]> {
  const items = await fetchAllPages(
    "https://api.spotify.com/v1/me/playlists?limit=50",
    log
  );
  return items.map((item) => {
    const owner = (item.owner as Record<string, unknown>) || {};
    const tracks = (item.tracks as Record<string, unknown>) || {};
    const extUrls = (item.external_urls as Record<string, string>) || {};
    return {
      name: (item.name as string) || "",
      id: (item.id as string) || "",
      description: (item.description as string) || "",
      owner: (owner.display_name as string) || "",
      public: item.public as boolean | null,
      total_tracks: (tracks.total as number) || 0,
      spotify_url: extUrls.spotify || "",
      uri: (item.uri as string) || "",
    };
  });
}

export async function fetchPlaylistTracks(
  playlistId: string,
  market?: string,
  log?: LogFn
): Promise<TrackItem[]> {
  const marketParam = market ? `&market=${market}` : "";
  const items = await fetchAllPages(
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items?limit=100&additional_types=track${marketParam}`,
    log
  );
  return items.map((item) => parseTrack(item)!).filter(Boolean);
}

export async function fetchTopTracks(
  timeRange: string,
  log?: LogFn
): Promise<TrackItem[]> {
  const data = await spotifyGet(
    `https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=${timeRange}`,
    log
  );
  return (data.items || []).map(
    (track: Record<string, unknown>, i: number) => {
      const artists = (track.artists as Record<string, unknown>[]) || [];
      const album = (track.album as Record<string, unknown>) || {};
      const extUrls = (track.external_urls as Record<string, string>) || {};
      return {
        rank: i + 1,
        name: (track.name as string) || "",
        artist: artists.map((a) => (a.name as string) || "").join(", "),
        album: (album.name as string) || "",
        popularity: (track.popularity as number) || 0,
        spotify_url: extUrls.spotify || "",
        uri: (track.uri as string) || "",
      };
    }
  );
}

export async function fetchTopArtists(
  timeRange: string,
  log?: LogFn
): Promise<ArtistItem[]> {
  const data = await spotifyGet(
    `https://api.spotify.com/v1/me/top/artists?limit=50&time_range=${timeRange}`,
    log
  );
  return (data.items || []).map(
    (artist: Record<string, unknown>, i: number) => {
      const extUrls = (artist.external_urls as Record<string, string>) || {};
      const followers = (artist.followers as Record<string, unknown>) || {};
      return {
        rank: i + 1,
        name: (artist.name as string) || "",
        genres: ((artist.genres as string[]) || []).join(", "),
        followers: (followers.total as number) || 0,
        popularity: (artist.popularity as number) || 0,
        spotify_url: extUrls.spotify || "",
        uri: (artist.uri as string) || "",
      };
    }
  );
}

export async function fetchFollowedArtists(log?: LogFn): Promise<ArtistItem[]> {
  const artists: ArtistItem[] = [];
  let url: string | null =
    "https://api.spotify.com/v1/me/following?type=artist&limit=50";
  while (url) {
    const data = await spotifyGet(url, log);
    const artistsData = data.artists || data;
    for (const artist of artistsData.items || []) {
      const extUrls = (artist.external_urls as Record<string, string>) || {};
      const followers = (artist.followers as Record<string, unknown>) || {};
      artists.push({
        name: (artist.name as string) || "",
        genres: ((artist.genres as string[]) || []).join(", "),
        followers: (followers.total as number) || 0,
        popularity: (artist.popularity as number) || 0,
        spotify_url: extUrls.spotify || "",
        uri: (artist.uri as string) || "",
      });
    }
    url = artistsData.cursors?.after
      ? `https://api.spotify.com/v1/me/following?type=artist&limit=50&after=${artistsData.cursors.after}`
      : null;
  }
  return artists;
}

export async function fetchRecentlyPlayed(log?: LogFn): Promise<TrackItem[]> {
  const data = await spotifyGet(
    "https://api.spotify.com/v1/me/player/recently-played?limit=50",
    log
  );
  return (data.items || [])
    .map((item: Record<string, unknown>) => parseTrack(item, "played_at"))
    .filter(Boolean);
}
