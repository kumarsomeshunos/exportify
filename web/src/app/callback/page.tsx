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
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-center space-y-4">
          <div className="text-red-400 text-xl font-semibold">Error</div>
          <p className="text-zinc-400">{error}</p>
          <a
            href="/"
            className="inline-block mt-4 px-6 py-2 bg-green-500 text-black font-semibold rounded-full hover:bg-green-400 transition"
          >
            Try Again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="text-center space-y-4">
        <div className="animate-spin h-8 w-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto" />
        <p className="text-zinc-400">Authenticating with Spotify...</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-950">
          <div className="animate-spin h-8 w-8 border-2 border-green-500 border-t-transparent rounded-full" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
