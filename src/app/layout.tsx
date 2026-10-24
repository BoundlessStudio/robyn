import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./brand.css";
import "@fontsource-variable/space-grotesk";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "@fontsource/instrument-serif/latin-400.css";
import { Toaster } from "sonner";
import { branding } from "@/config/branding";
import { socialMetadata } from "@/config/social-metadata";

export const metadata: Metadata = {
  metadataBase: new URL(branding.siteUrl),
  title: branding.appName,
  applicationName: branding.appName,
  description: branding.description,
  ...socialMetadata,
  // Only the public homepage and privacy page opt into indexing.
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#e9e8dc" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
