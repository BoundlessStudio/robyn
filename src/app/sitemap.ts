import type { MetadataRoute } from "next";
import { branding } from "@/config/branding";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: branding.siteUrl, priority: 1 }, { url: `${branding.siteUrl}/privacy`, priority: 0.2 }];
}
