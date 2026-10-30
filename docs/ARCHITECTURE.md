# Robyn Creative Studio: architecture and scope

Robyn is an invitation-only, passwordless studio for an individual creator. One visible Robyn uses fourteen Craft applications and browser/search tools on one shared workstation. The creator and Robyn continue work through private native files and exact saved revisions. [Current acceptance](CURRENT-STATUS.md) records deployed pins, verified capabilities and remaining gaps; [operations](OPERATIONS.md) describes support and recovery.

## Product and device boundaries

Public signup is disabled. Each invited creator receives a private studio and one canonical Robyn. The separate beta administrator manages access requests and invitations; a creator's workspace role does not grant that access.

The authenticated studio, Crafts, Notes and Robyn's browser tools are desktop-only. First entry requires at least 1200 CSS pixels, a fine pointer and hover, with a keyboard and mouse intended. Explain the requirement before mounting an editor on an unsupported screen. Temporarily narrowing an already-open editor preserves its session and unsaved work. This presentation check does not replace authorization or establish graphics/codec support. The public homepage supports mobile presentation.

Studio navigation opens Projects. Every project uses the same menu and current-page state:

| Destination | Responsibility |
| --- | --- |
| Dashboard | Fourteen Craft launchers, new native files and existing-file import |
| Assets | Files, Notes, source media, imports, exact versions, exports and downloads |
| Robyn | Conversation, Jobs, Review and Skills, browser control and one AI allowance summary |
| Settings | Project name and brief, archive/reactivation, shared studio/account controls and AI allowance |

New file stays with the editor's document controls. Navigation protects unsaved work. Project activity is hidden from Settings while stored history remains preserved. Old Applications links return to Dashboard. There is no employee picker or separate Researcher. Saved research notebooks remain editable as Notes; Notes is a document format, not another Craft.

The public homepage is a continuous, scroll-driven ASCII robin tour with fourteen Craft stories, real interface captures, browser/search tools and an invitation form. Preserve the left-facing bird, paper/ink/rust identity, protected text and bird areas, ordinary scrolling, chapter navigation and system reduced motion. Captions stay outside the bird silhouette. The visible pause button was removed. Review public changes at desktop and mobile widths; speculative homepage performance work requires a concrete reported issue or new request. [Branding](BRANDING.md) and [capture provenance](HOMEPAGE-ARTWORK.md) own the visual details.

## Deployment and application registry

| Component | Responsibility |
| --- | --- |
| This Next.js/TypeScript repository on Vercel | Public site, authenticated studio, server BFF and durable Workflows |
| Supabase | Auth, server-authorized Postgres and private Storage |
| Agent37 | One persistent Hermes workstation per creator, provisioned on demand with server-selected resources |
| Companion `robyn-artcraft-runtime` repository | Native image, browser builds, explicit adapter/storage patches and workstation client |
| Cloudflare R2 and read-only Worker | Immutable public editor distributions; no creator packages |

Independent [Craft manifests](../src/studio/apps/) own identity, skill instructions, formats, capabilities, editor/native pins and readiness. Registry generation supplies discovery and routing. Adding a Craft adds a tool and an on-demand skill to Robyn. It does not create another employee.

