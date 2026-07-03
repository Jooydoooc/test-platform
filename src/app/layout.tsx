import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { AuthGate } from "@/components/AuthGate";
import { BackButton } from "@/components/BackButton";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Lexora",
  description: "Private English practice and progress platform",
  appleWebApp: {
    capable: true,
    title: "Lexora",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Allow zoom for accessibility; do not lock scaling.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen antialiased">
        <SiteHeader />
        <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
          <BackButton />
          <AuthGate>{children}</AuthGate>
        </main>
      </body>
    </html>
  );
}
