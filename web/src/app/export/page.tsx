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
  fetchTopTracks,
  fetchTopArtists,
  fetchFollowedArtists,
  fetchRecentlyPlayed,
  type SpotifyUser,
  type TrackItem,
} from "@/lib/spotify";
import { downloadJSON, downloadCSV } from "@/lib/export";

const CATEGORIES = [
  { key: "liked_songs", label: "Liked Songs", icon: "❤️", desc: "All your saved tracks with artist, album, and date added" },
  { key: "playlists", label: "Playlists & Tracks", icon: "📋", desc: "Every playlist with full track listings including collaboratives" },
  { key: "top_tracks", label: "Top Tracks", icon: "🎵", desc: "Your most-played tracks, ranked by listening frequency" },
  { key: "top_artists", label: "Top Artists", icon: "🎤", desc: "Your most-listened artists, ranked by play count" },
  { key: "followed_artists", label: "Followed Artists", icon: "👥", desc: "All artists you follow with genre and popularity data" },
  { key: "recently_played", label: "Recently Played", icon: "🕐", desc: "Your last 50 played tracks with timestamps" },
];

const TIME_RANGES: { key: string; label: string }[] = [
  { key: "short_term", label: "4 weeks" },
  { key: "medium_term", label: "6 months" },
  { key: "long_term", label: "All time" },
];

interface LogEntry {
  id: number;
  message: string;
  type: "info" | "success" | "error" | "warn";
}

