import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { AuthGate } from "@/components/AuthGate";
import { BackButton } from "@/components/BackButton";

export const metadata: Metadata = {
  title: "Test Platform",
  description: "Author and take tests",
  appleWebApp: {
    capable: true,
    title: "Test Platform",
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
    <html lang="en">
      <body className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <BackButton />
          <AuthGate>{children}</AuthGate>
        </main>
      </body>
    </html>
  );
}
