"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated, redirectToSpotifyAuth } from "@/lib/spotify";

const FEATURES = [
  { icon: "❤️", title: "Liked Songs", desc: "All your saved tracks" },
  { icon: "📋", title: "Playlists", desc: "Every playlist and its tracks" },
  { icon: "🎵", title: "Top Tracks", desc: "4 weeks, 6 months, all time" },
  { icon: "🎤", title: "Top Artists", desc: "4 weeks, 6 months, all time" },
  { icon: "👥", title: "Followed Artists", desc: "Artists you follow" },
  { icon: "🕐", title: "Recently Played", desc: "Last 50 tracks" },
];

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/export");
    } else {
      setChecking(false);
    }
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="h-5 w-5 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

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

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-5 pt-16 pb-20">
        <div className="max-w-lg text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-4">
            Your Spotify data,
            <br />
            <span className="text-green-500">yours to keep.</span>
          </h1>
          <p className="text-base text-neutral-400 mb-8 max-w-sm mx-auto leading-relaxed">
            Export liked songs, playlists, top tracks, and more. Runs entirely in your browser.
          </p>
          <button
            onClick={() => redirectToSpotifyAuth()}
            className="inline-flex items-center gap-2 h-11 px-6 bg-white text-black
              text-sm font-semibold rounded-full hover:bg-neutral-200 active:bg-neutral-300
              transition cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            Connect with Spotify
          </button>
        </div>

        {/* Features */}
        <div className="max-w-lg w-full mt-16">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {FEATURES.map(({ icon, title, desc }) => (
              <div key={title} className="bg-neutral-900 rounded-lg p-4 hover:bg-neutral-800/70 transition">
                <div className="text-lg mb-2">{icon}</div>
                <div className="text-sm font-medium mb-0.5">{title}</div>
                <div className="text-xs text-neutral-500 leading-snug">{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="max-w-lg w-full mt-16 text-center">
          <span className="text-xs text-neutral-600 uppercase tracking-wider">How it works</span>
          <div className="grid grid-cols-3 gap-6 mt-6">
            {[
              { n: "1", t: "Connect", d: "Sign in with Spotify via PKCE." },
              { n: "2", t: "Select", d: "Pick categories to export." },
              { n: "3", t: "Download", d: "Get JSON or CSV instantly." },
            ].map((s) => (
              <div key={s.n}>
                <div className="w-7 h-7 rounded-full bg-neutral-800 text-neutral-400 text-xs font-medium flex items-center justify-center mx-auto mb-2">{s.n}</div>
                <div className="text-sm font-medium mb-1">{s.t}</div>
                <div className="text-xs text-neutral-500 leading-relaxed">{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-neutral-800/50 py-5 text-center">
        <p className="text-xs text-neutral-600">Open source · Runs in your browser</p>
      </footer>
    </div>
  );
}
