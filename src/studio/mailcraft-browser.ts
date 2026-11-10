import "server-only";
import { studioApps } from "./apps/registry";
import { isAppReady } from "./manifest";

export function mailcraftBrowserBundle() {
  const candidate = process.env.NODE_ENV === "development" && process.env.ROBYN_MAILCRAFT_DEV_BUNDLE;
  if (candidate) {
    const url = new URL(candidate);
    if (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash) return url.href;
  }
  const app = studioApps.find(item => item.id === "mailcraft");
  return app && isAppReady(app) ? app.editor.bundleUrl : null;
}
