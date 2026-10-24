import type { Metadata } from "next";
import { branding } from "./branding";

export const socialMetadata = {
  openGraph: {
    title: branding.title,
    description: branding.description,
    siteName: branding.appName,
    locale: "en_US",
    type: "website",
    images: [{ url: branding.socialImage, width: 1200, height: 630, type: "image/png", alt: branding.socialImageAlt }],
  },
  twitter: {
    card: "summary_large_image",
    title: branding.title,
    description: branding.description,
    images: [{ url: branding.socialImage, alt: branding.socialImageAlt }],
  },
} satisfies Metadata;
