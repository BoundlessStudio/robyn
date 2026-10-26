import { createHash } from "node:crypto";
import { permittedMediaUrl, type MediaDiscovery, type SearchKind } from "./media";

export interface StockRecord extends MediaDiscovery {
  provider: "commons"; downloadUrl: string; licenseUrl: string; license: "cc0" | "by";
  attribution: string; sourceSha1: string; sourceTimestamp: string; sourceRevision: number;
  licenseEvidence: Record<string, unknown>; acquiredAt?: string;
}
const clean = (value: unknown) => String(value ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
export function commonsLicense(value: unknown): { license: "cc0" | "by"; url: string } | null {
  try {
    const url = new URL(String(value));
    if (url.hostname !== "creativecommons.org" || !["http:", "https:"].includes(url.protocol)) return null;
    if (/^\/publicdomain\/zero\/1\.0(?:\/(?:deed(?:\.[a-z-]+)?)?)?$/.test(url.pathname)) return { license: "cc0", url: "https://creativecommons.org/publicdomain/zero/1.0/" };
    const match = /^\/licenses\/by\/(1\.0|2\.0|2\.5|3\.0|4\.0)(?:\/(?:deed(?:\.[a-z-]+)?)?)?$/.exec(url.pathname);
    return match ? { license: "by", url: `https://creativecommons.org/licenses/by/${match[1]}/` } : null;
  } catch { return null; }
}
export function normalizeCommons(page: Record<string, unknown>, kind: SearchKind): StockRecord | null {
  type Info = { url: string; thumburl?: string; descriptionurl: string; mime: string; mediatype?: string; sha1: string; timestamp: string; width: number; height: number; size: number; extmetadata: Record<string, { value: string }> };
  const files = (page.imageinfo ?? page.videoinfo) as Info[] | undefined;
  const info = files?.[0];
  const expected = kind === "music" || kind === "sound_effect" ? "audio" : kind;
  if (!info || !(info.mime?.startsWith(`${expected}/`) || info.mime === "application/ogg" && info.mediatype?.toLowerCase() === expected) || !/^[0-9a-f]{40}$/.test(info.sha1)) return null;
  const rights = commonsLicense(info.extmetadata?.LicenseUrl?.value);
  if (!rights) return null;
  const sourceUrl = permittedMediaUrl(info.descriptionurl, "commons");
  const title = clean(page.title).replace(/^File:/, "").slice(0, 160);
  const creator = clean(info.extmetadata.Artist?.value).slice(0, 1000);
  if (rights.license === "by" && !creator) return null;
  let previewUrl: string | null = null;
  try { previewUrl = permittedMediaUrl(info.thumburl, "commons"); } catch { /* artwork is optional for audio */ }
  const credit = clean(info.extmetadata.Credit?.value);
  const requiredAttribution = clean(info.extmetadata.Attribution?.value);
  const attribution = [...new Set([`${title} — ${clean(info.extmetadata.Artist?.value) || "Creator identified on source page"}. ${rights.license === "cc0" ? "CC0 1.0" : "CC BY"}. ${sourceUrl} ${rights.url}`, credit, requiredAttribution].filter(Boolean))].join("\n");
  return { provider: "commons", sourceId: String(page.pageid), kind, title, creator, sourceUrl, previewUrl,
    downloadUrl: permittedMediaUrl(info.url, "commons"), licenseUrl: rights.url, license: rights.license,
    width: info.width, height: info.height, rendition: "Source file", sourceSha1: info.sha1, sourceTimestamp: info.timestamp, sourceRevision: Number(page.lastrevid), attribution,
    licenseEvidence: { pageId: page.pageid, revision: page.lastrevid, checkedAt: new Date().toISOString(), metadata: info.extmetadata,
      sha256: createHash("sha256").update(JSON.stringify(info.extmetadata)).digest("hex") } };
}