The registered Crafts are PhotoCraft, VectorCraft, LightCraft, FilmCraft, EffectCraft, SoundCraft, DesignCraft, PdfCraft, WordCraft, DeckCraft, GridCraft, FigCraft, CADCraft and SolidCraft. Keep integrations independently versioned and visibly unavailable until verified. Published versions retain their exact bytes. Native builds and workstation sources belong in the companion repository; resource policy belongs on this server. Current resource defaults and maintenance procedures are in [operations](OPERATIONS.md#shared-workstation-ownership-and-task-recovery).

## Authorization and provider boundaries

All private browser reads and writes use `/api/studio/*` or another authenticated BFF route. The browser uses Supabase for Auth, not direct table access. Server authentication, membership, admin, agent-capability and Studio ownership checks enforce access. The service-role database client bypasses RLS; TypeScript owner checks remain required. Private RLS/grants are a backstop, with no direct table access for anonymous/authenticated roles.

[`src/lib/agent37.ts`](../src/lib/agent37.ts) is the only Agent37 client. Control-plane calls use `https://api.agent37.com/v1` with Bearer authentication; instance data-plane calls use `https://{instanceId}.agent37.app/v1` with `X-Agent37-Key`. The data-plane Authorization header passes through to the application. Both stay behind the server. Before operating a workstation, match provider `metadata.app_workspace`, employee identity, owner and the Supabase mirror. Never expose provider or service-role credentials in browser code, logs or artifacts.

The canonical database employee retains kind `director` and `employee_key='robyn'`; that storage representation does not add another visible role. Historical employees and jobs retain attribution and recovery identity. Retired employees cannot start new work. Legacy lifecycle routes reject Studio employees, and legacy messaging/integration routes retain ownership checks and channel allowlists. [AGENTS.md](../AGENTS.md) lists the authoritative provider documentation required before capability changes.

## Native files and exact revisions

Postgres stores projects, assignments, assets, immutable revisions, package files, dependencies, reviews and activity. An `AssetRef` identifies an asset and an exact revision. Each package contains its native master, previews, exports and linked media under safe relative paths.

Browser/workstation transfers use short-lived, scoped signed authorization and resumable uploads directly to private Supabase Storage. Large media does not pass through a Vercel request body. Verify stored completion and commit against the expected base revision. Conflicts remain recoverable through reload or saving a new asset; restoring creates a new revision. File/media links renew against the exact saved revision.

The editor bridge supports `openAsset`, `saveAsset`, `listProjectAssets`, `insertAsset`, `notifyChanges` and `requestAgentEdit` through genuine Craft APIs and explicit save hooks. A download is not a confirmed library save. Human and AI work exchange saved revisions. Recognized native imports select their Craft and validate dependencies; multiple masters require a choice. Common images, audio and video become source assets with no owning Craft. Placement uses a compatible original, export or preview and retains the exact source revision.

## Workstation jobs and browser control

One production job owns a workspace at a time. Its own fenced media child may run; unrelated production waits. Future parallel production requires measured capacity and explicit scheduling.

Freeze each task's revocable credential, allowed application IDs, claimed generation, internal Hermes profile, work folder and transfer folder. Persist workflow, assignment, attempt, session and response identities. A new task cannot adopt another task's configuration or response, and an old process cannot broaden its capability. Historical pending requests retain their original bodies. Reconcile an interrupted or unknown dispatch before retrying; elapsed time does not authorize another external action.

Robyn uses the scoped `studio-mcp` client for authorized private operations and brings exact saved outputs to human review. Chrome and Brave Search belong to the shared workstation. Owner browser control supports watch, take over, return and disconnect. Confirm the active agent turn has stopped before allowing human input; preserve the hold across reload and resume the same assignment behind fresh execution fences. [Operations](OPERATIONS.md) owns the recovery procedure.

## Source media and managed generation

Creator controls and Robyn use the same server-side `search_media`, `import_media`, `generate_media` and `get_media_job` operations. Derive Studio, project and assignment from authenticated ownership or a revocable task capability. Recheck the workstation/assignment binding at acceptance and output commit. Browser/agent input does not establish an authoritative workspace, download URL, price, license or provider credential.

Wikimedia Commons supplies stock bitmap images, audio and video through a server-side MediaWiki adapter. Cache identical searches for 24 hours, identify Robyn, honor throttling and `maxlag`, and avoid catalog crawling. Project-scoped discoveries expire separately from acquired files. The pilot accepts clearly identified CC0 and CC BY assets: refresh metadata before acquisition, retain source page/revision, timestamp, creator, license/version, attribution and advertised SHA-1, then verify the original and record SHA-256. Reject ambiguous or changed licensing. Preserve original formats even when an editor needs a WAV/MP4 proxy.

Generation runs through Perflo inside the owned Agent37 workstation. Read the managed token from its environment on every execution. Use a live catalog, an explicitly reviewed service/model/options, a system estimate and bounded `maxCharge`. Additional services and options require their own acceptance. [Media acceptance](MEDIA-ACCEPTANCE.md) defines the enabled profiles and disabled previews.

Persist exact normalized arguments, operation identity, parent job, provider request/task IDs, phase, reservation, reported spend and output revision before external work. Reusing an ID with different arguments is a conflict. Claim submission atomically and preserve provider idempotency. An unknown paid outcome retains its reservation for reconciliation; recover the same request or receipt instead of making another payment. Unknown actual cost remains unknown.

The worker bounds transfers, verifies actual media metadata and hashes, creates identified previews/proxies and uploads directly to private Storage. Publish a source revision only after confirmed completion. Originals and provenance remain immutable. Stock records retain source/rights references and attribution; generated records retain service/model, prompt/settings, exact inputs, request identity and cost/receipt evidence. Dependencies and credit downloads preserve that provenance through native placement, restoration and export. Opening Media preserves an existing editor and unsaved work.

## Studio AI allowance

Settings exposes one monthly AI limit for Robyn, spending, reservations and available allowance. This is an application allocation policy over Agent37's per-instance limits, not an upstream atomic pooled budget. Server-managed synchronization retains archived current-period spending and non-revocable provider credit; replacing or retiring a workstation does not reset the allowance.

Persist the owner's request, expected policy operation and exact instance/period/target before a cap write. Recover a lost response by observing the saved intent. An expired lease cannot authorize another write, and a newer change waits until the earlier outcome is resolved. New paid actions require verified headroom and account for unsettled media reservations. Manual editing, saving, exports, existing assets and direct free Commons browsing remain available when allowance is exhausted. Collection of a known purchased result remains recoverable without another purchase.

## Verification and scope limits

Every Craft requires an actual native creation → browser edit → confirmed private-library save → native continuation, with editability and exact dependencies preserved. Record editor loops, operator-controlled MCP saves and ordinary AI activity as separate acceptance scopes. Test ownership, interrupted uploads, missing dependencies, save conflicts, restoration, cancellation and duplicate-run prevention. Isolated tests and recorded historical acceptance do not establish a deployed release. Release records pair web/runtime sources, migration state, editor pins and workstation client. Follow [setup](../SETUP.md) for the private checksummed migration ledger and required verification commands.

Compact/mobile native editors, subscription billing and creator hosting/storage budgets are outside the pilot. Separate Storage-file backups were explicitly deferred by the owner and are not a completion blocker. Database recovery and the full cross-service restore drill remain separately documented gaps. [Current acceptance](CURRENT-STATUS.md), [browser support](BROWSER-SUPPORT.md) and [operations](OPERATIONS.md) retain the unresolved recovery, provider and accessibility limits.
