import type { Metadata } from "next";
import "./globals.css";
import "@fontsource-variable/space-grotesk";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "@fontsource/instrument-serif/latin-400.css";
import { Toaster } from "sonner";
import { branding } from "@/config/branding";

export const metadata: Metadata = {
  title: branding.appName,
  description: "One imagination. An entire creative studio. Meet your personal team of AI specialists, working with real creative software and files you can keep editing.",
  openGraph: {
    title: "Robyn — Make something only you could imagine.",
    description: "Your ideas. Your AI creative team. Your editable work.",
    type: "website",
  },
};

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
