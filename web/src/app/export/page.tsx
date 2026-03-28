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
  { key: "liked_songs", label: "Liked Songs", icon: "❤️" },
  { key: "playlists", label: "Playlists & Tracks", icon: "📋" },
  { key: "top_tracks", label: "Top Tracks", icon: "🎵" },
  { key: "top_artists", label: "Top Artists", icon: "🎤" },
  { key: "followed_artists", label: "Followed Artists", icon: "👥" },
  { key: "recently_played", label: "Recently Played", icon: "🕐" },
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-5 w-5 border-[1.5px] border-white/30 border-t-white/80 rounded-full animate-spin" />
      </div>
    );
  }

  const progressPercent = totalSteps > 0 ? (progress / totalSteps) * 100 : 0;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 backdrop-blur-xl bg-black/70 border-b border-white/[0.04]">
        <div className="max-w-3xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-semibold tracking-tight text-white/90">Exportify</span>
            <span className="text-white/10">·</span>
            <span className="text-[13px] text-white/40">{user.display_name}</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-[13px] text-white/30 hover:text-white/60 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 pt-20 pb-16 px-6">
        <div className="max-w-3xl mx-auto">
          {/* Title */}
          <div className="mb-8">
            <h1 className="text-[24px] font-semibold tracking-tight mb-1">Export your data</h1>
            <p className="text-[14px] text-white/35">Choose categories, pick a format, and download.</p>
          </div>

          {/* Categories */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/25">
                Categories
              </h2>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-[11px] text-white/25 hover:text-white/50 transition-colors cursor-pointer">
                  All
                </button>
                <button onClick={selectNone} className="text-[11px] text-white/25 hover:text-white/50 transition-colors cursor-pointer">
                  None
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.06] overflow-hidden divide-y divide-white/[0.04]">
              {CATEGORIES.map(({ key, label, icon }) => {
                const active = selected.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleCategory(key)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left
                      hover:bg-white/[0.03] transition-colors cursor-pointer"
                  >
                    <span className="text-[15px] leading-none">{icon}</span>
                    <span className={`text-[14px] flex-1 ${active ? "text-white/85" : "text-white/30"}`}>
                      {label}
                    </span>
                    <span
                      className={`w-[18px] h-[18px] rounded-full border flex items-center justify-center transition-all shrink-0
                        ${active
                          ? "bg-[#1ed760] border-[#1ed760]"
                          : "border-white/15 bg-transparent"
                        }`}
                    >
                      {active && (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="text-black">
                          <path d="M2.5 6.5L5 9L9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Format + Export */}
          <section className="mb-8 flex items-center gap-3">
            <div className="flex bg-white/[0.04] rounded-lg p-0.5">
              {(["json", "csv"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`px-4 py-1.5 rounded-md text-[12px] font-medium uppercase tracking-wide
                    transition-all duration-150 cursor-pointer
                    ${format === f
                      ? "bg-white/[0.1] text-white/85"
                      : "text-white/25 hover:text-white/45"
                    }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <button
              onClick={handleExport}
              disabled={exporting || selected.size === 0}
              className="flex-1 h-9 bg-white text-black text-[13px] font-semibold rounded-lg
                hover:bg-white/90 active:scale-[0.99]
                disabled:bg-white/[0.05] disabled:text-white/15 disabled:cursor-not-allowed
                transition-all duration-150 cursor-pointer"
            >
              {exporting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 border-[1.5px] border-black/25 border-t-black/70 rounded-full animate-spin" />
                  Exporting…
                </span>
              ) : (
                "Export"
              )}
            </button>
          </section>

          {/* Activity log */}
          {(logs.length > 0 || totalSteps > 0) && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/25">
                  Activity
                </h2>
                {totalSteps > 0 && (
                  <span className="text-[11px] tabular-nums text-white/20">
                    {progress}/{totalSteps}
                  </span>
                )}
              </div>

              {totalSteps > 0 && (
                <div className="w-full h-[3px] bg-white/[0.06] rounded-full overflow-hidden mb-4">
                  <div
                    className="h-full bg-[#1ed760] rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 overflow-y-auto max-h-[360px] space-y-0.5">
                {logs.map((entry) => (
                  <div
                    key={entry.id}
                    className={`text-[12px] leading-[1.6] font-mono
                      ${entry.type === "success" ? "text-[#1ed760]/70"
                        : entry.type === "error" ? "text-red-400/70"
                        : entry.type === "warn" ? "text-amber-400/60"
                        : "text-white/25"
                      }`}
                  >
                    {entry.message}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
