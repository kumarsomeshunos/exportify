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
  {
    key: "liked_songs",
    label: "Liked Songs",
    icon: "❤️",
    desc: "Every track you've saved to your library, with artist, album, and date added.",
  },
  {
    key: "playlists",
    label: "Playlists & Tracks",
    icon: "📋",
    desc: "All your playlists — including collaborative ones — with full track listings.",
  },
  {
    key: "top_tracks",
    label: "Top Tracks",
    icon: "🎵",
    desc: "Your top 50 most-played tracks, ranked by listening frequency.",
  },
  {
    key: "top_artists",
    label: "Top Artists",
    icon: "🎤",
    desc: "Your top 50 most-listened-to artists, ranked by total play count.",
  },
  {
    key: "followed_artists",
    label: "Followed Artists",
    icon: "👥",
    desc: "A complete list of every artist you follow, with genres and follower counts.",
  },
  {
    key: "recently_played",
    label: "Recently Played",
    icon: "🕐",
    desc: "Your last 50 played tracks with exact timestamps.",
  },
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

  const selectAll = () =>
    setSelected(new Set(CATEGORIES.map((c) => c.key)));
  const selectNone = () => setSelected(new Set());

  const handleExport = async () => {
    if (selected.size === 0) {
      addLog("No categories selected.", "warn");
      return;
    }

    const needsRanges =
      selected.has("top_tracks") || selected.has("top_artists");
    if (needsRanges && selectedRanges.size === 0) {
      addLog(
        "Select at least one time range for top tracks/artists.",
        "warn"
      );
      return;
    }

    setExporting(true);
    setLogs([]);
    setProgress(0);

    const rangeCount = selectedRanges.size;
    let steps = 0;
    for (const s of selected) {
      if (s === "top_tracks" || s === "top_artists") steps += rangeCount;
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
            addLog(
              `  ${pl.name.slice(0, 50)} — ${tracks.length} tracks`,
              "success"
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            addLog(
              `  Skipped "${pl.name.slice(0, 50)}" — ${msg}`,
              "warn"
            );
          }
        }
        combined.playlist_tracks = playlistTracks;
        advance();
      }

      if (selected.has("top_tracks")) {
        const ranges = TIME_RANGES.filter((r) =>
          selectedRanges.has(r.key)
        );
        for (const { key: range, label } of ranges) {
          addLog(`Fetching top tracks (${label})…`);
          const tracks = await fetchTopTracks(range, log);
          combined[`top_tracks_${range}`] = tracks;
          addLog(
            `Top tracks (${label}) — ${tracks.length} items`,
            "success"
          );
          advance();
        }
      }

      if (selected.has("top_artists")) {
        const ranges = TIME_RANGES.filter((r) =>
          selectedRanges.has(r.key)
        );
        for (const { key: range, label } of ranges) {
          addLog(`Fetching top artists (${label})…`);
          const artists = await fetchTopArtists(range, log);
          combined[`top_artists_${range}`] = artists;
          addLog(
            `Top artists (${label}) — ${artists.length} items`,
            "success"
          );
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

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      if (format === "json") {
        downloadJSON(combined, `exportify_${timestamp}.json`);
      } else {
        for (const [key, value] of Object.entries(combined)) {
          if (Array.isArray(value) && value.length > 0) {
            downloadCSV(
              value as Record<string, unknown>[],
              `${key}_${timestamp}.csv`
            );
          }
        }
      }
      advance();

      addLog("Export complete. Download started.", "success");
    } catch (err) {
      addLog(
        `Error: ${err instanceof Error ? err.message : String(err)}`,
        "error"
      );
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

  const progressPercent =
    totalSteps > 0 ? (progress / totalSteps) * 100 : 0;
  const showTimeRange =
    selected.has("top_tracks") || selected.has("top_artists");

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-neutral-800/50">
        <div className="max-w-xl mx-auto px-5 h-11 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">
              Exportify
            </span>
            <span className="text-neutral-700 text-xs">&middot;</span>
            <span className="text-sm text-neutral-500">
              {user.display_name}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleFullReset}
              className="text-xs text-neutral-600 hover:text-neutral-400 transition cursor-pointer"
            >
              Reset
            </button>
            <button
              onClick={handleLogout}
              className="text-xs text-neutral-500 hover:text-neutral-300 transition cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-8 pb-20 px-5">
        <div className="max-w-xl mx-auto">
          {/* Page Title */}
          <div className="mb-8">
            <h1 className="text-xl font-semibold tracking-tight mb-1">
              Export your data
            </h1>
            <p className="text-sm text-neutral-500 leading-relaxed">
              Choose what to export, pick a time range for your top
              tracks and artists, select a format, and download.
            </p>
          </div>

          {/* Categories */}
          <div className="mb-8">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs text-neutral-500 uppercase tracking-wider font-medium">
                Categories
              </span>
              <div className="flex gap-3">
                <button
                  onClick={selectAll}
                  className="text-xs text-neutral-500 hover:text-white transition cursor-pointer"
                >
                  All
                </button>
                <button
                  onClick={selectNone}
                  className="text-xs text-neutral-500 hover:text-white transition cursor-pointer"
                >
                  None
                </button>
              </div>
            </div>
            <p className="text-xs text-neutral-600 mb-3">
              Select the data you&apos;d like to include in your export.
            </p>
            <div className="rounded-xl bg-neutral-900/70 border border-neutral-800/40 divide-y divide-neutral-800/60 overflow-hidden">
              {CATEGORIES.map(({ key, label, icon, desc }) => {
                const on = selected.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleCategory(key)}
                    className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-neutral-800/40 transition cursor-pointer"
                  >
                    <span className="text-base">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <span
                        className={`text-[15px] block font-medium ${on ? "text-white" : "text-neutral-500"}`}
                      >
                        {label}
                      </span>
                      <span className="text-xs text-neutral-600 block leading-snug mt-0.5">
                        {desc}
                      </span>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        on
                          ? "bg-green-500 border-green-500"
                          : "border-neutral-700"
                      }`}
                    >
                      {on && (
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time Range */}
          {showTimeRange && (
            <div className="mb-8">
              <span className="text-xs text-neutral-500 uppercase tracking-wider font-medium block mb-1">
                Time Range
              </span>
              <p className="text-xs text-neutral-600 mb-3">
                Choose which time periods to include for your top tracks
                and artists. At least one must be selected.
              </p>
              <div className="inline-flex bg-neutral-900/70 border border-neutral-800/40 rounded-xl p-1 gap-1 flex-wrap">
                {TIME_RANGES.map(({ key, label }) => {
                  const on = selectedRanges.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setSelectedRanges((prev) => {
                          const next = new Set(prev);
                          if (next.has(key) && next.size > 1)
                            next.delete(key);
                          else next.add(key);
                          return next;
                        });
                      }}
                      className={`px-4 py-1.5 rounded-lg text-xs font-medium tracking-wide transition cursor-pointer
                        ${on ? "bg-neutral-700 text-white" : "text-neutral-500 hover:text-neutral-300"}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Format */}
          <div className="mb-8">
            <span className="text-xs text-neutral-500 uppercase tracking-wider font-medium block mb-1">
              Format
            </span>
            <p className="text-xs text-neutral-600 mb-3">
              {format === "json"
                ? "JSON preserves the full data structure in a single file — ideal for backups and developers."
                : "CSV exports each category as a separate spreadsheet-compatible file."}
            </p>
            <div className="inline-flex bg-neutral-900/70 border border-neutral-800/40 rounded-xl p-1 gap-1">
              {(["json", "csv"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`px-5 py-1.5 rounded-lg text-xs font-medium uppercase tracking-wider transition cursor-pointer
                    ${format === f ? "bg-neutral-700 text-white" : "text-neutral-500 hover:text-neutral-300"}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={exporting || selected.size === 0}
            className="w-full h-12 bg-white text-black text-[15px] font-semibold rounded-xl
              hover:bg-neutral-200 active:bg-neutral-300
              disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed
              transition cursor-pointer mb-8"
          >
            {exporting ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 border-2 border-neutral-400 border-t-black rounded-full animate-spin" />
                Exporting…
              </span>
            ) : selected.size === 0 ? (
              "Select at least one category"
            ) : (
              `Export ${selected.size} ${selected.size === 1 ? "category" : "categories"}`
            )}
          </button>

          {/* Activity */}
          {(logs.length > 0 || totalSteps > 0) && (
            <div className="mb-8">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-medium">
                  Activity
                </span>
                {totalSteps > 0 && (
                  <span className="text-xs text-neutral-600 tabular-nums">
                    {progress}/{totalSteps}
                  </span>
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

              <div className="bg-neutral-900/70 border border-neutral-800/40 rounded-xl p-4 max-h-80 overflow-y-auto space-y-0.5 font-mono">
                {logs.map((entry) => (
                  <div
                    key={entry.id}
                    className={`text-xs leading-relaxed
                      ${
                        entry.type === "success"
                          ? "text-green-500"
                          : entry.type === "error"
                            ? "text-red-400"
                            : entry.type === "warn"
                              ? "text-amber-400"
                              : "text-neutral-500"
                      }`}
                  >
                    {entry.message}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}

          {/* Footer help */}
          <div className="text-center pt-4 border-t border-neutral-800/30">
            <p className="text-xs text-neutral-600">
              Having trouble?{" "}
              <a
                href="https://github.com/kumarsomeshunos/exportify/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-500 hover:text-neutral-300 transition"
              >
                Open an issue on GitHub
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
