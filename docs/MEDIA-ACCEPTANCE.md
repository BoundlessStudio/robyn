# Media acceptance and promotion

Updated October 25, 2026. This record covers R13. The candidate has not been rolled out. A provider's catalog listing is discovery, not acceptance of every option it offers.

## Enabled acquisition profiles

New requests are restricted in the server as well as the UI. Existing operation IDs still reach the ownership and exact-request idempotency checks when an option is withdrawn.

| Service | Enabled profile | Recorded acquisition | Additional native check on October 25 |
| --- | --- | --- | --- |
| `blockrun-image-gen` | CogView-4, 1024 × 1024 | JPEG; $0.016750 | Previously purchased image placed as a linked PhotoCraft layer; native Save and fresh browser reopen passed |
| `blockrun-tts` | ElevenLabs Flash v2.5, Sarah, MP3, speed 1 | MP3; 33 characters; $0.002733 | Its WAV editing copy imported as a SoundCraft track; native Save and fresh browser reopen passed |
| `treza-video` | MiniMax H3, five seconds, 16:9 | MP4; $0.420000; final receipt recovery recorded | Its MP4 editing copy imported into FilmCraft's media library; native Save and fresh browser reopen passed |

The additional checks used the actual pinned 0.1.4 editors with an isolated bridge and local saved packages. They retained each exact source revision and verified the source export's SHA-256 and byte count after native saving. They did not write production revisions, perform another employee continuation, or establish a new final video render. This is separate from earlier live Craft acceptance. The three historical purchases still total **$0.439483**; this follow-up bought no generation.

Other CogView sizes, Nano Banana generation, other speech voices/formats/speeds, and other video models/durations/aspect ratios are blocked for new work pending their own checks. Legacy request syntax stays readable for recovery.

## Preview services

| Service | Reviewed request | Remaining acceptance |
| --- | --- | --- |
| `paysponge-gemini-image` | `contents[].parts[].text`; inline image response | Bounded acquisition, final cost, output verification, applicable terms and editable-file round trip |
| `blockrun-image-edit` | Explicit `google/nano-banana`, 1024 × 1024, one exact saved image as a data URI | Same; never rely on a changing provider default model |
| `blockrun-ai-api-v1-audio-sound-effects` | `text` (1–1,000 characters), five seconds, MP3 | Same; the former `prompt` field was incorrect |

These three services remain disabled. The prepared acceptance batch has a combined ceiling of **$0.127501**, rounded to a **$0.13** approval request. That request is pending; the earlier bounded purchases are not reused as authorization. A successful payment alone will not promote a service. Generated music and reference-image video remain outside accepted integration coverage.

## Pricing and contracts

The worker builds each service's reviewed request explicitly, rejects unknown options before payment, and preserves receipts/submission fences. It rechecks the live catalog and passes an exact maximum charge to the managed provider. Unknown outcomes never authorize another purchase.

- CogView's 1440 × 1440 reservation is corrected from $0.016750 to **$0.022000**. That size remains gated pending acquisition acceptance. [Image API](https://blockrun.ai/docs/api-reference/image-generation).
- Flash speech reserves `max($0.001, characters × $0.0000525) + $0.001`, rounded upward to whole micro-dollars. UTF-16 counting conservatively covers non-BMP input. A 33-character request reserves $0.002733 rather than the former $0.053500 minimum. [Speech API](https://blockrun.ai/docs/api-reference/text-to-speech).
- Nano Banana editing lists $0.053500 while the managed catalog ceiling is $0.054000. Sound effects list $0.053500 with a catalog ceiling of $0.053501. The UI explains expected charge versus reservation and displays all six decimal places when needed. [Image edit API](https://blockrun.ai/docs/api-reference/image-editing).

Prices are a dated contract observation, not a promise that a provider will retain them. A higher live quote stops before payment and produces an actionable message.

## Provenance and promotion checklist

Every promotion record must name the exact service/model/options, controlled input, request identity, ceiling, final receipt/cost, original MIME/dimensions/duration, hashes, exact input dependencies, rights/terms review, and actual native/browser edit-save-reopen result. Retain a sanitized summary and hashes in `docs/acceptance`; raw receipts, signed URLs and private project data remain in the private QA archive.

Current provenance records the service, requested settings/model, prompt, exact inputs, source bytes, timestamps and cost/receipt information. It is **not a blanket commercial license**. [BlockRun's terms](https://blockrun.ai/terms) also refer to the selected underlying providers' terms. [Sponge's terms](https://paysponge.com/terms) describe output-use responsibility without resolving every underlying-model rights question. Applicable managed-provider/model terms still need a service-specific review before additional promotions or wider invitations.

## Maintained checks

`npm test` covers profile gating, recovery of withdrawn options, size/character pricing, all six worker request shapes, final-receipt retry without payment, keyboard/axe/reflow in Chromium/Firefox/WebKit, and lost-response reconnect with no allowance. A new request is not sent if the browser cannot persist its recovery identity. The full test runner caps concurrency at four processes so local database and browser tests do not scale unboundedly with CPU count.