export default function ExportPage() {
  const router = useRouter();
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(CATEGORIES.map((c) => c.key))
  );
  const [selectedRanges, setSelectedRanges] = useState<Set<string>>(
    new Set(TIME_RANGES.map((r) => r.key))
  );
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [exporting, setExporting] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);

  const addLog = useCallback(
    (message: string, type: LogEntry["type"] = "info") => {
      setLogs((prev) => [...prev, { id: logIdRef.current++, message, type }]);
    },
    []
  );

  const toggleRange = (key: string) => {
    setSelectedRanges((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/");
      return;
    }
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

  const selectAll = () => setSelected(new Set(CATEGORIES.map((c) => c.key)));
  const selectNone = () => setSelected(new Set());

  const handleExport = async () => {
    if (selected.size === 0) {
      addLog("No categories selected.", "warn");
      return;
    }

    const needsRanges = selected.has("top_tracks") || selected.has("top_artists");
    if (needsRanges && selectedRanges.size === 0) {
      addLog("Top Tracks or Top Artists selected but no time ranges chosen.", "warn");
      return;
    }

    setExporting(true);
    setLogs([]);
    setProgress(0);

    const activeRangeCount = selectedRanges.size;
    let steps = 0;
    for (const s of selected) {
      if (s === "top_tracks" || s === "top_artists") steps += activeRangeCount;
      else steps += 1;
    }
    steps += 1;
    setTotalSteps(steps);

    let currentStep = 0;
    const advance = () => {
      currentStep++;
      setProgress(currentStep);
    };

    const combined: Record<string, unknown> = {};
    const market = user?.country;
    const log = (msg: string) => addLog(msg);

    try {
      addLog(`Starting export — ${format.toUpperCase()} format`, "info");

      if (selected.has("liked_songs")) {
        addLog("Fetching liked songs…");
        const liked = await fetchLikedSongs(log);
        combined.liked_songs = liked;
        addLog(`Liked songs — ${liked.length} items`, "success");
        advance();
      }

      if (selected.has("playlists")) {
        addLog("Fetching playlists…");
        const playlists = await fetchPlaylists(log);
        combined.playlists = playlists;
        addLog(`Playlists — ${playlists.length} found`, "success");

        const playlistTracks: Record<string, TrackItem[]> = {};
        for (const pl of playlists) {
          addLog(`  ${pl.name.slice(0, 50)}…`);
          try {
            const tracks = await fetchPlaylistTracks(pl.id, market, log);
            playlistTracks[pl.name] = tracks;
            addLog(`  ${pl.name.slice(0, 50)} — ${tracks.length} tracks`, "success");
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            addLog(`  Skipped "${pl.name.slice(0, 50)}" — ${msg}`, "warn");
          }
        }
        combined.playlist_tracks = playlistTracks;
        advance();
      }

      if (selected.has("top_tracks")) {
        const ranges = TIME_RANGES.filter((r) => selectedRanges.has(r.key));
        for (const { key: range, label } of ranges) {
          addLog(`Fetching top tracks (${label})…`);
          const tracks = await fetchTopTracks(range, log);
          combined[`top_tracks_${range}`] = tracks;
          addLog(`Top tracks (${label}) — ${tracks.length} items`, "success");
          advance();
        }
      }

      if (selected.has("top_artists")) {
        const ranges = TIME_RANGES.filter((r) => selectedRanges.has(r.key));
        for (const { key: range, label } of ranges) {
          addLog(`Fetching top artists (${label})…`);
          const artists = await fetchTopArtists(range, log);
          combined[`top_artists_${range}`] = artists;
          addLog(`Top artists (${label}) — ${artists.length} items`, "success");
          advance();
        }
      }

      if (selected.has("followed_artists")) {
        addLog("Fetching followed artists…");
        const followed = await fetchFollowedArtists(log);
        combined.followed_artists = followed;
        addLog(`Followed artists — ${followed.length} items`, "success");
        advance();
      }

      if (selected.has("recently_played")) {
        addLog("Fetching recently played…");
        const recent = await fetchRecentlyPlayed(log);
        combined.recently_played = recent;
        addLog(`Recently played — ${recent.length} items`, "success");
        advance();
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      if (format === "json") {
        downloadJSON(combined, `exportify_${timestamp}.json`);
      } else {
        for (const [key, value] of Object.entries(combined)) {
          if (Array.isArray(value) && value.length > 0) {
            downloadCSV(value as Record<string, unknown>[], `${key}_${timestamp}.csv`);
          }
        }
      }
      advance();

      addLog("Export complete. Download started.", "success");
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setExporting(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.replace("/");
  };

  const handleFullReset = () => {
    logout();
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

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-neutral-800/50">
        <div className="max-w-xl mx-auto px-5 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-bold tracking-tight">Exportify</span>
            <span className="text-neutral-700 text-xs">|</span>
            <span className="text-sm text-neutral-500">{user.display_name}</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleFullReset}
              title="Clear your Client ID and sign out"
              className="text-xs text-neutral-600 hover:text-neutral-400 transition cursor-pointer"
            >
              Reset
            </button>
            <button
              onClick={handleLogout}
              title="Sign out of your Spotify account"
              className="text-xs text-neutral-500 hover:text-neutral-300 transition cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-10 pb-20 px-5">
        <div className="max-w-xl mx-auto">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Export Your Data</h1>
          <p className="text-sm text-neutral-500 mb-8 leading-relaxed">
            Choose the categories you&apos;d like to export, pick a format, and download. Everything is fetched directly from Spotify and saved to your device.
          </p>

          {/* Categories */}
          <div className="mb-8">
            <div className="flex items-baseline justify-between mb-2.5">
              <div>
                <span className="text-xs text-neutral-500 uppercase tracking-wider">Categories</span>
                <p className="text-[11px] text-neutral-600 mt-0.5">Select the data you want to include in your export</p>
              </div>
              <div className="flex gap-3">
                <button onClick={selectAll} className="text-xs text-neutral-500 hover:text-white transition cursor-pointer">All</button>
                <button onClick={selectNone} className="text-xs text-neutral-500 hover:text-white transition cursor-pointer">None</button>
              </div>
            </div>
            <div className="rounded-xl bg-neutral-900 divide-y divide-neutral-800/60">
              {CATEGORIES.map(({ key, label, icon, desc }) => {
                const on = selected.has(key);
                const hasRanges = key === "top_tracks" || key === "top_artists";
                return (
                  <div key={key}>
                    <button
                      onClick={() => toggleCategory(key)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-neutral-800/50 transition cursor-pointer"
                    >
                      <span className="text-base">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium block ${on ? "text-white" : "text-neutral-500"}`}>{label}</span>
                        <span className="text-xs text-neutral-600 block mt-0.5">{desc}</span>
                      </div>
                      {on && (
                        <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    {hasRanges && on && (
                      <div className="px-4 pb-3 pt-0 flex items-center gap-2 pl-12">
                        <span className="text-[11px] text-neutral-600 mr-1">Time range</span>
                        {TIME_RANGES.map(({ key: rKey, label: rLabel }) => {
                          const rangeOn = selectedRanges.has(rKey);
                          return (
                            <button
                              key={rKey}
                              onClick={() => toggleRange(rKey)}
                              className={`px-3 py-1 rounded-full text-[11px] font-medium transition cursor-pointer border
                                ${rangeOn
                                  ? "bg-green-600/20 border-green-600/40 text-green-400"
                                  : "bg-neutral-800/60 border-neutral-700/50 text-neutral-500 hover:text-neutral-300 hover:border-neutral-600"}`}
                            >
                              {rLabel}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Format */}
          <div className="mb-8">
            <span className="text-xs text-neutral-500 uppercase tracking-wider block mb-2.5">Format</span>
            <div className="inline-flex bg-neutral-900 rounded-xl p-1 gap-1">
              {(["json", "csv"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`px-6 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition cursor-pointer
                    ${format === f ? "bg-neutral-700 text-white shadow-sm" : "text-neutral-500 hover:text-neutral-300"}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-600 mt-2">
              {format === "json"
                ? "JSON — Single file with all selected data in a structured format. Best for developers and data processing."
                : "CSV — One spreadsheet file per category. Best for opening in Excel, Google Sheets, or Numbers."}
            </p>
          </div>

          {/* Export */}
          <button
            onClick={handleExport}
            disabled={exporting || selected.size === 0}
            className="w-full h-12 bg-white text-black text-sm font-semibold rounded-xl
              hover:bg-neutral-200 active:bg-neutral-300
              disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed
              transition cursor-pointer mb-10"
          >
            {exporting ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 border-2 border-neutral-400 border-t-black rounded-full animate-spin" />
                Exporting…
              </span>
            ) : (
              `Export ${selected.size} ${selected.size === 1 ? "Category" : "Categories"}`
            )}
          </button>

          {/* Activity */}
          {(logs.length > 0 || totalSteps > 0) && (
            <div>
              <div className="flex items-baseline justify-between mb-2.5">
                <div>
                  <span className="text-xs text-neutral-500 uppercase tracking-wider">Activity Log</span>
                  {!exporting && progress > 0 && progress === totalSteps && (
                    <p className="text-[11px] text-green-500/80 mt-0.5">All done — your files have been downloaded</p>
                  )}
                </div>
                {totalSteps > 0 && (
                  <span className="text-xs text-neutral-600 tabular-nums font-medium">{progress}/{totalSteps}</span>
                )}
              </div>

              {totalSteps > 0 && (
                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}

              <div className="bg-neutral-900 rounded-xl p-4 max-h-80 overflow-y-auto space-y-0.5 font-mono">
                {logs.map((entry) => (
                  <div
                    key={entry.id}
                    className={`text-xs leading-relaxed
                      ${entry.type === "success" ? "text-green-500"
                        : entry.type === "error" ? "text-red-400"
                        : entry.type === "warn" ? "text-amber-400"
                        : "text-neutral-500"}`}
                  >
                    {entry.message}
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
