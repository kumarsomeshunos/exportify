"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { exchangeCodeForToken } from "@/lib/spotify";
import { Suspense } from "react";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError(`Spotify authorization failed: ${errorParam}`);
      return;
    }

    if (!code) {
      setError("No authorization code received.");
      return;
    }

    exchangeCodeForToken(code).then((success) => {
      if (success) {
        router.replace("/export");
      } else {
        setError("Failed to exchange authorization code for token.");
      }
    });
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-5 max-w-sm">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div>
            <h2 className="text-[17px] font-semibold text-white/90 mb-2">Something went wrong</h2>
            <p className="text-[14px] text-white/40 leading-relaxed">{error}</p>
          </div>
          <a
            href="/"
            className="inline-block px-6 h-10 leading-10 bg-white text-black text-[14px] font-semibold
              rounded-full hover:bg-white/90 transition-all"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="h-5 w-5 border-[1.5px] border-white/30 border-t-white/80 rounded-full animate-spin mx-auto" />
        <p className="text-[14px] text-white/40">Authenticating…</p>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="h-5 w-5 border-[1.5px] border-white/30 border-t-white/80 rounded-full animate-spin" />
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CallbackHandler />
    </Suspense>
  );
}
