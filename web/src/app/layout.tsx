import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const SITE_URL = "https://exportify.kumarsomesh.com";
const TITLE = "Exportify — Export Your Spotify Data";
const DESCRIPTION =
  "Export your Spotify liked songs, playlists, top tracks, top artists, followed artists, and recently played as JSON or CSV. Transfer your Spotify library to YouTube Music. Free, open-source, and runs entirely in your browser — no server, no sign-up.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | Exportify",
  },
  description: DESCRIPTION,
  applicationName: "Exportify",
  authors: [{ name: "Kumar Somesh", url: "https://kumarsomesh.com" }],
  creator: "Kumar Somesh",
  keywords: [
    "spotify export",
    "export spotify data",
    "spotify liked songs export",
    "spotify playlist export",
    "spotify top tracks",
    "spotify top artists",
    "spotify data download",
    "spotify to csv",
    "spotify to json",
    "spotify backup",
    "spotify library export",
    "spotify to youtube music",
    "transfer spotify playlist",
    "spotify youtube music transfer",
    "exportify",
  ],
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: SITE_URL,
    siteName: "Exportify",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Exportify",
    url: SITE_URL,
    description: DESCRIPTION,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    browserRequirements: "Requires a modern web browser with JavaScript enabled",
    softwareHelp: {
      "@type": "CreativeWork",
      url: "https://github.com/kumarsomeshunos/exportify",
    },
    author: {
      "@type": "Person",
      name: "Kumar Somesh",
      url: "https://kumarsomesh.com",
    },
  };

  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#000000] text-white font-[var(--font-inter)]">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
