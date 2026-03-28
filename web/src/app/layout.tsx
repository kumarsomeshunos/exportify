import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Exportify — Export Your Spotify Data",
  description:
    "Export your Spotify liked songs, playlists, top tracks, top artists, and more as JSON or CSV. Free, open-source, and runs entirely in your browser.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Exportify — Export Your Spotify Data",
    description:
      "Export your Spotify liked songs, playlists, top tracks, and more as JSON or CSV. Free and open-source.",
    type: "website",
    url: "https://exportify.kumarsomesh.com",
  },
  twitter: {
    card: "summary",
    title: "Exportify — Export Your Spotify Data",
    description:
      "Export your Spotify liked songs, playlists, top tracks, and more as JSON or CSV. Free and open-source.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#000000] text-white font-[var(--font-inter)]">
        {children}
      </body>
    </html>
  );
}
