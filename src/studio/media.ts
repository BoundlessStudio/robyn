import { requireUuid, type AssetRef, type RevisionPackage } from "./assets";
import { mediaCanCancelUnpaid, mediaNeedsSettlement } from "./media-recovery";

export type MediaKind = "image" | "audio" | "video";
export type SearchKind = "image" | "video" | "music" | "sound_effect";
export type MediaProvider = "perflo" | "commons";
export interface MediaIdentity { workspaceId: string; userId: string; projectId: string }
export interface MediaRequest {
  operation: "import" | "generate"; provider: MediaProvider; kind: MediaKind;
  name: string; maxCostMicros: number; discoveryId?: string; service?: string;
  prompt?: string; settings?: Record<string, string | number>; inputs: AssetRef[];
}
export interface MediaDiscovery {
  id?: string; provider: "commons"; sourceId: string; kind: SearchKind;
  title: string; creator: string; sourceUrl: string; previewUrl: string | null;
  width?: number; height?: number; duration?: number; rendition?: string;
  previewOnly?: boolean;
}
export interface MediaJob {
  id: string; workspace_id: string; project_id: string; created_by: string;
  assignment_id: string | null; employee_id: string | null; employee_token_hash: string | null; request: MediaRequest;
  operation: "import" | "generate"; provider: MediaProvider; kind: MediaKind; name: string;
  state: "queued" | "preparing" | "waiting_budget" | "waiting_capacity" | "submitting" | "running" | "processing" | "uploading" | "completed" | "failed" | "uncertain" | "cancelled";
  workflow_id: string | null; instance_id: string | null; provider_job_id: string | null;
  reserved_micros: number; actual_micros: number | null; billing_settled: boolean;
  asset_id: string | null; revision_id: string | null; discovery_id: string | null;
  package: RevisionPackage | null; provider_metadata?: Record<string, unknown> | null; error_code: string | null; created_at: string;
  budget_employee_id?: string | null;
}
export const generationServices = [
  { id: "blockrun-image-gen", name: "Image · CogView / Nano Banana", kind: "image", available: true },
  { id: "paysponge-gemini-image", name: "Image · Gemini (acceptance pending)", kind: "image", available: false },
  { id: "blockrun-image-edit", name: "Edit saved image · Nano Banana (acceptance pending)", kind: "image", available: false },
  { id: "blockrun-tts", name: "Speech · ElevenLabs", kind: "audio", available: true },
  { id: "blockrun-ai-api-v1-audio-sound-effects", name: "Sound effect · ElevenLabs (acceptance pending)", kind: "audio", available: false },
  { id: "treza-video", name: "Video · MiniMax / Seedance", kind: "video", available: true },
] as const;

