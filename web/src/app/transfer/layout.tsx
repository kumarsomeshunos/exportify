import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Transfer to YouTube Music",
  robots: { index: false, follow: false },
};

export default function TransferLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
