import { studioApps } from "@/studio/apps/registry";
import { isAppReady } from "@/studio/manifest";

const upcomingCrafts = studioApps.filter(app => !isAppReady(app));
const comingSoon = upcomingCrafts.length ? ` ${upcomingCrafts.map(app => app.name).join(", ")} coming soon.` : "";

// Branding lives in code, not env — fork this file and change these values.
// `logoUrl` can be a path to a file you drop in /public (e.g. "/logo.svg") or an
// absolute URL; "" hides it.
export const branding = {
  appName: "Robyn Creative Studio",
  logoUrl: "/brand/robin-icon.svg",
  siteUrl: "https://robyn.academy",
  title: "Robyn — Ideas have wings. | AI Creative Studio",
  description: `Give your ideas wings with Robyn: ${studioApps.length} Crafts, browser tools and Brave Search in one desktop AI creative studio.${comingSoon}`,
  socialImage: `/brand/robyn-social.png?v=${studioApps.length}-${studioApps.length - upcomingCrafts.length}`,
  socialImageAlt: `Robyn — Ideas have wings. An orange-breasted ASCII robin on warm paper. One Robyn, ${studioApps.length} Crafts.${comingSoon}`,
} as const;
