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
