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
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="animate-spin h-8 w-8 border-2 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
        <h1 className="text-5xl sm:text-6xl font-bold mb-6">
          <span className="text-green-500">Exportify</span>
        </h1>
        <p className="text-xl text-zinc-400 mb-2 max-w-2xl mx-auto">
          Export your Spotify data — liked songs, playlists, top tracks, artists,
          and more — to JSON or CSV.
        </p>
        <p className="text-sm text-zinc-600 mb-10">
          No server storage. Your data stays in your browser and downloads
          directly to your device.
        </p>

        <button
          onClick={() => redirectToSpotifyAuth()}
          className="inline-flex items-center gap-3 px-8 py-4 bg-green-500 text-black
            font-bold text-lg rounded-full hover:bg-green-400 hover:scale-105
            transition-all duration-200 cursor-pointer"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Connect with Spotify
        </button>
      </div>

      {/* Features */}
      <div className="max-w-4xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {FEATURES.map(({ icon, title, desc }) => (
            <div
              key={title}
              className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 hover:border-zinc-700 transition"
            >
              <div className="text-2xl mb-2">{icon}</div>
              <h3 className="font-semibold mb-1">{title}</h3>
              <p className="text-sm text-zinc-500">{desc}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="mt-16 text-center">
          <h2 className="text-2xl font-bold mb-8">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="w-10 h-10 bg-green-500/10 text-green-500 font-bold rounded-full flex items-center justify-center mx-auto">
                1
              </div>
              <h3 className="font-semibold">Connect</h3>
              <p className="text-sm text-zinc-500">
                Log in with your Spotify account. We use PKCE auth — no secrets stored.
              </p>
            </div>
            <div className="space-y-2">
              <div className="w-10 h-10 bg-green-500/10 text-green-500 font-bold rounded-full flex items-center justify-center mx-auto">
                2
              </div>
              <h3 className="font-semibold">Select</h3>
              <p className="text-sm text-zinc-500">
                Choose what to export — liked songs, playlists, top tracks, and more.
              </p>
            </div>
            <div className="space-y-2">
              <div className="w-10 h-10 bg-green-500/10 text-green-500 font-bold rounded-full flex items-center justify-center mx-auto">
                3
              </div>
              <h3 className="font-semibold">Download</h3>
              <p className="text-sm text-zinc-500">
                Get your data as JSON or CSV. Everything runs in your browser.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-6 text-center text-sm text-zinc-600">
        <p>
          Exportify — Open source on{" "}
          <a
            href="https://github.com/kumarsomeshunos/exportify"
            className="text-zinc-400 hover:text-zinc-300 transition"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
