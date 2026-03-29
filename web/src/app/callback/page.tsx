"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { exchangeCodeForToken, verifyOAuthState } from "@/lib/spotify";
import { Suspense } from "react";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");
    const state = searchParams.get("state");

    if (errorParam) {
      setError(`Spotify authorization failed: ${errorParam}`);
      return;
    }

    if (!verifyOAuthState(state)) {
      setError("Security check failed: OAuth state mismatch. Please try connecting again.");
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
      <div className="min-h-screen flex items-center justify-center bg-black px-6">
        <div className="text-center max-w-xs">
          <div className="w-10 h-10 rounded-full bg-red-900/40 flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-white mb-1">Something went wrong</h2>
          <p className="text-sm text-neutral-500 mb-5 leading-relaxed">{error}</p>
          <a
            href="/"
            className="inline-block px-5 h-9 leading-9 bg-white text-black text-sm font-semibold rounded-full hover:bg-neutral-200 transition"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center space-y-3">
        <div className="h-5 w-5 border-2 border-neutral-700 border-t-white rounded-full animate-spin mx-auto" />
        <p className="text-sm text-neutral-500">Authenticating…</p>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="h-5 w-5 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
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
