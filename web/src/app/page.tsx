"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  isAuthenticated,
  redirectToSpotifyAuth,
  getStoredClientId,
  saveClientId,
  getConfiguredRedirectUri,
} from "@/lib/spotify";

const FEATURES = [
  {
    icon: "❤️",
    title: "Liked Songs",
    desc: "Every track you've hearted — your full saved library exported with artist, album, and date added.",
  },
  {
    icon: "📋",
    title: "Playlists",
    desc: "All your playlists, including collaborative ones, with complete track listings for each.",
  },
  {
    icon: "🎵",
    title: "Top Tracks",
    desc: "Your most-played songs ranked by listening time. Choose from last 4 weeks, 6 months, or all time.",
  },
  {
    icon: "🎤",
    title: "Top Artists",
    desc: "The artists you listen to most, with genre and popularity data. Customizable time ranges.",
  },
  {
    icon: "👥",
    title: "Followed Artists",
    desc: "A complete list of every artist you follow, including their genres and follower counts.",
  },
  {
    icon: "🕐",
    title: "Recently Played",
    desc: "Your last 50 played tracks with exact timestamps — see what you were listening to and when.",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasClientId, setHasClientId] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [clientIdInput, setClientIdInput] = useState("");
  const [setupStep, setSetupStep] = useState(0);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/export");
      return;
    }
    const stored = getStoredClientId();
    setHasClientId(!!stored);
    setChecking(false);
  }, [router]);

  const handleConnect = () => {
    const stored = getStoredClientId();
    if (!stored) {
      setShowSetup(true);
      return;
    }
    redirectToSpotifyAuth();
  };

  const handleSaveAndConnect = () => {
    const trimmed = clientIdInput.trim();
    if (!trimmed || !/^[a-f0-9]{32}$/i.test(trimmed)) return;
    saveClientId(trimmed);
    setHasClientId(true);
    setShowSetup(false);
    redirectToSpotifyAuth();
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="h-5 w-5 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const redirectUri = typeof window !== "undefined" ? getConfiguredRedirectUri() : "";

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-black/80 backdrop-blur-2xl border-b border-white/[0.06]">
        <div className="max-w-3xl mx-auto px-6 h-12 flex items-center justify-between">
          <span className="text-[15px] font-semibold tracking-tight">Exportify</span>
          <a
            href="https://github.com/kumarsomeshunos/exportify"
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center px-6">
        {/* Setup Wizard Modal */}
        {showSetup && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md px-5">
            <div className="bg-neutral-900/95 rounded-2xl max-w-md w-full p-7 shadow-2xl border border-white/[0.08] backdrop-blur-xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold tracking-tight">Quick Setup</h2>
                <button
                  onClick={() => setShowSetup(false)}
                  className="w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {setupStep === 0 && (
                <div className="space-y-5">
                  <p className="text-sm text-neutral-400 leading-relaxed">
                    Exportify connects directly to Spotify through your own app credentials. This keeps your data private — nothing passes through our servers. Setup takes about a minute.
                  </p>
                  <div className="bg-neutral-800/60 rounded-xl p-5 space-y-4">
                    <div className="flex gap-3.5">
                      <span className="w-6 h-6 rounded-full bg-neutral-700/80 text-neutral-300 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <div>
                        <p className="text-sm text-neutral-200 font-medium">Open the Spotify Developer Dashboard</p>
                        <a
                          href="https://developer.spotify.com/dashboard"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-green-500 hover:text-green-400 transition-colors mt-0.5 inline-block"
                        >
                          developer.spotify.com/dashboard →
                        </a>
                      </div>
                    </div>
                    <div className="flex gap-3.5">
                      <span className="w-6 h-6 rounded-full bg-neutral-700/80 text-neutral-300 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <p className="text-sm text-neutral-200">Click <strong className="text-white">Create App</strong>, enter any name and description, then select <strong className="text-white">Web API</strong></p>
                    </div>
                    <div className="flex gap-3.5">
                      <span className="w-6 h-6 rounded-full bg-neutral-700/80 text-neutral-300 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <div>
                        <p className="text-sm text-neutral-200">Set this as the <strong className="text-white">Redirect URI</strong>:</p>
                        <code className="text-xs text-green-400 bg-black/40 px-2.5 py-1.5 rounded-lg mt-1.5 block break-all font-mono">{redirectUri}</code>
                      </div>
                    </div>
                    <div className="flex gap-3.5">
                      <span className="w-6 h-6 rounded-full bg-neutral-700/80 text-neutral-300 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">4</span>
                      <p className="text-sm text-neutral-200">Save the app, open <strong className="text-white">Settings</strong>, and copy the <strong className="text-white">Client ID</strong></p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSetupStep(1)}
                    className="w-full h-11 bg-white text-black text-sm font-semibold rounded-xl hover:bg-neutral-100 active:bg-neutral-200 transition-colors cursor-pointer"
                  >
                    I have my Client ID
                  </button>
                </div>
              )}

              {setupStep === 1 && (
                <div className="space-y-5">
                  <div>
                    <p className="text-sm text-neutral-400 leading-relaxed">
                      Paste your Spotify App Client ID below. It stays in your browser&apos;s local storage and is never sent to any external server.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500 uppercase tracking-wider font-medium block mb-2">Client ID</label>
                    <input
                      type="text"
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveAndConnect()}
                      placeholder="e.g. a1b2c3d4e5f6..."
                      autoFocus
                      className="w-full h-11 bg-neutral-800/80 border border-neutral-700/60 rounded-xl px-4 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500/30 transition"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSetupStep(0)}
                      className="h-11 px-5 text-sm text-neutral-400 hover:text-white transition-colors cursor-pointer rounded-xl"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleSaveAndConnect}
                      disabled={!/^[a-f0-9]{32}$/i.test(clientIdInput.trim())}
                      className="flex-1 h-11 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-500 disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      Connect with Spotify
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 pt-1">
                    <svg className="w-3 h-3 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <p className="text-xs text-neutral-600">
                      Secured with PKCE — no client secret required
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Hero */}
        <div className="max-w-2xl text-center pt-24 pb-4">
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.08] mb-5">
            Your Spotify data,
            <br />
            <span className="text-green-500">yours to keep.</span>
          </h1>
          <p className="text-lg text-neutral-400 mb-3 max-w-md mx-auto leading-relaxed">
            Export your liked songs, playlists, top tracks, artists, and listening history as JSON or CSV.
          </p>
          <p className="text-sm text-neutral-600 mb-10 max-w-sm mx-auto leading-relaxed">
            Everything runs in your browser. No accounts, no servers, no data collection. Just your music data, downloaded directly.
          </p>
          <button
            onClick={handleConnect}
            className="inline-flex items-center gap-2.5 h-12 px-7 bg-white text-black
              text-sm font-semibold rounded-full hover:bg-neutral-100 active:bg-neutral-200
              transition-colors cursor-pointer shadow-lg shadow-white/5"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            {hasClientId ? "Connect with Spotify" : "Get Started"}
          </button>
          {hasClientId && (
            <button
              onClick={() => { setShowSetup(true); setSetupStep(1); setClientIdInput(getStoredClientId()); }}
              className="block mx-auto mt-3 text-xs text-neutral-600 hover:text-neutral-400 transition-colors cursor-pointer"
            >
              Change Client ID
            </button>
          )}
        </div>

        {/* What You Can Export */}
        <div className="max-w-2xl w-full pt-20 pb-4">
          <div className="text-center mb-8">
            <span className="text-xs text-neutral-500 uppercase tracking-widest font-medium">What you can export</span>
            <h2 className="text-2xl font-semibold tracking-tight mt-2">Six categories of your Spotify data</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURES.map(({ icon, title, desc }) => (
              <div key={title} className="bg-neutral-900/80 rounded-2xl p-5 hover:bg-neutral-800/60 transition-colors border border-white/[0.04]">
                <div className="text-xl mb-3">{icon}</div>
                <div className="text-[15px] font-semibold mb-1.5">{title}</div>
                <div className="text-xs text-neutral-500 leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* How It Works */}
        <div className="max-w-2xl w-full pt-20 pb-4">
          <div className="text-center mb-10">
            <span className="text-xs text-neutral-500 uppercase tracking-widest font-medium">How it works</span>
            <h2 className="text-2xl font-semibold tracking-tight mt-2">Three steps, under two minutes</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                n: "1",
                t: "Create a Spotify App",
                d: "Register a free app on Spotify's developer dashboard. No coding or approval needed — just a name and redirect URL.",
              },
              {
                n: "2",
                t: "Authorize Securely",
                d: "Sign in with your Spotify account using the PKCE protocol. Your credentials never touch our servers.",
              },
              {
                n: "3",
                t: "Choose & Download",
                d: "Select the data categories and time ranges you want, pick JSON or CSV, and download instantly.",
              },
            ].map((s) => (
              <div key={s.n} className="text-center">
                <div className="w-9 h-9 rounded-full bg-neutral-800/80 text-neutral-300 text-sm font-semibold flex items-center justify-center mx-auto mb-3 border border-white/[0.06]">{s.n}</div>
                <div className="text-[15px] font-semibold mb-2">{s.t}</div>
                <div className="text-xs text-neutral-500 leading-relaxed">{s.d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Privacy Section */}
        <div className="max-w-2xl w-full pt-20 pb-24">
          <div className="bg-neutral-900/60 rounded-2xl p-8 border border-white/[0.04] text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <h3 className="text-lg font-semibold tracking-tight">Built for privacy</h3>
            </div>
            <p className="text-sm text-neutral-400 leading-relaxed max-w-md mx-auto mb-6">
              Exportify has no backend. Your Spotify tokens and data stay in your browser and are never sent anywhere except directly to Spotify&apos;s API. The entire codebase is open source.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-neutral-500">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500/60"></span>
                No server or database
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500/60"></span>
                No tracking or analytics collection
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500/60"></span>
                PKCE authentication (no secrets)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500/60"></span>
                100% open source (MIT)
              </span>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/[0.06] py-6 text-center">
        <p className="text-xs text-neutral-600">
          Open source ·{" "}
          <a
            href="https://github.com/kumarsomeshunos/exportify"
            className="text-neutral-500 hover:text-neutral-300 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>{" "}
          · MIT License
        </p>
      </footer>
    </div>
  );
}
