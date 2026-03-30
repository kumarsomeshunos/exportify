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
  { key: "liked_songs", label: "Liked Songs", icon: "❤️", desc: "Every track you've saved to your library" },
  { key: "playlists", label: "Playlists & Tracks", icon: "📋", desc: "All playlists with complete track listings" },
  { key: "top_tracks", label: "Top Tracks", icon: "🎵", desc: "Your most-played songs, ranked by listening time" },
  { key: "top_artists", label: "Top Artists", icon: "🎤", desc: "Artists you listen to most, ranked by play count" },
  { key: "followed_artists", label: "Followed Artists", icon: "👥", desc: "Every artist you follow on Spotify" },
  { key: "recently_played", label: "Recently Played", icon: "🕐", desc: "Your last 50 played tracks with timestamps" },
];

const TIME_RANGES: { key: string; label: string; hint: string }[] = [
  { key: "short_term", label: "Last 4 Weeks", hint: "Recent favorites" },
  { key: "medium_term", label: "Last 6 Months", hint: "Medium-term trends" },
  { key: "long_term", label: "All Time", hint: "Lifetime listening history" },
];

const LIMIT_OPTIONS: { value: number | undefined; label: string }[] = [
  { value: 50, label: "Top 50" },
  { value: 100, label: "Top 100" },
  { value: undefined, label: "All" },
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
    new Set(["top_tracks_long_term", "top_artists_long_term"])
  );
  const [topLimit, setTopLimit] = useState<number | undefined>(undefined);
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

  const toggleRange = (rangeKey: string) => {
    setSelectedRanges((prev) => {
      const next = new Set(prev);
      if (next.has(rangeKey)) next.delete(rangeKey);
      else next.add(rangeKey);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(CATEGORIES.map((c) => c.key)));
    setSelectedRanges(new Set([
      "top_tracks_short_term", "top_tracks_medium_term", "top_tracks_long_term",
      "top_artists_short_term", "top_artists_medium_term", "top_artists_long_term",
    ]));
  };
  const selectNone = () => {
    setSelected(new Set());
    setSelectedRanges(new Set());
  };

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
      if (s === "top_tracks") {
        steps += TIME_RANGES.filter((r) => selectedRanges.has(`top_tracks_${r.key}`)).length;
      } else if (s === "top_artists") {
        steps += TIME_RANGES.filter((r) => selectedRanges.has(`top_artists_${r.key}`)).length;
      } else {
        steps += 1;
      }
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
        const activeRanges = TIME_RANGES.filter((r) => selectedRanges.has(`top_tracks_${r.key}`));
        const limitLabel = topLimit ? `top ${topLimit}` : "all";
        for (const { key: range, label } of activeRanges) {
          addLog(`Fetching ${limitLabel} top tracks (${label})…`);
          const tracks = await fetchTopTracks(range, log, topLimit);
          combined[`top_tracks_${range}`] = tracks;
          addLog(`Top tracks (${label}) — ${tracks.length} items`, "success");
          advance();
        }
      }

      if (selected.has("top_artists")) {
        const activeRanges = TIME_RANGES.filter((r) => selectedRanges.has(`top_artists_${r.key}`));
        const limitLabel = topLimit ? `top ${topLimit}` : "all";
        for (const { key: range, label } of activeRanges) {
          addLog(`Fetching ${limitLabel} top artists (${label})…`);
          const artists = await fetchTopArtists(range, log, topLimit);
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
  const exportComplete = totalSteps > 0 && progress >= totalSteps && !exporting;

  const selectedCount = selected.size;
  const summaryParts: string[] = [];
  for (const cat of CATEGORIES) {
    if (!selected.has(cat.key)) continue;
    if (cat.key === "top_tracks") {
      const count = TIME_RANGES.filter((r) => selectedRanges.has(`top_tracks_${r.key}`)).length;
      if (count > 0) summaryParts.push(`Top Tracks (${count} ${count === 1 ? "range" : "ranges"})`);
    } else if (cat.key === "top_artists") {
      const count = TIME_RANGES.filter((r) => selectedRanges.has(`top_artists_${r.key}`)).length;
      if (count > 0) summaryParts.push(`Top Artists (${count} ${count === 1 ? "range" : "ranges"})`);
    } else {
      summaryParts.push(cat.label);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-2xl border-b border-white/[0.06] animate-fade-in">
        <div className="max-w-xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <a href="/" className="text-[15px] font-semibold tracking-tight hover:text-neutral-300 transition-colors">Exportify</a>
            <span className="text-neutral-700">·</span>
            <span className="text-sm text-neutral-500">{user.display_name}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white font-medium">Export</span>
            <a href="/transfer" className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">Transfer</a>
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
          {/* Page Title & Intro */}
          <div className="mb-8 animate-slide-up">
            <h1 className="text-2xl font-semibold tracking-tight mb-2">Export Your Data</h1>
            <p className="text-sm text-neutral-500 leading-relaxed">
              Select the categories you want to export, choose your preferred format, and download. All data is fetched directly from Spotify and processed in your browser.
            </p>
          </div>

          {/* Categories */}
          <div className="mb-8 animate-slide-up" style={{ animationDelay: "75ms" }}>
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-xs text-neutral-500 uppercase tracking-widest font-medium">Categories</span>
              <div className="flex gap-3">
                <button onClick={selectAll} className="text-xs text-neutral-500 hover:text-white transition-colors cursor-pointer">All</button>
                <button onClick={selectNone} className="text-xs text-neutral-500 hover:text-white transition-colors cursor-pointer">None</button>
              </div>
            </div>
            <div className="rounded-2xl bg-neutral-900/80 divide-y divide-white/[0.04] border border-white/[0.04]">
              {CATEGORIES.map(({ key, label, icon, desc }) => {
                const on = selected.has(key);
                const hasRanges = key === "top_tracks" || key === "top_artists";
                return (
                  <div key={key}>
                    <button
                      onClick={() => toggleCategory(key)}
                      className="w-full flex items-center gap-3.5 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <span className="text-lg">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium block transition-colors ${on ? "text-white" : "text-neutral-500"}`}>{label}</span>
                        <span className="text-xs text-neutral-600 block mt-0.5 leading-relaxed">{desc}</span>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                        ${on ? "bg-green-500 border-green-500" : "border-neutral-700"}`}>
                        {on && (
                          <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                    {hasRanges && on && (
                      <div className="pb-3 px-5">
                        <div className="ml-8 space-y-2.5">
                          <div>
                            <span className="text-[10px] text-neutral-600 uppercase tracking-widest mb-1.5 block">Time Range</span>
                            <div className="flex flex-wrap gap-2">
                              {TIME_RANGES.map((r) => {
                                const rangeKey = `${key}_${r.key}`;
                                const rangeOn = selectedRanges.has(rangeKey);
                                return (
                                  <button
                                    key={rangeKey}
                                    onClick={() => toggleRange(rangeKey)}
                                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer border
                                      ${rangeOn
                                        ? "bg-green-500/15 text-green-400 border-green-500/25"
                                        : "bg-neutral-800/50 text-neutral-500 border-neutral-700/40 hover:border-neutral-600"
                                      }`}
                                  >
                                    {r.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] text-neutral-600 uppercase tracking-widest mb-1.5 block">Limit</span>
                            <div className="flex flex-wrap gap-2">
                              {LIMIT_OPTIONS.map((opt) => {
                                const isActive = topLimit === opt.value;
                                return (
                                  <button
                                    key={opt.label}
                                    onClick={() => setTopLimit(opt.value)}
                                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer border
                                      ${isActive
                                        ? "bg-green-500/15 text-green-400 border-green-500/25"
                                        : "bg-neutral-800/50 text-neutral-500 border-neutral-700/40 hover:border-neutral-600"
                                      }`}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Format */}
          <div className="mb-8 animate-slide-up" style={{ animationDelay: "150ms" }}>
            <span className="text-xs text-neutral-500 uppercase tracking-widest font-medium block mb-3">Format</span>
            <div className="inline-flex bg-neutral-900/80 rounded-xl p-1 gap-0.5 border border-white/[0.04]">
              {(["json", "csv"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`px-6 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer
                    ${format === f ? "bg-white/10 text-white shadow-sm" : "text-neutral-500 hover:text-neutral-300"}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <p className="text-xs text-neutral-600 mt-2.5 leading-relaxed">
              {format === "json"
                ? "JSON — A single structured file containing all selected data. Best for developers or importing into other tools."
                : "CSV — One spreadsheet file per category. Opens directly in Excel, Google Sheets, or Numbers."}
            </p>
          </div>

          {/* Export Summary & Button */}
          <div className="mb-10 animate-slide-up" style={{ animationDelay: "200ms" }}>
            {selectedCount > 0 && (
              <p className="text-xs text-neutral-500 mb-3 leading-relaxed">
                <span className="text-neutral-400 font-medium">{summaryParts.length} {summaryParts.length === 1 ? "item" : "items"}</span>
                {" "}will be exported as {format.toUpperCase()}: {summaryParts.join(", ")}
              </p>
            )}
            <button
              onClick={handleExport}
              disabled={exporting || selected.size === 0}
              className="w-full h-12 bg-white text-black text-sm font-semibold rounded-xl
                hover:bg-neutral-100 active:bg-neutral-200
                disabled:bg-neutral-800/80 disabled:text-neutral-600 disabled:cursor-not-allowed
                transition-colors cursor-pointer"
            >
              {exporting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 border-2 border-neutral-400 border-t-black rounded-full animate-spin" />
                  Exporting…
                </span>
              ) : selected.size === 0 ? (
                "Select at least one category"
              ) : (
                "Export"
              )}
            </button>
          </div>

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
                <div className="h-1 bg-neutral-800 rounded-full overflow-hidden mb-4">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${exportComplete ? "bg-green-500" : "bg-green-500"}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}

              {exportComplete && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-400">Export complete</p>
                    <p className="text-xs text-green-500/60 mt-0.5">Your files have been downloaded. Check your downloads folder.</p>
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
                        : "text-neutral-500"}`}
                  >
                    <span className="shrink-0 mt-0.5">
                      {entry.type === "success" ? "✓" : entry.type === "error" ? "✗" : entry.type === "warn" ? "!" : "·"}
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
