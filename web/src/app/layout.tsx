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
