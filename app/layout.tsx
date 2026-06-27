import type { Metadata } from "next";
import { Caveat, Geist_Mono } from "next/font/google";
import "./globals.css";
import { satoshi } from "./fonts/satoshi-font";
import { BottomNav } from "./components/bottom-nav";
import { AnimatedGradient } from "./components/animated-gradient";
import { WelcomePopup } from "./components/welcome-popup";
import { OnboardingTour } from "./components/onboarding-tour";
import { ServiceWorkerRegister } from "./components/service-worker-register";
import { NotificationsPrompt } from "./components/notifications-prompt";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Handwritten font for the Polaroid name captions on /vriendenboekje.
const caveat = Caveat({
  variable: "--font-caveat",
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
      className={`${satoshi.variable} ${geistMono.variable} ${caveat.variable} h-full antialiased dark`}
    >
      <body className="relative flex min-h-full flex-col bg-background text-foreground">
        <AnimatedGradient />
        <main className="flex-1 pb-28">{children}</main>
        <BottomNav />
        <WelcomePopup />
        <OnboardingTour />
        <ServiceWorkerRegister />
        <NotificationsPrompt />
      </body>
    </html>
  );
}
