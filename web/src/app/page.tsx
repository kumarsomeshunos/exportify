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
  { icon: "❤️", title: "Liked Songs", desc: "Every saved track with artist, album, and the date you added it" },
  { icon: "📋", title: "Playlists", desc: "All playlists — including collaborative and private — with full track listings" },
  { icon: "🎵", title: "Top Tracks", desc: "Your most-played songs across customizable time ranges: 4 weeks, 6 months, or all time" },
  { icon: "🎤", title: "Top Artists", desc: "Artists you listen to most, ranked by play frequency across multiple time periods" },
  { icon: "👥", title: "Followed Artists", desc: "Complete list of artists you follow, with genre and popularity data" },
  { icon: "🕐", title: "Recently Played", desc: "Your last 50 played tracks with exact timestamps" },
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
    if (!trimmed || trimmed.length < 10) return;
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
      <nav className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-neutral-800/50">
        <div className="max-w-2xl mx-auto px-5 h-11 flex items-center justify-between">
          <span className="text-sm font-semibold">Exportify</span>
          <a
            href="https://github.com/kumarsomeshunos/exportify"
            className="text-xs text-neutral-500 hover:text-neutral-300 transition"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-5 pt-16 pb-20">
        {/* Setup Wizard Modal */}
        {showSetup && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm px-5">
            <div className="bg-neutral-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-800">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold">Quick Setup</h2>
                <button
                  onClick={() => setShowSetup(false)}
                  className="text-neutral-500 hover:text-white transition cursor-pointer text-lg leading-none"
                >
                  ×
                </button>
              </div>

              {setupStep === 0 && (
                <div className="space-y-4">
                  <p className="text-sm text-neutral-400 leading-relaxed">
                    Exportify needs a Spotify App to connect to your account. It takes about a minute to set up — no coding required.
                  </p>
                  <div className="bg-neutral-800 rounded-lg p-4 space-y-3">
                    <div className="flex gap-3">
                      <span className="w-5 h-5 rounded-full bg-neutral-700 text-neutral-300 text-xs font-medium flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <div>
                        <p className="text-sm text-neutral-300">Open the Spotify Developer Dashboard</p>
                        <a
                          href="https://developer.spotify.com/dashboard"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-green-500 hover:text-green-400 transition"
                        >
                          developer.spotify.com/dashboard →
                        </a>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <span className="w-5 h-5 rounded-full bg-neutral-700 text-neutral-300 text-xs font-medium flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <p className="text-sm text-neutral-300">Click <strong>Create App</strong>, enter any name & description, select <strong>Web API</strong></p>
                    </div>
                    <div className="flex gap-3">
                      <span className="w-5 h-5 rounded-full bg-neutral-700 text-neutral-300 text-xs font-medium flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <div>
                        <p className="text-sm text-neutral-300">Add this as the <strong>Redirect URI</strong>:</p>
                        <code className="text-xs text-green-400 bg-neutral-900 px-2 py-1 rounded mt-1 block break-all">{redirectUri}</code>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <span className="w-5 h-5 rounded-full bg-neutral-700 text-neutral-300 text-xs font-medium flex items-center justify-center shrink-0 mt-0.5">4</span>
                      <p className="text-sm text-neutral-300">Save, go to <strong>Settings</strong>, and copy the <strong>Client ID</strong></p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSetupStep(1)}
                    className="w-full h-10 bg-white text-black text-sm font-semibold rounded-lg hover:bg-neutral-200 transition cursor-pointer"
                  >
                    I have my Client ID
                  </button>
                </div>
              )}

              {setupStep === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-neutral-400 leading-relaxed">
                    Paste your Spotify App Client ID below. It&apos;s stored in your browser only — never sent to any server.
                  </p>
                  <div>
                    <label className="text-xs text-neutral-500 uppercase tracking-wider block mb-1.5">Client ID</label>
                    <input
                      type="text"
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveAndConnect()}
                      placeholder="e.g. a1b2c3d4e5f6..."
                      autoFocus
                      className="w-full h-10 bg-neutral-800 border border-neutral-700 rounded-lg px-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 transition"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSetupStep(0)}
                      className="h-10 px-4 text-sm text-neutral-400 hover:text-white transition cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleSaveAndConnect}
                      disabled={!clientIdInput.trim() || clientIdInput.trim().length < 10}
                      className="flex-1 h-10 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-500 disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      Connect with Spotify
                    </button>
                  </div>
                  <p className="text-xs text-neutral-600 text-center">
                    No client secret needed — uses secure PKCE flow
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Hero */}
        <div className="max-w-lg text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-4">
            Your Spotify data,
            <br />
            <span className="text-green-500">yours to keep.</span>
          </h1>
          <p className="text-base text-neutral-400 mb-3 max-w-md mx-auto leading-relaxed">
            Export your liked songs, playlists, top tracks, top artists, followed artists, and listening history as JSON or CSV.
          </p>
          <p className="text-sm text-neutral-500 mb-8 max-w-sm mx-auto leading-relaxed">
            Everything runs in your browser. Your data never touches a server, and there&apos;s nothing to sign up for.
          </p>
          <button
            onClick={handleConnect}
            className="inline-flex items-center gap-2 h-11 px-6 bg-white text-black
              text-sm font-semibold rounded-full hover:bg-neutral-200 active:bg-neutral-300
              transition cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            {hasClientId ? "Connect with Spotify" : "Get Started"}
          </button>
          {hasClientId && (
            <button
              onClick={() => { setShowSetup(true); setSetupStep(1); setClientIdInput(getStoredClientId()); }}
              className="block mx-auto mt-3 text-xs text-neutral-600 hover:text-neutral-400 transition cursor-pointer"
            >
              Change Client ID
            </button>
          )}
        </div>

        {/* What you can export */}
        <div className="max-w-xl w-full mt-20">
          <h2 className="text-xs text-neutral-500 uppercase tracking-wider text-center mb-4">What you can export</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {FEATURES.map(({ icon, title, desc }) => (
              <div key={title} className="bg-neutral-900/80 rounded-xl p-4 hover:bg-neutral-800/60 transition-colors">
                <div className="text-lg mb-2.5">{icon}</div>
                <div className="text-sm font-semibold mb-1">{title}</div>
                <div className="text-xs text-neutral-500 leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="max-w-xl w-full mt-20 text-center">
          <h2 className="text-xs text-neutral-500 uppercase tracking-wider mb-6">How it works</h2>
          <div className="grid grid-cols-3 gap-8">
            {[
              { n: "1", t: "Create a Spotify App", d: "Open the Spotify Developer Dashboard and create a free app. No coding or approval required." },
              { n: "2", t: "Connect securely", d: "Sign in through Spotify using the PKCE flow. Your credentials stay between you and Spotify." },
              { n: "3", t: "Choose and download", d: "Select the data categories and time ranges you want, pick JSON or CSV, and download instantly." },
            ].map((s) => (
              <div key={s.n}>
                <div className="w-8 h-8 rounded-full bg-neutral-800/80 text-neutral-400 text-xs font-semibold flex items-center justify-center mx-auto mb-3">{s.n}</div>
                <div className="text-sm font-semibold mb-1.5">{s.t}</div>
                <div className="text-xs text-neutral-500 leading-relaxed">{s.d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Privacy */}
        <div className="max-w-md w-full mt-20">
          <div className="rounded-xl bg-neutral-900/60 border border-neutral-800/50 p-6 text-center">
            <div className="text-base mb-3">
              <svg className="w-6 h-6 mx-auto text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold mb-2">Privacy first</h3>
            <p className="text-xs text-neutral-500 leading-relaxed max-w-xs mx-auto">
              Exportify runs 100% in your browser. No data is ever sent to or stored on any server. Your Spotify tokens are kept in your browser&apos;s local storage and are never shared. The source code is fully open for anyone to audit.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-neutral-800/50 py-6 text-center">
        <p className="text-xs text-neutral-600">
          Free and open source ·{" "}
          <a
            href="https://github.com/kumarsomeshunos/exportify"
            className="text-neutral-500 hover:text-neutral-300 transition"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>{" "}
          · MIT License
        </p>
        <p className="text-[11px] text-neutral-700 mt-1.5">
          Not affiliated with Spotify. All data stays in your browser.
        </p>
      </footer>
    </div>
  );
}
