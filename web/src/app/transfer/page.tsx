"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  isAuthenticated,
  logout,
  clearClientId,
  fetchCurrentUser,
  fetchLikedSongs,
  fetchPlaylists,
  fetchPlaylistTracks,
  type SpotifyUser,
  type PlaylistItem,
} from "@/lib/spotify";
import {
  isYouTubeAuthenticated,
  redirectToYouTubeAuth,
  logoutYouTube,
  getStoredGoogleClientId,
  saveGoogleClientId,
  getConfiguredYouTubeRedirectUri,
  transferLikedSongs,
  transferPlaylist,
  type TransferStats,
  type SpotifyTrackForTransfer,
  type TransferMatch,
} from "@/lib/youtube";

const TRANSFER_CATEGORIES = [
  { key: "liked_songs", label: "Liked Songs", icon: "❤️", desc: "Transfer all your Spotify liked songs — each matched track will be liked on YouTube Music" },
  { key: "playlists", label: "Playlists", icon: "📋", desc: "Recreate your Spotify playlists on YouTube Music with matching tracks" },
];

interface LogEntry {
  id: number;
  message: string;
  type: "info" | "success" | "error" | "warn" | "match" | "miss";
}

export default function TransferPage() {
  const router = useRouter();
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [ytConnected, setYtConnected] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(["liked_songs", "playlists"]));
  const [transferring, setTransferring] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [currentTrack, setCurrentTrack] = useState<string>("");
  const [stats, setStats] = useState<TransferStats | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  let logId = 0;

  // YouTube Music setup wizard state
  const [showYtSetup, setShowYtSetup] = useState(false);
  const [ytSetupStep, setYtSetupStep] = useState(0);
  const [googleClientIdInput, setGoogleClientIdInput] = useState("");
  const [hasGoogleClientId, setHasGoogleClientId] = useState(false);

  const addLog = useCallback(
    (message: string, type: LogEntry["type"] = "info") => {
      setLogs((prev) => [...prev, { id: logId++, message, type }]);
    },
    []
  );

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/");
      return;
    }
    setYtConnected(isYouTubeAuthenticated());
    setHasGoogleClientId(!!getStoredGoogleClientId());
    fetchCurrentUser()
      .then(setUser)
      .catch(() => {
        logout();
        router.replace("/");
      });
  }, [router]);

  const toggleCategory = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleConnectYouTube = () => {
    const stored = getStoredGoogleClientId();
    if (!stored) {
      setShowYtSetup(true);
      return;
    }
    redirectToYouTubeAuth();
  };

  const handleSaveAndConnectYouTube = () => {
    const trimmed = googleClientIdInput.trim();
    if (!trimmed) return;
    saveGoogleClientId(trimmed);
    setHasGoogleClientId(true);
    setShowYtSetup(false);
    redirectToYouTubeAuth();
  };

  const handleTransfer = async () => {
    if (selected.size === 0) {
      addLog("No categories selected.", "warn");
      return;
    }
    if (!ytConnected) {
      addLog("Connect to YouTube Music first.", "warn");
      return;
    }

    setTransferring(true);
    setLogs([]);
    setProgress(0);
    setStats(null);

    const overallStats: TransferStats = { matched: 0, notFound: 0, errors: 0, total: 0 };
    const market = user?.country;
    const log = (msg: string) => addLog(msg);

    try {
      addLog("Starting transfer — Spotify → YouTube Music", "info");

      if (selected.has("liked_songs")) {
        addLog("Fetching liked songs from Spotify…");
        const liked = await fetchLikedSongs(log);
        addLog(`Found ${liked.length} liked songs`, "success");

        setTotalSteps(liked.length);
        let currentStep = 0;

        addLog("Transferring liked songs to YouTube Music…");

        await transferLikedSongs(
          liked as SpotifyTrackForTransfer[],
          (s, current, match) => {
            currentStep++;
            setProgress(currentStep);
            setCurrentTrack(`${current.name} — ${current.artist}`);
            if (match) {
              const confPct = Math.round(match.confidence * 100);
              addLog(
                `${current.name} → ${match.title} (${confPct}% match)`,
                "match"
              );
            } else {
              addLog(
                `${current.name} by ${current.artist} — No match found`,
                "miss"
              );
            }
            overallStats.matched = s.matched;
            overallStats.notFound = s.notFound;
            overallStats.errors = s.errors;
            overallStats.total = s.total;
            setStats({ ...overallStats });
          },
          log
        );
      }

      if (selected.has("playlists")) {
        addLog("Fetching playlists from Spotify…");
        const playlists: PlaylistItem[] = await fetchPlaylists(log);
        addLog(`Found ${playlists.length} playlists`, "success");

        let playlistsCreated = 0;

        for (const pl of playlists) {
          addLog(`\nProcessing: ${pl.name}`);
          let tracks;
          try {
            tracks = await fetchPlaylistTracks(pl.id, market, log);
          } catch {
            addLog(`Skipped "${pl.name}" — access restricted`, "warn");
            continue;
          }

          if (!tracks || tracks.length === 0) {
            addLog(`Empty playlist — skipping`, "info");
            continue;
          }

          setTotalSteps(tracks.length);
          setProgress(0);
          let currentStep = 0;

          const plStats = await transferPlaylist(
            pl.name,
            tracks as SpotifyTrackForTransfer[],
            (s, current, match) => {
              currentStep++;
              setProgress(currentStep);
              setCurrentTrack(`${current.name} — ${current.artist}`);
              if (match) {
                const confPct = Math.round(match.confidence * 100);
                addLog(
                  `  ${current.name} → ${match.title} (${confPct}%)`,
                  "match"
                );
              } else {
                addLog(
                  `  ${current.name} — Not found`,
                  "miss"
                );
              }
            },
            log
          );

          if (plStats.playlistId) {
            playlistsCreated++;
            addLog(`Created "${pl.name}" with ${plStats.matched} tracks`, "success");
          }

          overallStats.matched += plStats.matched;
          overallStats.notFound += plStats.notFound;
          overallStats.errors += plStats.errors;
          overallStats.total += plStats.total;
          setStats({ ...overallStats });
        }

        addLog(`\nPlaylists created: ${playlistsCreated}/${playlists.length}`, "success");
      }

      setStats({ ...overallStats });
      addLog("\nTransfer complete!", "success");
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setTransferring(false);
      setCurrentTrack("");
    }
  };

  const handleLogout = () => {
    logout();
    logoutYouTube();
    router.replace("/");
  };

  const handleFullReset = () => {
    logout();
    logoutYouTube();
    clearClientId();
    router.replace("/");
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="h-5 w-5 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const progressPercent = totalSteps > 0 ? (progress / totalSteps) * 100 : 0;
  const transferComplete = stats !== null && !transferring && stats.total > 0;
  const redirectUri = typeof window !== "undefined" ? getConfiguredYouTubeRedirectUri() : "";

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      {/* YouTube Music Setup Wizard Modal */}
      {showYtSetup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md px-5">
          <div className="bg-neutral-900/95 rounded-2xl max-w-md w-full p-7 shadow-2xl border border-white/[0.08] backdrop-blur-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold tracking-tight">Connect YouTube Music</h2>
              <button
                onClick={() => setShowYtSetup(false)}
                className="w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {ytSetupStep === 0 && (
              <div className="space-y-5">
                <p className="text-sm text-neutral-400 leading-relaxed">
                  To transfer your music to YouTube Music, you&apos;ll need a Google Cloud project with the YouTube Data API enabled. This keeps your data private — nothing passes through our servers.
                </p>
                <div className="bg-neutral-800/60 rounded-xl p-5 space-y-4">
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <div>
                      <p className="text-sm text-neutral-200 font-medium">Open the Google Cloud Console</p>
                      <a
                        href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-red-400 hover:text-red-300 transition-colors mt-0.5 inline-block"
                      >
                        Enable YouTube Data API v3 →
                      </a>
                    </div>
                  </div>
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <div>
                      <p className="text-sm text-neutral-200">Go to <strong className="text-white">Credentials</strong>, click <strong className="text-white">Create Credentials → OAuth Client ID</strong></p>
                      <p className="text-xs text-neutral-500 mt-0.5">Select &quot;Web application&quot; as the type</p>
                    </div>
                  </div>
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <div>
                      <p className="text-sm text-neutral-200">Add this as an <strong className="text-white">Authorized redirect URI</strong>:</p>
                      <code className="text-xs text-red-400 bg-black/40 px-2.5 py-1.5 rounded-lg mt-1.5 block break-all font-mono">{redirectUri}</code>
                    </div>
                  </div>
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">4</span>
                    <p className="text-sm text-neutral-200">Copy the <strong className="text-white">Client ID</strong> (ends in <code className="text-red-400">.apps.googleusercontent.com</code>)</p>
                  </div>
                </div>
                <button
                  onClick={() => setYtSetupStep(1)}
                  className="w-full h-11 bg-white text-black text-sm font-semibold rounded-xl hover:bg-neutral-100 active:bg-neutral-200 transition-colors cursor-pointer"
                >
                  I have my Client ID
                </button>
              </div>
            )}

            {ytSetupStep === 1 && (
              <div className="space-y-5">
                <div>
                  <p className="text-sm text-neutral-400 leading-relaxed">
                    Paste your Google OAuth Client ID below. It stays in your browser&apos;s local storage and is never sent to any external server.
                  </p>
                </div>
                <div>
                  <label className="text-xs text-neutral-500 uppercase tracking-wider font-medium block mb-2">Google Client ID</label>
                  <input
                    type="text"
                    value={googleClientIdInput}
                    onChange={(e) => setGoogleClientIdInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveAndConnectYouTube()}
                    placeholder="e.g. 123456789.apps.googleusercontent.com"
                    autoFocus
                    className="w-full h-11 bg-neutral-800/80 border border-neutral-700/60 rounded-xl px-4 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/30 transition"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setYtSetupStep(0)}
                    className="h-11 px-5 text-sm text-neutral-400 hover:text-white transition-colors cursor-pointer rounded-xl"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSaveAndConnectYouTube}
                    disabled={!googleClientIdInput.trim()}
                    className="flex-1 h-11 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-500 disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    Connect YouTube Music
                  </button>
                </div>
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  <svg className="w-3 h-3 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <p className="text-xs text-neutral-600">
                    Secured with OAuth 2.0 PKCE — no client secret required
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-2xl border-b border-white/[0.06] animate-fade-in">
        <div className="max-w-xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <a href="/" className="text-[15px] font-semibold tracking-tight hover:text-neutral-300 transition-colors">Exportify</a>
            <span className="text-neutral-700">·</span>
            <span className="text-sm text-neutral-500">{user.display_name}</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/export" className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">Export</a>
            <span className="text-xs text-white font-medium">Transfer</span>
            <button
              onClick={handleFullReset}
              className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors cursor-pointer"
            >
              Reset
            </button>
            <button
              onClick={handleLogout}
              className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-10 pb-20">
        <div className="max-w-xl mx-auto px-6">
          {/* Page Title */}
          <div className="mb-8 animate-slide-up">
            <div className="flex items-center gap-2.5 mb-2">
              <h1 className="text-2xl font-semibold tracking-tight">Transfer to YouTube Music</h1>
            </div>
            <p className="text-sm text-neutral-500 leading-relaxed">
              Move your Spotify music library to YouTube Music. Exportify searches for each track, matches it with confidence scoring, and recreates your library on YouTube Music.
            </p>
          </div>

          {/* Connection Status */}
          <div className="mb-8 animate-slide-up" style={{ animationDelay: "50ms" }}>
            <span className="text-xs text-neutral-500 uppercase tracking-widest font-medium block mb-3">Connections</span>
            <div className="rounded-2xl bg-neutral-900/80 border border-white/[0.04] divide-y divide-white/[0.04]">
              {/* Spotify */}
              <div className="flex items-center gap-3.5 px-5 py-4">
                <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium text-white block">Spotify</span>
                  <span className="text-xs text-green-500">Connected as {user.display_name}</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
              </div>

              {/* YouTube Music */}
              <div className="flex items-center gap-3.5 px-5 py-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${ytConnected ? "bg-red-500/10" : "bg-neutral-800"}`}>
                  <svg className={`w-4 h-4 ${ytConnected ? "text-red-500" : "text-neutral-600"}`} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium text-white block">YouTube Music</span>
                  {ytConnected ? (
                    <span className="text-xs text-red-400">Connected</span>
                  ) : (
                    <button
                      onClick={handleConnectYouTube}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                    >
                      Click to connect →
                    </button>
                  )}
                </div>
                <span className={`w-2 h-2 rounded-full ${ytConnected ? "bg-red-500" : "bg-neutral-700"}`}></span>
              </div>
            </div>
            {hasGoogleClientId && !ytConnected && (
              <button
                onClick={() => { setShowYtSetup(true); setYtSetupStep(1); setGoogleClientIdInput(getStoredGoogleClientId()); }}
                className="block mt-2 text-xs text-neutral-600 hover:text-neutral-400 transition-colors cursor-pointer"
              >
                Change Google Client ID
              </button>
            )}
          </div>

          {/* Transfer Categories */}
          <div className="mb-8 animate-slide-up" style={{ animationDelay: "100ms" }}>
            <span className="text-xs text-neutral-500 uppercase tracking-widest font-medium block mb-3">What to Transfer</span>
            <div className="rounded-2xl bg-neutral-900/80 divide-y divide-white/[0.04] border border-white/[0.04]">
              {TRANSFER_CATEGORIES.map(({ key, label, icon, desc }) => {
                const on = selected.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleCategory(key)}
                    className="w-full flex items-center gap-3.5 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
                  >
                    <span className="text-lg">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium block transition-colors ${on ? "text-white" : "text-neutral-500"}`}>{label}</span>
                      <span className="text-xs text-neutral-600 block mt-0.5 leading-relaxed">{desc}</span>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                      ${on ? "bg-red-500 border-red-500" : "border-neutral-700"}`}>
                      {on && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Direction indicator */}
          <div className="mb-8 animate-slide-up" style={{ animationDelay: "150ms" }}>
            <div className="rounded-2xl bg-neutral-900/80 border border-white/[0.04] p-5">
              <div className="flex items-center justify-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium">Spotify</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-8 h-px bg-gradient-to-r from-green-500/50 to-red-500/50"></div>
                  <svg className="w-4 h-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <div className="w-8 h-px bg-gradient-to-r from-red-500/50 to-red-500/20"></div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium">YouTube Music</span>
                </div>
              </div>
            </div>
          </div>

          {/* Transfer Button */}
          <div className="mb-10 animate-slide-up" style={{ animationDelay: "200ms" }}>
            <button
              onClick={handleTransfer}
              disabled={transferring || selected.size === 0 || !ytConnected}
              className="w-full h-12 bg-red-600 text-white text-sm font-semibold rounded-xl
                hover:bg-red-500 active:bg-red-700
                disabled:bg-neutral-800/80 disabled:text-neutral-600 disabled:cursor-not-allowed
                transition-colors cursor-pointer"
            >
              {transferring ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 border-2 border-red-300 border-t-white rounded-full animate-spin" />
                  Transferring…
                </span>
              ) : !ytConnected ? (
                "Connect YouTube Music to start"
              ) : selected.size === 0 ? (
                "Select at least one category"
              ) : (
                "Start Transfer"
              )}
            </button>
            {!ytConnected && (
              <p className="text-xs text-neutral-600 mt-2 text-center">
                You&apos;ll need to connect both Spotify and YouTube Music before transferring.
              </p>
            )}
          </div>

          {/* Transfer Stats */}
          {stats && (
            <div className="mb-6 animate-slide-up">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-green-400 tabular-nums">{stats.matched}</div>
                  <div className="text-xs text-green-500/70 mt-1">Matched</div>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-amber-400 tabular-nums">{stats.notFound}</div>
                  <div className="text-xs text-amber-500/70 mt-1">Not Found</div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-red-400 tabular-nums">{stats.errors}</div>
                  <div className="text-xs text-red-500/70 mt-1">Errors</div>
                </div>
              </div>
            </div>
          )}

          {/* Activity Log */}
          {(logs.length > 0 || totalSteps > 0) && (
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-xs text-neutral-500 uppercase tracking-widest font-medium">Activity</span>
                {totalSteps > 0 && (
                  <span className="text-xs text-neutral-600 tabular-nums font-medium">{progress}/{totalSteps}</span>
                )}
              </div>

              {totalSteps > 0 && (
                <div className="mb-4">
                  <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out bg-red-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  {currentTrack && (
                    <p className="text-xs text-neutral-600 mt-1.5 truncate">{currentTrack}</p>
                  )}
                </div>
              )}

              {transferComplete && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-400">Transfer complete</p>
                    <p className="text-xs text-green-500/60 mt-0.5">
                      {stats.matched} of {stats.total} tracks were successfully transferred to YouTube Music.
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-neutral-900/80 rounded-xl p-4 max-h-72 overflow-y-auto space-y-1 font-mono border border-white/[0.04]">
                {logs.map((entry) => (
                  <div
                    key={entry.id}
                    className={`text-xs leading-relaxed flex items-start gap-2
                      ${entry.type === "success" ? "text-green-500"
                        : entry.type === "error" ? "text-red-400"
                        : entry.type === "warn" ? "text-amber-400"
                        : entry.type === "match" ? "text-green-400/80"
                        : entry.type === "miss" ? "text-amber-400/60"
                        : "text-neutral-500"}`}
                  >
                    <span className="shrink-0 mt-0.5">
                      {entry.type === "success" ? "✓"
                        : entry.type === "error" ? "✗"
                        : entry.type === "warn" ? "!"
                        : entry.type === "match" ? "→"
                        : entry.type === "miss" ? "?"
                        : "·"}
                    </span>
                    <span>{entry.message}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
