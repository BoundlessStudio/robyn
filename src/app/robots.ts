import type { MetadataRoute } from "next";
import { branding } from "@/config/branding";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/dashboard", "/api/", "/auth/", "/invite/", "/login", "/reset-password"] },
    sitemap: `${branding.siteUrl}/sitemap.xml`,
    host: branding.siteUrl,
  };
}