function boundedText(value: unknown, max: number, label: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`${label} must contain 1–${max} characters.`);
  return value.trim();
}
export function parseMediaSearch(input: Record<string, unknown>) {
  if (!["image", "video", "music", "sound_effect"].includes(String(input.kind))) throw new Error("Choose photos, video, music, or sound effects.");
  const kind = input.kind as SearchKind;
  return { kind, query: boundedText(input.query, kind === "image" || kind === "video" ? 100 : 200, "Search"), page: Number.isInteger(input.page) && Number(input.page) > 0 && Number(input.page) <= 25 ? Number(input.page) : 1 };
}
export function parseMediaRequest(input: Record<string, unknown>): MediaRequest {
  const name = boundedText(input.name, 160, "Asset name");
  if (input.operation === "import") {
    if (!["commons"].includes(String(input.provider)) || !["image", "audio", "video"].includes(String(input.kind))) throw new Error("Invalid stock acquisition.");
    return { operation: "import", provider: input.provider as "commons", kind: input.kind as MediaKind, name, discoveryId: requireUuid(input.discoveryId), maxCostMicros: 0, inputs: [] };
  }
  const service = generationServices.find(service => service.id === input.service);
  if (input.operation !== "generate" || !service) throw new Error("Choose a supported Perflo generation service.");
  const prompt = boundedText(input.prompt, service.kind === "video" ? 2000 : 10000, "Prompt");
  const settings: Record<string, string | number> = {};
  if (input.settings !== undefined && (!input.settings || typeof input.settings !== "object" || Array.isArray(input.settings))) throw new Error("Invalid generation settings.");
  const supplied = (input.settings ?? {}) as Record<string, unknown>;
  const allowed: Record<string, readonly (string | number)[]> = service.id === "treza-video"
    ? { seconds: [5, 10, 15], aspectRatio: ["16:9", "9:16"], model: ["minimax-h3", "seedance-2.5"] }
    : service.id === "blockrun-image-gen" ? { model: ["zai/cogview-4", "google/nano-banana"], size: ["512x512", "768x768", "1024x1024", "768x1344", "1344x768", "1440x1440"] }
    : service.id === "blockrun-tts" ? { response_format: ["mp3", "wav", "opus"], speed: [0.7, 0.8, 0.9, 1, 1.1, 1.2] } : {};
  for (const [key, value] of Object.entries(supplied)) {
    if (!allowed[key]?.includes(value as string | number)) throw new Error(`Unsupported ${key} setting for this service.`);
    settings[key] = value as string | number;
  }
  if (service.id === "blockrun-image-gen") settings.model ??= "zai/cogview-4";
  if (service.id === "treza-video") settings.model ??= "minimax-h3";
  const rawInputs = input.inputs ?? [];
  if (!Array.isArray(rawInputs) || rawInputs.length > 1) throw new Error("Supply at most one exact saved source image.");
  const inputs = rawInputs.map(ref => ({ assetId: requireUuid(ref?.assetId), revisionId: requireUuid(ref?.revisionId) }));
  if ((service.id === "blockrun-image-edit") !== (inputs.length === 1)) throw new Error("Image editing needs one saved image; the other services do not accept reference inputs yet.");
  return { operation: "generate", provider: "perflo", kind: service.kind, name, service: service.id, prompt, settings, maxCostMicros: 0, inputs };
}

/** System estimates from the verified Perflo catalog. The worker rechecks live
 * discovery and maxCharge before paying; actual provider charges are recorded. */
export function estimatedMediaCost(request:Pick<MediaRequest,"service"|"settings"|"prompt">) {
  if(request.service==="blockrun-image-gen")return request.settings?.model==="google/nano-banana"?53500:16750;
  if(request.service==="paysponge-gemini-image")return 20000;
  if(request.service==="blockrun-image-edit")return 54000;
  if(request.service==="blockrun-ai-api-v1-audio-sound-effects")return 53501;
  if(request.service==="blockrun-tts")return Math.max(53500,2000+Math.ceil((request.prompt?.length??0)*53500/1000));
  if(request.service==="treza-video"){const seconds=Number(request.settings?.seconds??5);return (request.settings?.model==="seedance-2.5"?{5:1640000,10:3270000,15:4900000}:{5:420000,10:840000,15:1260000})[seconds as 5|10|15]??4900000;}
  return 10000000;
}

/** Do not accept arbitrary URL imports or redirects to private/internal hosts. */
export function permittedMediaUrl(value: unknown, provider: MediaProvider | "storage", storageOrigin?: string): string {
  if (typeof value !== "string") throw new Error("Media URL is unavailable.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Unsupported media URL.");
  const hosts = provider === "commons" ? ["commons.wikimedia.org", "upload.wikimedia.org", "thumb.wikimedia.org"]
    : provider === "storage" ? [new URL(storageOrigin ?? "https://invalid.local").hostname]
    : ["blockrun.ai", "storage.blockrun.ai", "cdn.blockrun.ai", "trezalabs.com", "www.trezalabs.com", "cdn.trezalabs.com", "storage.googleapis.com", "fal.media"];
  if (!hosts.includes(url.hostname)) throw new Error("Provider returned an unsupported media host.");
  return url.href;
}

export function publicMediaJob(job: MediaJob) {
  return { id: job.id, name: job.name, provider: job.provider, kind: job.kind, state: job.state,
    reservedMicros: Number(job.reserved_micros), actualMicros: job.actual_micros === null ? null : Number(job.actual_micros),
    billingSettled: job.billing_settled, errorCode: job.error_code, createdAt: job.created_at,
    canCancel: mediaCanCancelUnpaid(job), needsSettlement: mediaNeedsSettlement(job),
    ref: job.asset_id && job.revision_id && job.state === "completed" ? { assetId: job.asset_id, revisionId: job.revision_id } : null };
}


