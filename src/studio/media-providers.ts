import "server-only";
import { ApiError } from "@/lib/http";
import { type SearchKind } from "./media";
import { normalizeCommons, type StockRecord } from "./media-commons";
export type { StockRecord } from "./media-commons";

export function mediaAvailability() {
  return { commons: { configured: true, description: "Wikimedia Commons · CC0 and CC BY" },
    perflo: { configured: Boolean(process.env.AGENT37_API_KEY), verification: "partial", paidVerifiedServices: ["blockrun-image-gen", "blockrun-tts", "treza-video"], catalogOnlyServices: ["paysponge-gemini-image", "blockrun-image-edit", "blockrun-ai-api-v1-audio-sound-effects"] } };
}
export const COMMONS_USER_AGENT = "RobynCreativeStudio/0.1 (https://robyn.academy; project media discovery)";
export async function commonsMetadata(params: Record<string, string>) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [key, value] of Object.entries({ action: "query", format: "json", formatversion: "2", maxlag: "5", ...params })) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { "User-Agent": COMMONS_USER_AGENT }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new ApiError(503, "commons_unavailable", "Wikimedia Commons is temporarily unavailable. Please retry later.");
  const reader = response.body?.getReader();
  if (!reader) throw new ApiError(502, "media_metadata_missing", "Provider metadata was unavailable.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 2_000_000) { await reader.cancel(); throw new ApiError(502, "media_metadata_too_large", "Provider metadata exceeded the supported size."); }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  const data = JSON.parse(raw);
  if (data.error) throw new ApiError(503, "commons_busy", "Wikimedia Commons asked us to pause. Please retry later.");
  return data;
}
function infoParams(kind: SearchKind) {
  const image = kind === "image";
  return { prop: `info|${image ? "imageinfo" : "videoinfo"}`, [image ? "iiprop" : "viprop"]: "url|mime|mediatype|size|sha1|timestamp|extmetadata",
    [image ? "iiurlwidth" : "viurlwidth"]: "400", [image ? "iiextmetadatafilter" : "viextmetadatafilter"]: "Artist|Credit|Attribution|LicenseUrl|LicenseShortName|Copyrighted|UsageTerms" };
}
export async function searchStock(kind: SearchKind, query: string, page: number): Promise<StockRecord[]> {
  const filetype = kind === "image" ? "bitmap" : kind === "video" ? "video" : "audio";
  const data = await commonsMetadata({ generator: "search", gsrsearch: `filetype:${filetype} ${kind === "music" ? "music " : ""}${query}`, gsrnamespace: "6", gsrlimit: "12", gsroffset: String((page - 1) * 12), ...infoParams(kind) });
  return (data.query?.pages ?? []).map((page: Record<string, unknown>) => normalizeCommons(page, kind)).filter((record: StockRecord | null): record is StockRecord => record !== null);
}
export async function acquireStock(record: StockRecord): Promise<StockRecord> {
  if (!/^\d+$/.test(record.sourceId)) throw new Error("Invalid Commons page ID.");
  const data = await commonsMetadata({ pageids: record.sourceId, ...infoParams(record.kind) });
  const fresh = normalizeCommons(data.query?.pages?.[0] ?? {}, record.kind);
  if (!fresh) throw new ApiError(409, "stock_rights_unavailable", "This file is missing, unsupported, or no longer has a supported license.");
  if (fresh.sourceSha1 !== record.sourceSha1 || fresh.licenseUrl !== record.licenseUrl || fresh.creator !== record.creator) throw new ApiError(409, "stock_changed", "The source or its rights changed after your search. Search again before importing.");
  return { ...fresh, acquiredAt: new Date().toISOString() };
}
