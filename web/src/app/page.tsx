"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  isAuthenticated,
  redirectToSpotifyAuth,
  getStoredClientId,
  saveClientId,
  getConfiguredRedirectUri,
  fetchCurrentUser,
  logout
} from "@/lib/spotify";
import {
  isYouTubeAuthenticated,
  redirectToYouTubeAuth,
  getStoredGoogleClientId,
  getStoredGoogleClientSecret,
  saveGoogleClientId,
  saveGoogleClientSecret,
  getConfiguredYouTubeRedirectUri,
} from "@/lib/youtube";

const FEATURES = [
  { icon: "❤️", title: "Liked Songs", desc: "Every track you've hearted — your full saved library exported with artist, album, and date added." },
  { icon: "📋", title: "Playlists", desc: "All your playlists, including collaborative ones, with complete track listings for each." },
  { icon: "🎵", title: "Top Tracks", desc: "Your most-played songs ranked by listening time. Choose from last 4 weeks, 6 months, or all time." },
  { icon: "🎤", title: "Top Artists", desc: "The artists you listen to most, with genre and popularity data. Customizable time ranges." },
  { icon: "👥", title: "Followed Artists", desc: "A complete list of every artist you follow, including their genres and follower counts." },
  { icon: "🕐", title: "Recently Played", desc: "Your last 50 played tracks with exact timestamps — see what you were listening to and when." },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  // Spotify Auth State
  const [hasClientId, setHasClientId] = useState(false);
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);
  const [showSpSetup, setShowSpSetup] = useState(false);
  const [spSetupStep, setSpSetupStep] = useState(0);
  const [clientIdInput, setClientIdInput] = useState("");

  // YouTube Auth State
  const [hasYtCredentials, setHasYtCredentials] = useState(false);
  const [isYtConnected, setIsYtConnected] = useState(false);
  const [showYtSetup, setShowYtSetup] = useState(false);
  const [ytSetupStep, setYtSetupStep] = useState(0);
  const [ytClientIdInput, setYtClientIdInput] = useState("");
  const [ytClientSecretInput, setYtClientSecretInput] = useState("");

  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    const spAuth = isAuthenticated();
    setIsSpotifyConnected(spAuth);
    setHasClientId(!!getStoredClientId());

    const ytAuth = isYouTubeAuthenticated();
    setIsYtConnected(ytAuth);
    setHasYtCredentials(!!(getStoredGoogleClientId() && getStoredGoogleClientSecret()));

    if (spAuth) {
      fetchCurrentUser().then(user => setUserName(user.display_name)).catch(() => {});
    }

    setChecking(false);
  }, []);

  const handleConnectSpotify = () => {
    if (!getStoredClientId()) {
      setShowSpSetup(true);
      return;
    }
    redirectToSpotifyAuth();
  };

  const handleSaveAndConnectSpotify = () => {
    const trimmed = clientIdInput.trim();
    if (!trimmed || !/^[a-f0-9]{32}$/i.test(trimmed)) return;
    saveClientId(trimmed);
    setHasClientId(true);
    setShowSpSetup(false);
    redirectToSpotifyAuth();
  };

  const handleConnectYouTube = () => {
    const storedId = getStoredGoogleClientId();
    const storedSecret = getStoredGoogleClientSecret();
    if (!storedId || !storedSecret) {
      if (storedId && !storedSecret) {
        setYtClientIdInput(storedId);
        setYtSetupStep(3);
      }
      setShowYtSetup(true);
      return;
    }
    redirectToYouTubeAuth();
  };

  const handleSaveAndConnectYouTube = () => {
    const trimmedId = ytClientIdInput.trim();
    const trimmedSecret = ytClientSecretInput.trim();
    if (!trimmedId || !trimmedSecret) return;
    saveGoogleClientId(trimmedId);
    saveGoogleClientSecret(trimmedSecret);
    setHasYtCredentials(true);
    setShowYtSetup(false);
    redirectToYouTubeAuth();
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="h-5 w-5 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const spRedirectUri = typeof window !== "undefined" ? getConfiguredRedirectUri() : "";
  const ytRedirectUri = typeof window !== "undefined" ? getConfiguredYouTubeRedirectUri() : "";

  return (
    <div className="min-h-screen flex flex-col bg-black text-white selection:bg-white/20">
      {/* ─── Global Navbar ─── */}
      <header className="sticky top-0 z-50 bg-black/70 backdrop-blur-2xl border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-[15px] font-bold tracking-tight text-white">Exportify</span>
            <div className="hidden sm:flex items-center gap-4">
              <a href="/export" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">Export</a>
              <a href="/transfer" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">Transfer</a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/kumarsomeshunos/exportify" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors" target="_blank" rel="noopener noreferrer">GitHub</a>
            {isSpotifyConnected && userName && (
              <div className="flex items-center gap-3 pl-4 border-l border-white/[0.08]">
                <span className="text-sm text-neutral-400 truncate max-w-[120px]">{userName}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 pt-16 pb-24">
        {/* Setup Modal - Spotify */}
        <AnimatePresence>
          {showSpSetup && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md px-5"
            >
              <motion.div
                layout
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="bg-neutral-900/95 rounded-2xl max-w-md w-full p-7 shadow-2xl border border-white/[0.08]"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold tracking-tight">Connect Spotify</h2>
                  <button onClick={() => setShowSpSetup(false)} className="w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                {spSetupStep === 0 && (
                  <motion.div layout className="space-y-5">
                    <p className="text-sm text-neutral-400 leading-relaxed">
                      Exportify connects directly to Spotify through your own app credentials. This keeps your data private — nothing passes through our servers. Setup takes about a minute.
                    </p>
                    <div className="bg-neutral-800/60 rounded-xl p-5 space-y-4">
                      <div className="flex gap-3.5">
                        <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">1</span>
                        <div>
                          <p className="text-sm text-neutral-200 font-medium">Open the Spotify Developer Dashboard</p>
                          <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-xs text-green-400 hover:text-green-300 transition-colors mt-0.5 inline-block">developer.spotify.com/dashboard →</a>
                        </div>
                      </div>
                      <div className="flex gap-3.5">
                        <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">2</span>
                        <p className="text-sm text-neutral-200">Click <strong className="text-white">Create App</strong>, enter any name and description, then select <strong className="text-white">Web API</strong></p>
                      </div>
                      <div className="flex gap-3.5">
                        <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">3</span>
                        <div>
                          <p className="text-sm text-neutral-200">Set this as the <strong className="text-white">Redirect URI</strong>:</p>
                          <code className="text-xs text-green-400 bg-black/40 px-2.5 py-1.5 rounded-lg mt-1.5 block break-all font-mono">{spRedirectUri}</code>
                        </div>
                      </div>
                      <div className="flex gap-3.5">
                        <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">4</span>
                        <p className="text-sm text-neutral-200">Save the app, open <strong className="text-white">Settings</strong>, and copy the <strong className="text-white">Client ID</strong></p>
                      </div>
                    </div>
                    <button onClick={() => setSpSetupStep(1)} className="w-full h-11 bg-white text-black text-sm font-semibold rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer">I have my Client ID</button>
                  </motion.div>
                )}

                {spSetupStep === 1 && (
                  <motion.div layout className="space-y-5">
                    <p className="text-sm text-neutral-400 leading-relaxed">
                      Paste your Spotify App Client ID below. It stays in your browser's local storage and is never sent to any external server.
                    </p>
                    <div>
                      <label className="text-xs text-neutral-500 uppercase tracking-wider font-medium block mb-2">Client ID</label>
                      <input type="text" value={clientIdInput} onChange={(e) => setClientIdInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaveAndConnectSpotify()} placeholder="e.g. a1b2c3d4e5f6..." autoFocus className="w-full h-11 bg-neutral-800/80 border border-neutral-700/60 rounded-xl px-4 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/30 transition" spellCheck={false} autoComplete="off" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setSpSetupStep(0)} className="h-11 px-5 text-sm text-neutral-400 hover:text-white transition-colors cursor-pointer rounded-xl">Back</button>
                      <button onClick={handleSaveAndConnectSpotify} disabled={!/^[a-f0-9]{32}$/i.test(clientIdInput.trim())} className="flex-1 h-11 bg-green-500 text-white text-sm font-semibold rounded-xl hover:bg-green-400 disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed transition-colors cursor-pointer">Connect with Spotify</button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Setup Modal - YouTube */}
        <AnimatePresence>
          {showYtSetup && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md px-5"
            >
              <motion.div
                layout
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="bg-neutral-900/95 rounded-2xl max-w-md w-full p-7 shadow-2xl border border-white/[0.08] max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold tracking-tight">Connect YouTube Music</h2>
                  <button onClick={() => setShowYtSetup(false)} className="w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="flex items-center gap-1.5 mb-6">
                  {[0, 1, 2, 3].map((s) => (
                    <div key={s} className={`h-1 rounded-full flex-1 transition-colors ${s <= ytSetupStep ? "bg-red-500" : "bg-neutral-800"}`} />
                  ))}
                </div>

                <motion.div layout>
                  {ytSetupStep === 0 && (
                    <div className="space-y-5">
                      <div>
                        <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium mb-1">Step 1 of 4</p>
                        <h3 className="text-base font-semibold mb-2">Create a project & enable API</h3>
                        <p className="text-sm text-neutral-400 leading-relaxed">You need a Google Cloud project with the YouTube Data API v3 enabled.</p>
                      </div>
                      <div className="bg-neutral-800/60 rounded-xl p-4 space-y-4">
                        <div className="flex gap-3.5">
                          <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">1</span>
                          <div>
                            <p className="text-sm text-neutral-200 font-medium">Open Google Cloud Console</p>
                            <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-xs text-red-400 hover:text-red-300 transition-colors mt-0.5 inline-block">console.cloud.google.com →</a>
                          </div>
                        </div>
                        <div className="flex gap-3.5">
                          <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">2</span>
                          <p className="text-sm text-neutral-200">Click the project dropdown → <strong className="text-white">New Project</strong> → name it → <strong className="text-white">Create</strong></p>
                        </div>
                        <div className="flex gap-3.5">
                          <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">3</span>
                          <div>
                            <p className="text-sm text-neutral-200">Enable the API:</p>
                            <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-xs text-red-400 hover:text-red-300 transition-colors mt-1 inline-block">APIs & Services → Library → YouTube Data API v3 → Enable →</a>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => setYtSetupStep(1)} className="w-full h-11 bg-white text-black text-sm font-semibold rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer">Done — Next Step</button>
                    </div>
                  )}

                  {ytSetupStep === 1 && (
                    <div className="space-y-5">
                      <div>
                        <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium mb-1">Step 2 of 4</p>
                        <h3 className="text-base font-semibold mb-2">OAuth consent screen</h3>
                        <p className="text-sm text-neutral-400 leading-relaxed">Google requires this before creating credentials.</p>
                      </div>
                      <div className="bg-neutral-800/60 rounded-xl p-4 space-y-4">
                        <div className="flex gap-3.5">
                          <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">1</span>
                          <div>
                            <p className="text-sm text-neutral-200">Go to <strong className="text-white">APIs & Services → OAuth consent screen</strong></p>
                          </div>
                        </div>
                        <div className="flex gap-3.5">
                          <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">2</span>
                          <p className="text-sm text-neutral-200">Select <strong className="text-white">External</strong> → <strong className="text-white">Create</strong></p>
                        </div>
                        <div className="flex gap-3.5">
                          <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">3</span>
                          <div>
                            <p className="text-sm text-neutral-200">Fill in required fields:</p>
                            <ul className="text-xs text-neutral-500 mt-1.5 space-y-1">
                              <li>• App name & User support email</li>
                              <li>• Developer contact email</li>
                            </ul>
                          </div>
                        </div>
                        <div className="flex gap-3.5">
                          <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">4</span>
                          <p className="text-sm text-neutral-200">On <strong className="text-white">Test users</strong>, add your Google account email</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setYtSetupStep(0)} className="h-11 px-5 text-sm text-neutral-400 hover:text-white transition-colors cursor-pointer rounded-xl">Back</button>
                        <button onClick={() => setYtSetupStep(2)} className="flex-1 h-11 bg-white text-black text-sm font-semibold rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer">Done — Next Step</button>
                      </div>
                    </div>
                  )}

                  {ytSetupStep === 2 && (
                    <div className="space-y-5">
                      <div>
                        <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium mb-1">Step 3 of 4</p>
                        <h3 className="text-base font-semibold mb-2">Create OAuth credentials</h3>
                        <p className="text-sm text-neutral-400 leading-relaxed">Create the real OAuth Client ID for Exportify.</p>
                      </div>
                      <div className="bg-neutral-800/60 rounded-xl p-4 space-y-4">
                        <div className="flex gap-3.5">
                          <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">1</span>
                          <p className="text-sm text-neutral-200">Go to <strong className="text-white">APIs & Services → Credentials</strong></p>
                        </div>
                        <div className="flex gap-3.5">
                          <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">2</span>
                          <p className="text-sm text-neutral-200">Click <strong className="text-white">+ Create Credentials → OAuth client ID</strong></p>
                        </div>
                        <div className="flex gap-3.5">
                          <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">3</span>
                          <p className="text-sm text-neutral-200">Type: <strong className="text-white">Web application</strong></p>
                        </div>
                        <div className="flex gap-3.5">
                          <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">4</span>
                          <div>
                            <p className="text-sm text-neutral-200">Under <strong className="text-white">Authorized redirect URIs</strong>, add:</p>
                            <code className="text-xs text-red-400 bg-black/40 px-2.5 py-1.5 rounded-lg mt-1.5 block break-all font-mono">{ytRedirectUri}</code>
                          </div>
                        </div>
                        <div className="flex gap-3.5">
                          <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">5</span>
                          <p className="text-sm text-neutral-200">Click <strong className="text-white">Create</strong> — copy both <strong className="text-white">Client ID</strong> and <strong className="text-white">Client Secret</strong></p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setYtSetupStep(1)} className="h-11 px-5 text-sm text-neutral-400 hover:text-white transition-colors cursor-pointer rounded-xl">Back</button>
                        <button onClick={() => setYtSetupStep(3)} className="flex-1 h-11 bg-white text-black text-sm font-semibold rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer">I have my credentials</button>
                      </div>
                    </div>
                  )}

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
                          <input type="text" value={ytClientIdInput} onChange={(e) => setYtClientIdInput(e.target.value)} placeholder="123456789-xxxx.apps.googleusercontent.com" autoFocus className="w-full h-11 bg-neutral-800/80 border border-neutral-700/60 rounded-xl px-4 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/30 transition" spellCheck={false} autoComplete="off" />
                        </div>
                        <div>
                          <label className="text-xs text-neutral-500 uppercase tracking-wider font-medium block mb-2">Client Secret</label>
                          <input type="password" value={ytClientSecretInput} onChange={(e) => setYtClientSecretInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaveAndConnectYouTube()} placeholder="GOCSPX-••••••••••••••••" className="w-full h-11 bg-neutral-800/80 border border-neutral-700/60 rounded-xl px-4 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/30 transition" spellCheck={false} autoComplete="off" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setYtSetupStep(2)} className="h-11 px-5 text-sm text-neutral-400 hover:text-white transition-colors cursor-pointer rounded-xl">Back</button>
                        <button onClick={handleSaveAndConnectYouTube} disabled={!ytClientIdInput.trim() || !ytClientSecretInput.trim()} className="flex-1 h-11 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-500 disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed transition-colors cursor-pointer">Connect YouTube</button>
                      </div>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div variants={containerVariants} initial="hidden" animate="visible">
          {/* Hero Section */}
          <motion.div variants={itemVariants} className="max-w-2xl pt-16 pb-16">
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.08] mb-6">
              Your music data,
              <br />
              <span className="text-green-500">yours to keep.</span>
            </h1>
            <p className="text-lg text-neutral-400 mb-6 max-w-lg leading-relaxed">
              Export your liked songs, playlists, top tracks, and history as JSON or CSV. Or seamlessly transfer your library directly to YouTube Music.
            </p>
            <p className="text-sm text-neutral-500 mb-10 max-w-md leading-relaxed">
              Everything runs locally in your browser. No accounts, no data logging, no middlemen. Pick a platform to authenticate and get started.
            </p>

            {/* Connections */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
              {/* Spotify Box */}
              <div className="bg-neutral-900/80 border border-white/[0.04] p-5 rounded-2xl flex flex-col justify-between hover:border-green-500/30 transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Spotify</h3>
                    <p className="text-xs text-neutral-500">{isSpotifyConnected ? "Connected" : "Requires App Client ID"}</p>
                  </div>
                </div>
                <button
                  onClick={handleConnectSpotify}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors
                    ${isSpotifyConnected ? "bg-green-500/10 text-green-500 hover:bg-green-500/20" : "bg-white text-black hover:bg-neutral-200"}`}
                >
                  {isSpotifyConnected ? "Reconnect" : "Connect Spotify"}
                </button>
              </div>

              {/* YouTube Music Box */}
              <div className="bg-neutral-900/80 border border-white/[0.04] p-5 rounded-2xl flex flex-col justify-between hover:border-red-500/30 transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">YouTube Music</h3>
                    <p className="text-xs text-neutral-500">{isYtConnected ? "Connected" : "Requires API setup"}</p>
                  </div>
                </div>
                <button
                  onClick={handleConnectYouTube}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors
                    ${isYtConnected ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" : "bg-neutral-800 text-white hover:bg-neutral-700"}`}
                >
                  {isYtConnected ? "Reconnect" : "Connect YouTube"}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Features Grid */}
          <motion.div variants={itemVariants} className="pt-20 pb-16 border-t border-white/[0.04]">
            <div className="mb-10">
              <span className="text-xs text-neutral-500 uppercase tracking-widest font-medium mb-3 block">Export Capabilities</span>
              <h2 className="text-2xl font-semibold tracking-tight">Extract everything from Spotify</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURES.map(({ icon, title, desc }) => (
                <div key={title} className="bg-neutral-900/60 rounded-2xl p-6 hover:bg-neutral-800/80 transition-colors border border-white/[0.04]">
                  <div className="text-2xl mb-4">{icon}</div>
                  <div className="text-[15px] font-semibold mb-2">{title}</div>
                  <div className="text-sm text-neutral-400 leading-relaxed">{desc}</div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* How It Works & Privacy */}
          <motion.div variants={itemVariants} className="pt-20 pb-20 border-t border-white/[0.04] grid grid-cols-1 md:grid-cols-2 gap-16">
            <div>
              <span className="text-xs text-neutral-500 uppercase tracking-widest font-medium mb-3 block">Process</span>
              <h2 className="text-2xl font-semibold tracking-tight mb-8">Three steps, completely secure.</h2>
              <div className="space-y-8">
                {[
                  { n: "1", t: "App Registration", d: "Create empty apps on Spotify/Google so you map data to your own developer keys." },
                  { n: "2", t: "PKCE Authorization", d: "Sign in using highly secure OAuth 2.0 PKCE. Your data pipeline stays strictly closed." },
                  { n: "3", t: "Client-Side Pipeline", d: "Export locally as files (JSON/CSV) or stream track mutations directly into YouTube Music." },
                ].map((s) => (
                  <div key={s.n} className="flex gap-5">
                    <div className="w-8 h-8 rounded-full bg-neutral-800/80 text-neutral-400 text-sm font-semibold flex items-center justify-center shrink-0 border border-white/[0.06]">{s.n}</div>
                    <div>
                      <div className="text-base font-semibold mb-1.5">{s.t}</div>
                      <div className="text-sm text-neutral-500 leading-relaxed max-w-sm">{s.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="bg-neutral-900/60 rounded-2xl p-8 border border-white/[0.04] h-full flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  <h3 className="text-xl font-semibold tracking-tight">Built for total privacy</h3>
                </div>
                <p className="text-sm text-neutral-400 leading-relaxed mb-8">
                  Exportify has absolutely no backend. Your authentication tokens, libraries, and playlists live in your browser's RAM and drop completely when you close the tab.
                </p>
                <div className="space-y-3 text-sm text-neutral-500">
                  <span className="flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500/80" /> No databases or servers
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500/80" /> No tracking analytics
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500/80" /> Open Source Code (MIT)
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </main>

      <footer className="border-t border-white/[0.06] py-10 animate-fade-in text-left">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-xs text-neutral-600">
            Open source under MIT License ·{" "}
            <a href="https://github.com/kumarsomeshunos/exportify" className="text-neutral-500 hover:text-white transition-colors" target="_blank" rel="noopener noreferrer">
              GitHub repository
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
