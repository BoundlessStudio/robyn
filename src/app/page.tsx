import type { Metadata } from "next";
import { CreativeHomepage } from "@/components/home/CreativeHomepage";
import { branding } from "@/config/branding";
import { socialMetadata } from "@/config/social-metadata";
import "./home.css";

export const metadata: Metadata = {
  title: branding.title,
  description: branding.description,
  alternates: { canonical: "/" },
  ...socialMetadata,
  openGraph: { ...socialMetadata.openGraph, url: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
};

export default function Home() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${branding.siteUrl}/#organization`, name: branding.appName, url: branding.siteUrl, logo: `${branding.siteUrl}/brand/robin-icon-512.png` },
      { "@type": "WebSite", "@id": `${branding.siteUrl}/#website`, name: branding.appName, url: branding.siteUrl, description: branding.description, inLanguage: "en", publisher: { "@id": `${branding.siteUrl}/#organization` } },
    ],
  };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /><CreativeHomepage /></>;
}
