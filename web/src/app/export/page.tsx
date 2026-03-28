"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  isAuthenticated,
  logout,
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
  { key: "liked_songs", label: "Liked Songs", icon: "❤️", desc: "All your saved tracks" },
  { key: "playlists", label: "Playlists & Tracks", icon: "📋", desc: "Every playlist with full track listings" },
  { key: "top_tracks", label: "Top Tracks", icon: "🎵", desc: "Short, medium & all-time rankings" },
  { key: "top_artists", label: "Top Artists", icon: "🎤", desc: "Short, medium & all-time rankings" },
  { key: "followed_artists", label: "Followed Artists", icon: "👥", desc: "Artists you follow" },
  { key: "recently_played", label: "Recently Played", icon: "🕐", desc: "Last 50 played tracks" },
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
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [exporting, setExporting] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);
  let logId = 0;

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

    setExporting(true);
    setLogs([]);
    setProgress(0);

    let steps = 0;
    for (const s of selected) {
      if (s === "top_tracks" || s === "top_artists") steps += 3;
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
        const ranges: [string, string][] = [
          ["short_term", "4 weeks"],
          ["medium_term", "6 months"],
          ["long_term", "all time"],
        ];
        for (const [range, label] of ranges) {
          addLog(`Fetching top tracks (${label})…`);
          const tracks = await fetchTopTracks(range, log);
          combined[`top_tracks_${range}`] = tracks;
          addLog(`Top tracks (${label}) — ${tracks.length} items`, "success");
          advance();
        }
      }

      if (selected.has("top_artists")) {
        const ranges: [string, string][] = [
          ["short_term", "4 weeks"],
          ["medium_term", "6 months"],
          ["long_term", "all time"],
        ];
        for (const [range, label] of ranges) {
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
        <div className="max-w-xl mx-auto px-5 h-11 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Exportify</span>
            <span className="text-neutral-600 text-xs">·</span>
            <span className="text-sm text-neutral-500">{user.display_name}</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 pt-8 pb-16 px-5">
        <div className="max-w-xl mx-auto">
          <h1 className="text-xl font-semibold tracking-tight mb-6">Export</h1>

          {/* Categories */}
          <div className="mb-6">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs text-neutral-500 uppercase tracking-wider">Categories</span>
              <div className="flex gap-3">
                <button onClick={selectAll} className="text-xs text-neutral-500 hover:text-white transition cursor-pointer">All</button>
                <button onClick={selectNone} className="text-xs text-neutral-500 hover:text-white transition cursor-pointer">None</button>
              </div>
            </div>
            <div className="rounded-lg bg-neutral-900 divide-y divide-neutral-800">
              {CATEGORIES.map(({ key, label, icon, desc }) => {
                const on = selected.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleCategory(key)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-neutral-800/50 transition cursor-pointer"
                  >
                    <span className="text-sm">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm block ${on ? "text-white" : "text-neutral-500"}`}>{label}</span>
                      <span className="text-xs text-neutral-600 block">{desc}</span>
                    </div>
                    {on && (
                      <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Format */}
          <div className="mb-6">
            <span className="text-xs text-neutral-500 uppercase tracking-wider block mb-2">Format</span>
            <div className="inline-flex bg-neutral-900 rounded-lg p-1 gap-1">
              {(["json", "csv"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`px-5 py-1.5 rounded-md text-xs font-medium uppercase tracking-wider transition cursor-pointer
                    ${format === f ? "bg-neutral-700 text-white" : "text-neutral-500 hover:text-neutral-300"}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Export */}
          <button
            onClick={handleExport}
            disabled={exporting || selected.size === 0}
            className="w-full h-11 bg-white text-black text-sm font-semibold rounded-lg
              hover:bg-neutral-200 active:bg-neutral-300
              disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed
              transition cursor-pointer mb-8"
          >
            {exporting ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 border-2 border-neutral-400 border-t-black rounded-full animate-spin" />
                Exporting…
              </span>
            ) : (
              "Export"
            )}
          </button>

          {/* Activity */}
          {(logs.length > 0 || totalSteps > 0) && (
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs text-neutral-500 uppercase tracking-wider">Activity</span>
                {totalSteps > 0 && (
                  <span className="text-xs text-neutral-600 tabular-nums">{progress}/{totalSteps}</span>
                )}
              </div>

              {totalSteps > 0 && (
                <div className="h-1 bg-neutral-800 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}

              <div className="bg-neutral-900 rounded-lg p-4 max-h-80 overflow-y-auto space-y-0.5 font-mono">
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
