import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connecting to Spotify",
  robots: { index: false, follow: false },
};

export default function CallbackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
