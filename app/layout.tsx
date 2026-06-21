import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { satoshi } from "./fonts/satoshi-font";
import { BottomNav } from "./components/bottom-nav";
import { RouteGradient } from "./components/route-gradient";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Artist Tracker",
  description:
    "Track when your followed artists perform in the Netherlands.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${satoshi.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="relative flex min-h-full flex-col bg-background text-foreground">
        <RouteGradient />
        <main className="flex-1 pb-28">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
