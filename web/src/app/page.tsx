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
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-5 w-5 border-[1.5px] border-white/30 border-t-white/80 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-xl bg-black/70 border-b border-white/[0.04]">
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
          <span className="text-[13px] font-semibold tracking-tight text-white/90">Exportify</span>
          <a
            href="https://github.com/kumarsomeshunos/exportify"
            className="text-[13px] text-white/40 hover:text-white/70 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-20 pb-24">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[1.05] tracking-tight mb-5">
            Your Spotify data,
            <br />
            <span className="bg-gradient-to-r from-[#1ed760] to-[#1db954] bg-clip-text text-transparent">
              yours to keep.
            </span>
          </h1>

          <p className="text-[17px] leading-relaxed text-white/50 max-w-md mx-auto mb-10">
            Export liked songs, playlists, top tracks, and more to JSON or CSV.
            Everything runs in your browser — nothing stored on our servers.
          </p>

          <button
            onClick={() => redirectToSpotifyAuth()}
            className="group inline-flex items-center gap-2.5 h-12 px-7 bg-white text-black
              text-[15px] font-semibold rounded-full
              hover:bg-white/90 active:scale-[0.98]
              transition-all duration-200 cursor-pointer"
          >
            <svg className="w-5 h-5 opacity-80" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            Connect with Spotify
          </button>
        </div>

        {/* Feature grid */}
        <div className="max-w-2xl w-full mx-auto mt-20">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {FEATURES.map(({ icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-2xl bg-white/[0.03] border border-white/[0.06]
                  p-5 hover:bg-white/[0.05] hover:border-white/[0.1]
                  transition-all duration-300"
              >
                <div className="text-xl mb-3">{icon}</div>
                <h3 className="text-[14px] font-semibold text-white/90 mb-1">{title}</h3>
                <p className="text-[13px] leading-snug text-white/35">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="max-w-2xl w-full mx-auto mt-24 text-center">
          <h2 className="text-[13px] font-semibold uppercase tracking-widest text-white/25 mb-10">
            How it works
          </h2>
          <div className="grid grid-cols-3 gap-8">
            {[
              { n: "1", t: "Connect", d: "Sign in with Spotify. We use PKCE — no secrets stored." },
              { n: "2", t: "Select", d: "Pick the categories you want to export." },
              { n: "3", t: "Download", d: "Get your data as JSON or CSV instantly." },
            ].map((step) => (
              <div key={step.n} className="space-y-3">
                <div className="w-8 h-8 rounded-full bg-white/[0.06] text-white/40
                  text-[13px] font-semibold flex items-center justify-center mx-auto">
                  {step.n}
                </div>
                <h3 className="text-[14px] font-semibold text-white/80">{step.t}</h3>
                <p className="text-[13px] leading-relaxed text-white/30">{step.d}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-6 text-center">
        <p className="text-[12px] text-white/20">
          Exportify is open source and runs entirely in your browser.
        </p>
      </footer>
    </div>
  );
}
