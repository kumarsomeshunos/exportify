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
  getStoredGoogleClientSecret,
  saveGoogleClientId,
  saveGoogleClientSecret,
  getConfiguredYouTubeRedirectUri,
  searchYouTubeMusic,
  rateYouTubeVideo,
  createYouTubePlaylist,
  addToYouTubePlaylist,
  type TransferStats,
  type SpotifyTrackForTransfer,
  type TransferMatch,
} from "@/lib/youtube";

const TRANSFER_CATEGORIES = [
  { key: "liked_songs", label: "Liked Songs", icon: "❤️", desc: "Transfer all your Spotify liked songs — each matched track will be liked on YouTube Music" },
  { key: "playlists", label: "Playlists", icon: "📋", desc: "Recreate your Spotify playlists on YouTube Music with matching tracks" },
];

type MatchMode = "auto" | "manual";

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
  const [matchMode, setMatchMode] = useState<MatchMode>("auto");
  const [transferring, setTransferring] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [currentTrack, setCurrentTrack] = useState<string>("");
  const [stats, setStats] = useState<TransferStats | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);
  const cancelledRef = useRef(false);
  const reviewResolveRef = useRef<((accepted: boolean) => void) | null>(null);
  const [pendingReview, setPendingReview] = useState<{ track: SpotifyTrackForTransfer; match: TransferMatch } | null>(null);

  // YouTube setup wizard
  const [showYtSetup, setShowYtSetup] = useState(false);
  const [ytSetupStep, setYtSetupStep] = useState(0);
  const [googleClientIdInput, setGoogleClientIdInput] = useState("");
  const [googleClientSecretInput, setGoogleClientSecretInput] = useState("");
  const [hasGoogleClientId, setHasGoogleClientId] = useState(false);

  const addLog = useCallback((message: string, type: LogEntry["type"] = "info") => {
    const id = logIdRef.current++;
    setLogs((prev) => [...prev, { id, message, type }]);
  }, []);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace("/"); return; }
    setYtConnected(isYouTubeAuthenticated());
    setHasGoogleClientId(!!getStoredGoogleClientId());
    fetchCurrentUser().then(setUser).catch(() => { logout(); router.replace("/"); });
  }, [router]);

  const toggleCategory = (key: string) => {
    setSelected((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };

  const handleConnectYouTube = () => {
    const storedId = getStoredGoogleClientId();
    const storedSecret = getStoredGoogleClientSecret();
    if (!storedId || !storedSecret) {
      if (storedId && !storedSecret) { setGoogleClientIdInput(storedId); setYtSetupStep(3); }
      setShowYtSetup(true);
      return;
    }
    redirectToYouTubeAuth();
  };

  const handleSaveAndConnectYouTube = () => {
    const trimmedId = googleClientIdInput.trim();
    const trimmedSecret = googleClientSecretInput.trim();
    if (!trimmedId || !trimmedSecret) return;
    saveGoogleClientId(trimmedId);
    saveGoogleClientSecret(trimmedSecret);
    setHasGoogleClientId(true);
    setShowYtSetup(false);
    redirectToYouTubeAuth();
  };

  const handleStopTransfer = () => {
    cancelledRef.current = true;
    if (reviewResolveRef.current) { reviewResolveRef.current(false); }
  };

  const handleAcceptMatch = () => { reviewResolveRef.current?.(true); reviewResolveRef.current = null; };
  const handleSkipMatch = () => { reviewResolveRef.current?.(false); reviewResolveRef.current = null; };

  const handleTransfer = async () => {
    if (selected.size === 0 || !ytConnected) return;
    setTransferring(true);
    setLogs([]);
    setProgress(0);
    setStats(null);
    cancelledRef.current = false;
    setPendingReview(null);

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
        overallStats.total += liked.length;
        let step = 0;

        for (const track of liked) {
          if (cancelledRef.current) { addLog("Transfer stopped by user.", "warn"); break; }
          const t = track as SpotifyTrackForTransfer;
          setCurrentTrack(`${t.name} — ${t.artist}`);
          const query = `${t.name} ${t.artist.split(",")[0]}`;
          const match = await searchYouTubeMusic(query);
          const confPct = match ? Math.round(match.confidence * 100) : 0;

          if (match) {
            let accepted = true;
            if (matchMode === "manual") {
              accepted = await new Promise<boolean>((resolve) => {
                reviewResolveRef.current = resolve;
                setPendingReview({ track: t, match });
              });
              setPendingReview(null);
              if (cancelledRef.current) { addLog("Transfer stopped by user.", "warn"); break; }
            }
            if (accepted) {
              const ok = await rateYouTubeVideo(match.videoId);
              if (ok) { overallStats.matched++; addLog(`${t.name} → ${match.title} (${confPct}%)`, "match"); }
              else { overallStats.errors++; addLog(`${t.name} — Failed to like`, "error"); }
            } else {
              overallStats.notFound++;
              addLog(`${t.name} — Skipped`, "miss");
            }
          } else {
            overallStats.notFound++;
            addLog(`${t.name} by ${t.artist} — No match found`, "miss");
          }
          step++;
          setProgress(step);
          setStats({ ...overallStats });
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      if (selected.has("playlists") && !cancelledRef.current) {
        addLog("Fetching playlists from Spotify…");
        const playlists: PlaylistItem[] = await fetchPlaylists(log);
        addLog(`Found ${playlists.length} playlists`, "success");
        let playlistsCreated = 0;

        for (const pl of playlists) {
          if (cancelledRef.current) { addLog("Transfer stopped by user.", "warn"); break; }
          addLog(`\nProcessing: ${pl.name}`);
          let tracks;
          try { tracks = await fetchPlaylistTracks(pl.id, market, log); }
          catch { addLog(`Skipped "${pl.name}" — access restricted`, "warn"); continue; }
          if (!tracks || tracks.length === 0) { addLog("Empty playlist — skipping"); continue; }

          setTotalSteps(tracks.length);
          setProgress(0);
          overallStats.total += tracks.length;
          let step = 0;
          const matchedIds: string[] = [];

          for (const track of tracks) {
            if (cancelledRef.current) { addLog("Transfer stopped by user.", "warn"); break; }
            const t = track as SpotifyTrackForTransfer;
            setCurrentTrack(`${t.name} — ${t.artist}`);
            const query = `${t.name} ${t.artist.split(",")[0]}`;
            const match = await searchYouTubeMusic(query);
            const confPct = match ? Math.round(match.confidence * 100) : 0;

            if (match) {
              let accepted = true;
              if (matchMode === "manual") {
                accepted = await new Promise<boolean>((resolve) => {
                  reviewResolveRef.current = resolve;
                  setPendingReview({ track: t, match });
                });
                setPendingReview(null);
                if (cancelledRef.current) break;
              }
              if (accepted) { matchedIds.push(match.videoId); overallStats.matched++; addLog(`  ${t.name} → ${match.title} (${confPct}%)`, "match"); }
              else { overallStats.notFound++; addLog(`  ${t.name} — Skipped`, "miss"); }
            } else {
              overallStats.notFound++;
              addLog(`  ${t.name} — Not found`, "miss");
            }
            step++;
            setProgress(step);
            setStats({ ...overallStats });
            await new Promise((r) => setTimeout(r, 300));
          }

          if (matchedIds.length > 0 && !cancelledRef.current) {
            const plId = await createYouTubePlaylist(pl.name, "Transferred from Spotify via Exportify");
            if (plId) {
              for (const vid of matchedIds) { await addToYouTubePlaylist(plId, vid); await new Promise((r) => setTimeout(r, 200)); }
              playlistsCreated++;
              addLog(`Created "${pl.name}" with ${matchedIds.length} tracks`, "success");
            } else { overallStats.errors++; addLog(`Failed to create playlist "${pl.name}"`, "error"); }
          }
        }
        if (!cancelledRef.current) addLog(`\nPlaylists created: ${playlistsCreated}/${playlists.length}`, "success");
      }

      setStats({ ...overallStats });
      if (!cancelledRef.current) addLog("\nTransfer complete!", "success");
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setTransferring(false);
      setCurrentTrack("");
      setPendingReview(null);
      reviewResolveRef.current = null;
    }
  };

  const handleLogout = () => { logout(); logoutYouTube(); router.replace("/"); };
  const handleFullReset = () => { logout(); logoutYouTube(); clearClientId(); router.replace("/"); };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="h-5 w-5 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const progressPercent = totalSteps > 0 ? (progress / totalSteps) * 100 : 0;
  const transferComplete = stats !== null && !transferring && stats.total > 0 && !cancelledRef.current;
  const redirectUri = typeof window !== "undefined" ? getConfiguredYouTubeRedirectUri() : "";

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      {/* YouTube Setup Wizard Modal */}
      {showYtSetup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md px-5">
          <div className="bg-neutral-900/95 rounded-2xl max-w-md w-full p-7 shadow-2xl border border-white/[0.08] backdrop-blur-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold tracking-tight">Connect YouTube Music</h2>
              <button onClick={() => setShowYtSetup(false)} className="w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-1.5 mb-6">
              {[0, 1, 2, 3].map((s) => (
                <div key={s} className={`h-1 rounded-full flex-1 transition-colors ${s <= ytSetupStep ? "bg-[#007AFF]" : "bg-neutral-800"}`} />
              ))}
            </div>

            {/* Step 0: Create project + enable API */}
            {ytSetupStep === 0 && (
              <div className="space-y-5">
                <div>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium mb-1">Step 1 of 4</p>
                  <h3 className="text-base font-semibold mb-2">Create a project & enable the API</h3>
                  <p className="text-sm text-neutral-400 leading-relaxed">You need a Google Cloud project with the YouTube Data API v3 enabled.</p>
                </div>
                <div className="bg-neutral-800/60 rounded-xl p-4 space-y-4">
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <div>
                      <p className="text-sm text-neutral-200 font-medium">Open Google Cloud Console</p>
                      <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-xs text-[#007AFF] hover:text-[#4da3ff] transition-colors mt-0.5 inline-block">console.cloud.google.com →</a>
                    </div>
                  </div>
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <p className="text-sm text-neutral-200">Click the project dropdown → <strong className="text-white">New Project</strong> → name it → <strong className="text-white">Create</strong></p>
                  </div>
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <div>
                      <p className="text-sm text-neutral-200">Enable the YouTube Data API v3:</p>
                      <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-xs text-[#007AFF] hover:text-[#4da3ff] transition-colors mt-1 inline-block">APIs & Services → Library → YouTube Data API v3 → Enable →</a>
                    </div>
                  </div>
                </div>
                <button onClick={() => setYtSetupStep(1)} className="w-full h-11 bg-white text-black text-sm font-semibold rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer">Done — Next Step</button>
              </div>
            )}

            {/* Step 1: OAuth consent screen */}
            {ytSetupStep === 1 && (
              <div className="space-y-5">
                <div>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium mb-1">Step 2 of 4</p>
                  <h3 className="text-base font-semibold mb-2">Configure the OAuth consent screen</h3>
                  <p className="text-sm text-neutral-400 leading-relaxed">Google requires this before creating credentials.</p>
                </div>
                <div className="bg-neutral-800/60 rounded-xl p-4 space-y-4">
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <div>
                      <p className="text-sm text-neutral-200">Go to <strong className="text-white">APIs & Services → OAuth consent screen</strong></p>
                      <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer" className="text-xs text-[#007AFF] hover:text-[#4da3ff] transition-colors mt-0.5 inline-block">Open OAuth consent screen →</a>
                    </div>
                  </div>
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <div>
                      <p className="text-sm text-neutral-200">Select <strong className="text-white">External</strong> → <strong className="text-white">Create</strong></p>
                      <p className="text-xs text-neutral-500 mt-0.5">Choose &quot;External&quot; even for personal use</p>
                    </div>
                  </div>
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <div>
                      <p className="text-sm text-neutral-200">Fill in required fields:</p>
                      <ul className="text-xs text-neutral-500 mt-1.5 space-y-1">
                        <li>• <strong className="text-neutral-300">App name</strong> — anything (e.g. &quot;Exportify&quot;)</li>
                        <li>• <strong className="text-neutral-300">User support email</strong> — your email</li>
                        <li>• <strong className="text-neutral-300">Developer contact email</strong> — your email</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">4</span>
                    <p className="text-sm text-neutral-200">Click <strong className="text-white">Save and Continue</strong> through all screens</p>
                  </div>
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">5</span>
                    <div>
                      <p className="text-sm text-neutral-200">On <strong className="text-white">Test users</strong>, add your Google account email</p>
                      <p className="text-xs text-neutral-500 mt-0.5">Required for &quot;Testing&quot; mode apps</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setYtSetupStep(0)} className="h-11 px-5 text-sm text-neutral-400 hover:text-white transition-colors cursor-pointer rounded-xl">Back</button>
                  <button onClick={() => setYtSetupStep(2)} className="flex-1 h-11 bg-white text-black text-sm font-semibold rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer">Done — Next Step</button>
                </div>
              </div>
            )}

            {/* Step 2: Create OAuth credentials */}
            {ytSetupStep === 2 && (
              <div className="space-y-5">
                <div>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium mb-1">Step 3 of 4</p>
                  <h3 className="text-base font-semibold mb-2">Create OAuth credentials</h3>
                  <p className="text-sm text-neutral-400 leading-relaxed">Create the OAuth Client ID for Exportify.</p>
                </div>
                <div className="bg-neutral-800/60 rounded-xl p-4 space-y-4">
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <div>
                      <p className="text-sm text-neutral-200">Go to <strong className="text-white">APIs & Services → Credentials</strong></p>
                      <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-xs text-[#007AFF] hover:text-[#4da3ff] transition-colors mt-0.5 inline-block">Open Credentials →</a>
                    </div>
                  </div>
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <p className="text-sm text-neutral-200">Click <strong className="text-white">+ Create Credentials → OAuth client ID</strong></p>
                  </div>
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <p className="text-sm text-neutral-200">Type: <strong className="text-white">Web application</strong></p>
                  </div>
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">4</span>
                    <div>
                      <p className="text-sm text-neutral-200">Under <strong className="text-white">Authorized redirect URIs</strong>, add:</p>
                      <code className="text-xs text-[#007AFF] bg-black/40 px-2.5 py-1.5 rounded-lg mt-1.5 block break-all font-mono">{redirectUri}</code>
                    </div>
                  </div>
                  <div className="flex gap-3.5">
                    <span className="w-6 h-6 rounded-full bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">5</span>
                    <p className="text-sm text-neutral-200">Click <strong className="text-white">Create</strong> — copy both <strong className="text-white">Client ID</strong> and <strong className="text-white">Client Secret</strong></p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setYtSetupStep(1)} className="h-11 px-5 text-sm text-neutral-400 hover:text-white transition-colors cursor-pointer rounded-xl">Back</button>
                  <button onClick={() => setYtSetupStep(3)} className="flex-1 h-11 bg-white text-black text-sm font-semibold rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer">I have my credentials</button>
                </div>
              </div>
            )}

            {/* Step 3: Paste credentials */}
            {ytSetupStep === 3 && (
              <div className="space-y-5">
                <div>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium mb-1">Step 4 of 4</p>
                  <h3 className="text-base font-semibold mb-2">Paste your credentials</h3>
                  <p className="text-sm text-neutral-400 leading-relaxed">Both stay in your browser and are only sent directly to Google.</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-neutral-500 uppercase tracking-wider font-medium block mb-2">Client ID</label>
                    <input type="text" value={googleClientIdInput} onChange={(e) => setGoogleClientIdInput(e.target.value)} placeholder="123456789-xxxx.apps.googleusercontent.com" autoFocus className="w-full h-11 bg-neutral-800/80 border border-neutral-700/60 rounded-xl px-4 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-[#007AFF]/50 focus:ring-1 focus:ring-[#007AFF]/30 transition" spellCheck={false} autoComplete="off" />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500 uppercase tracking-wider font-medium block mb-2">Client Secret</label>
                    <input type="password" value={googleClientSecretInput} onChange={(e) => setGoogleClientSecretInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaveAndConnectYouTube()} placeholder="GOCSPX-••••••••••••••••" className="w-full h-11 bg-neutral-800/80 border border-neutral-700/60 rounded-xl px-4 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-[#007AFF]/50 focus:ring-1 focus:ring-[#007AFF]/30 transition" spellCheck={false} autoComplete="off" />
                  </div>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                  <p className="text-xs text-amber-400/80 leading-relaxed"><strong className="text-amber-300">Why a client secret?</strong> Google requires it for web OAuth apps. Your secret never leaves your browser — it&apos;s only sent directly to Google over HTTPS.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setYtSetupStep(2)} className="h-11 px-5 text-sm text-neutral-400 hover:text-white transition-colors cursor-pointer rounded-xl">Back</button>
                  <button onClick={handleSaveAndConnectYouTube} disabled={!googleClientIdInput.trim() || !googleClientSecretInput.trim()} className="flex-1 h-11 bg-[#007AFF] text-white text-sm font-semibold rounded-xl hover:bg-[#0071E3] disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed transition-colors cursor-pointer">Connect YouTube Music</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Floating Glass Nav ─── */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
        <div className="flex items-center gap-0.5 bg-white/[0.06] backdrop-blur-2xl border border-white/[0.08] rounded-2xl px-1.5 h-10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <a href="/" className="px-3 h-7 flex items-center rounded-xl text-[13px] font-semibold text-white hover:bg-white/[0.06] transition-colors">Exportify</a>
          <div className="w-px h-3.5 bg-white/[0.06] mx-0.5" />
          <a href="/export" className="px-2.5 h-7 flex items-center rounded-xl text-[13px] text-neutral-400 hover:bg-white/[0.06] hover:text-white transition-colors">Export</a>
          <span className="px-2.5 h-7 flex items-center rounded-xl text-[13px] bg-white/[0.1] text-white font-medium">Transfer</span>
          <div className="w-px h-3.5 bg-white/[0.06] mx-0.5" />
          <span className="px-2 text-[13px] text-neutral-500 truncate max-w-28">{user.display_name}</span>
          <div className="w-px h-3.5 bg-white/[0.06] mx-0.5" />
          <button onClick={handleLogout} className="px-2 h-7 flex items-center rounded-xl text-[13px] text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-300 transition-colors cursor-pointer">Sign out</button>
        </div>
      </nav>

      <main className="flex-1 pt-20 pb-20">
        <div className="max-w-xl mx-auto px-6">
          {/* Page Title */}
          <div className="mb-8 animate-slide-up">
            <h1 className="text-2xl font-semibold tracking-tight mb-2">Transfer to YouTube Music</h1>
            <p className="text-sm text-neutral-500 leading-relaxed">Move your Spotify music library to YouTube Music with smart confidence-based matching.</p>
          </div>

          {/* Connections */}
          <div className="mb-8 animate-slide-up" style={{ animationDelay: "50ms" }}>
            <span className="text-xs text-neutral-500 uppercase tracking-widest font-medium block mb-3">Connections</span>
            <div className="rounded-2xl bg-neutral-900/80 border border-white/[0.04] divide-y divide-white/[0.04]">
              {/* Spotify */}
              <div className="flex items-center gap-3.5 px-5 py-4">
                <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" /></svg>
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium text-white block">Spotify</span>
                  <span className="text-xs text-green-500">Connected as {user.display_name}</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-green-500" />
              </div>
              {/* YouTube Music */}
              <div className="flex items-center gap-3.5 px-5 py-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${ytConnected ? "bg-green-500/10" : "bg-neutral-800"}`}>
                  <svg className={`w-4 h-4 ${ytConnected ? "text-green-500" : "text-neutral-600"}`} viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium text-white block">YouTube Music</span>
                  {ytConnected ? (
                    <span className="text-xs text-green-500">Connected</span>
                  ) : (
                    <button onClick={handleConnectYouTube} className="text-xs text-[#007AFF] hover:text-[#4da3ff] transition-colors cursor-pointer">Click to connect →</button>
                  )}
                </div>
                <span className={`w-2 h-2 rounded-full ${ytConnected ? "bg-green-500" : "bg-neutral-700"}`} />
              </div>
            </div>
            {hasGoogleClientId && !ytConnected && (
              <button onClick={() => { setShowYtSetup(true); setYtSetupStep(3); setGoogleClientIdInput(getStoredGoogleClientId()); setGoogleClientSecretInput(getStoredGoogleClientSecret()); }} className="block mt-2 text-xs text-neutral-600 hover:text-neutral-400 transition-colors cursor-pointer">Change credentials</button>
            )}
          </div>

          {/* Categories */}
          <div className="mb-8 animate-slide-up" style={{ animationDelay: "100ms" }}>
            <span className="text-xs text-neutral-500 uppercase tracking-widest font-medium block mb-3">What to Transfer</span>
            <div className="rounded-2xl bg-neutral-900/80 divide-y divide-white/[0.04] border border-white/[0.04]">
              {TRANSFER_CATEGORIES.map(({ key, label, icon, desc }) => {
                const on = selected.has(key);
                return (
                  <button key={key} onClick={() => !transferring && toggleCategory(key)} disabled={transferring} className="w-full flex items-center gap-3.5 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                    <span className="text-lg">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium block transition-colors ${on ? "text-white" : "text-neutral-500"}`}>{label}</span>
                      <span className="text-xs text-neutral-600 block mt-0.5 leading-relaxed">{desc}</span>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${on ? "bg-[#007AFF] border-[#007AFF]" : "border-neutral-700"}`}>
                      {on && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Matching Mode */}
          <div className="mb-8 animate-slide-up" style={{ animationDelay: "150ms" }}>
            <span className="text-xs text-neutral-500 uppercase tracking-widest font-medium block mb-3">Matching Mode</span>
            <div className="rounded-2xl bg-neutral-900/80 divide-y divide-white/[0.04] border border-white/[0.04]">
              {([
                { mode: "auto" as MatchMode, label: "Auto-match", desc: "Accept the best match automatically — faster for large libraries", icon: "⚡" },
                { mode: "manual" as MatchMode, label: "Manual review", desc: "Review and approve each match before transferring", icon: "👁️" },
              ]).map(({ mode, label, desc, icon }) => {
                const on = matchMode === mode;
                return (
                  <button key={mode} onClick={() => !transferring && setMatchMode(mode)} disabled={transferring} className="w-full flex items-center gap-3.5 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                    <span className="text-lg">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium block transition-colors ${on ? "text-white" : "text-neutral-500"}`}>{label}</span>
                      <span className="text-xs text-neutral-600 block mt-0.5 leading-relaxed">{desc}</span>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${on ? "border-[#007AFF]" : "border-neutral-700"}`}>
                      {on && <div className="w-2.5 h-2.5 rounded-full bg-[#007AFF]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Direction */}
          <div className="mb-8 animate-slide-up" style={{ animationDelay: "200ms" }}>
            <div className="rounded-2xl bg-neutral-900/80 border border-white/[0.04] p-5">
              <div className="flex items-center justify-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" /></svg>
                  </div>
                  <span className="text-sm font-medium">Spotify</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-8 h-px bg-gradient-to-r from-green-500/40 to-neutral-600/40" />
                  <svg className="w-4 h-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                  <div className="w-8 h-px bg-gradient-to-r from-neutral-600/40 to-neutral-700/20" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center">
                    <svg className="w-4 h-4 text-neutral-400" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
                  </div>
                  <span className="text-sm font-medium">YouTube Music</span>
                </div>
              </div>
            </div>
          </div>

          {/* Start / Stop Button */}
          <div className="mb-10 animate-slide-up" style={{ animationDelay: "250ms" }}>
            {transferring ? (
              <button onClick={handleStopTransfer} className="w-full h-12 bg-neutral-800 text-neutral-200 text-sm font-semibold rounded-xl border border-neutral-700 hover:bg-neutral-700 transition-colors cursor-pointer flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                Stop Transfer
              </button>
            ) : (
              <button onClick={handleTransfer} disabled={selected.size === 0 || !ytConnected} className="w-full h-12 bg-[#007AFF] text-white text-sm font-semibold rounded-xl hover:bg-[#0071E3] active:bg-[#005EC4] disabled:bg-neutral-800/80 disabled:text-neutral-600 disabled:cursor-not-allowed transition-colors cursor-pointer">
                {!ytConnected ? "Connect YouTube Music to start" : selected.size === 0 ? "Select at least one category" : "Start Transfer"}
              </button>
            )}
          </div>

          {/* Manual Review Card */}
          {pendingReview && (
            <div className="bg-neutral-900/90 border border-[#007AFF]/20 rounded-2xl p-5 mb-6 animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-neutral-500 uppercase tracking-widest font-medium">Review Match</span>
                <span className="text-xs text-neutral-600 tabular-nums">{progress + 1}/{totalSteps}</span>
              </div>
              <div className="bg-black/30 rounded-xl p-3.5 mb-3">
                <p className="text-xs text-green-500/60 uppercase tracking-wider font-medium mb-1">Spotify</p>
                <p className="text-sm font-medium text-white">{pendingReview.track.name}</p>
                <p className="text-xs text-neutral-500">{pendingReview.track.artist}</p>
              </div>
              <div className="flex items-center justify-center gap-2 mb-3 text-neutral-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                <span className="text-xs font-medium tabular-nums">{Math.round(pendingReview.match.confidence * 100)}% match</span>
              </div>
              <div className="bg-black/30 rounded-xl p-3.5 mb-4">
                <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium mb-1">YouTube Music</p>
                <p className="text-sm font-medium text-white">{pendingReview.match.title}</p>
                <p className="text-xs text-neutral-500">{pendingReview.match.channelTitle}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSkipMatch} className="flex-1 h-10 bg-neutral-800 text-neutral-300 text-sm rounded-xl hover:bg-neutral-700 transition-colors cursor-pointer">Skip</button>
                <button onClick={handleAcceptMatch} className="flex-1 h-10 bg-[#007AFF] text-white text-sm font-medium rounded-xl hover:bg-[#0071E3] transition-colors cursor-pointer">Accept</button>
              </div>
            </div>
          )}

          {/* Stats */}
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
                {totalSteps > 0 && <span className="text-xs text-neutral-600 tabular-nums font-medium">{progress}/{totalSteps}</span>}
              </div>
              {totalSteps > 0 && (
                <div className="mb-4">
                  <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500 ease-out bg-[#007AFF]" style={{ width: `${progressPercent}%` }} />
                  </div>
                  {currentTrack && <p className="text-xs text-neutral-600 mt-1.5 truncate">{currentTrack}</p>}
                </div>
              )}
              {transferComplete && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-400">Transfer complete</p>
                    <p className="text-xs text-green-500/60 mt-0.5">{stats.matched} of {stats.total} tracks transferred to YouTube Music.</p>
                  </div>
                </div>
              )}
              <div className="bg-neutral-900/80 rounded-xl p-4 max-h-72 overflow-y-auto space-y-1 font-mono border border-white/[0.04]">
                {logs.map((entry) => (
                  <div key={entry.id} className={`text-xs leading-relaxed flex items-start gap-2 ${entry.type === "success" ? "text-green-500" : entry.type === "error" ? "text-red-400" : entry.type === "warn" ? "text-amber-400" : entry.type === "match" ? "text-green-400/80" : entry.type === "miss" ? "text-amber-400/60" : "text-neutral-500"}`}>
                    <span className="shrink-0 mt-0.5">{entry.type === "success" ? "✓" : entry.type === "error" ? "✗" : entry.type === "warn" ? "!" : entry.type === "match" ? "→" : entry.type === "miss" ? "?" : "·"}</span>
                    <span>{entry.message}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}

          {/* Reset link */}
          <div className="mt-12 text-center">
            <button onClick={handleFullReset} className="text-xs text-neutral-700 hover:text-neutral-500 transition-colors cursor-pointer">Reset all credentials</button>
          </div>
        </div>
      </main>
    </div>
  );
}
