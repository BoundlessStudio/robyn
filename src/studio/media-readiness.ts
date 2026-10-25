/** Accepted acquisition profiles are deliberately narrower than provider syntax.
 * Keep old request syntax readable so withdrawing an option cannot strand it. */
export interface GenerationOptions { service?: string; settings?: Record<string, string | number>; prompt?: string }

export function generationProfile(request: GenerationOptions) {
  const s = request.settings ?? {};
  switch (request.service) {
    case "blockrun-image-gen": return { model: s.model ?? "zai/cogview-4", size: s.size ?? "1024x1024" };
    case "blockrun-tts": return { model: "elevenlabs/flash-v2.5", voice: s.voice ?? "sarah", response_format: s.response_format ?? "mp3", speed: s.speed ?? 1 };
    case "treza-video": return { model: s.model ?? "minimax-h3", seconds: s.seconds ?? 5, aspectRatio: s.aspectRatio ?? "16:9" };
    case "blockrun-image-edit": return { model: s.model ?? "google/nano-banana", size: s.size ?? "1024x1024" };
    case "blockrun-ai-api-v1-audio-sound-effects": return { duration_seconds: s.duration_seconds ?? 5, response_format: s.response_format ?? "mp3" };
    default: return {};
  }
}

export function generationReadiness(request: GenerationOptions) {
  const profile = generationProfile(request);
  const recorded = request.service === "blockrun-image-gen" && profile.model === "zai/cogview-4" && profile.size === "1024x1024"
    || request.service === "blockrun-tts" && profile.voice === "sarah" && profile.response_format === "mp3" && profile.speed === 1
    || request.service === "treza-video" && profile.model === "minimax-h3" && profile.seconds === 5 && profile.aspectRatio === "16:9";
  return { available: recorded, profile, label: recorded ? "Recorded acquisition" : "Acceptance pending",
    explanation: recorded
      ? "This exact option has a recorded paid acquisition. Other options need their own acceptance."
      : "This option needs a provider acquisition and editable-file check before new work is enabled. Existing requests can still reconnect." };
}

export function generationPrice(request: GenerationOptions) {
  const profile = generationProfile(request);
  const service = request.service;
  let expectedMicros: number;
  let reservationMicros: number;
  let basis: string;
  if (service === "blockrun-image-gen") {
    expectedMicros = profile.model === "google/nano-banana" ? 53500 : profile.size === "1440x1440" ? 22000 : 16750;
    reservationMicros = expectedMicros; basis = "One image, including the provider fee.";
  } else if (service === "blockrun-tts") {
    // The provider quotes per input character: max($0.001, chars × $0.0000525)
    // plus $0.001. UTF-16 length is a conservative bound for Unicode counting.
    expectedMicros = 1000 + Math.max(1000, Math.ceil((request.prompt?.length ?? 0) * 52.5));
    reservationMicros = expectedMicros; basis = "ElevenLabs Flash character pricing, including the minimum and provider fee.";
  } else if (service === "paysponge-gemini-image") {
    expectedMicros = reservationMicros = 20000; basis = "One image at the current managed catalog price.";
  } else if (service === "blockrun-image-edit") {
    expectedMicros = 53500; reservationMicros = 54000; basis = "The managed catalog reserves $0.054; the provider lists $0.0535 for one Nano Banana edit.";
  } else if (service === "blockrun-ai-api-v1-audio-sound-effects") {
    expectedMicros = 53500; reservationMicros = 53501; basis = "The managed catalog rounds its ceiling one micro-dollar above the provider's flat price.";
  } else if (service === "treza-video") {
    const prices = profile.model === "seedance-2.5" ? {5:1640000,10:3270000,15:4900000} : {5:420000,10:840000,15:1260000};
    expectedMicros = reservationMicros = prices[Number(profile.seconds) as 5 | 10 | 15] ?? 4900000;
    basis = "The managed catalog's model and duration price.";
  } else throw new Error("Unknown generation service.");
  return { expectedMicros, reservationMicros, basis };
}
