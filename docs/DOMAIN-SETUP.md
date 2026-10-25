# Robyn domain configuration

Configured and verified on 2026-10-23. The public website is **https://robyn.academy**.

## Website

- GoDaddy remains the registrar and authoritative DNS provider (`ns05.domaincontrol.com` and `ns06.domaincontrol.com`).
- Vercel project: `venatio-studios/robyn-creative-studio` (`prj_9vjpyugg5lfe8r8UvRfI3xDwva9n`). Both custom hostnames are attached and verified.
- `www.robyn.academy` redirects permanently (308) to `robyn.academy`, preserving the path and query.
- `NEXT_PUBLIC_SITE_URL=https://robyn.academy` is saved in the Vercel Production/Preview variable and local `.env.local`. New employee assignment setup derives its MCP endpoint from that value. Existing assignments can continue using the still-active Vercel hostname.
- `src/config/branding.ts` supplies the canonical metadata origin; the homepage canonical and Open Graph URL use the custom domain.
- Initial domain deployment: `dpl_Fsk4iKXzDZTQy9ne7gBtRXeRZBkn` (READY). Subsequent deployments are recorded in `docs/PAUSE-CHECKPOINT.md`.

## Embedded editor origin

The current distribution is the read-only Cloudflare Worker at **https://robyn-artcraft-editors.robyn-artcraft-runtime.workers.dev**, backed by the private `robyn-editor-artifacts` Standard R2 bucket in the Cloudflare **Robyn** account. Each independent Craft manifest keeps its existing versioned path and release pin. All 37 published releases, 15,634 paths and their licenses are retained as 661 unique SHA-256 objects totaling 976,122,736 bytes. Authentication, private creator packages and Agent37 workstations keep their existing providers and authorization boundaries.

The Worker preserves the exact allowed iframe parents and security headers below, and supplies immutable caching, executable/font MIME types, HEAD, ETag and byte-range responses. The R2 development public URL stays disabled. The companion repository's `deploy/cloudflare/README.md` documents the pinned deployment and publication commands.

The 2026-10-24 cutover passed hosted SHA-256 verification of all 661 unique objects, all thirteen authenticated production editors, native Save/reopen preservation, and desktop/mobile homepage review. Production web release `dpl_DA1Ussuw1SdS6NeFfHWCM1tf6zYs` uses the new origin. All twelve superseded full Vercel artifact deployments have been removed. The only retained editor deployment, `dpl_4f6Udd3CVLpiRRxWscpPkCPNcLrk`, contains a three-file, 1,117-byte compatibility proxy with zero editor payload files. It internally rewrites the legacy `robyn-artcraft-editors.vercel.app` paths to the Worker, preserving the iframe origin for older clients. After deletion, all 37 legacy release entry points still return exact bytes without redirects; WebAssembly ranges, HEAD, security headers and rejected private paths pass. Vercel deployment authentication still protects its generated host/secondary alias. Evidence is in `artifacts/qa/r2-migration-20261024/`. Storage accounting is recorded separately from confirmed deletion because Vercel records daily maximum usage.

### Original Vercel setup

- The companion editor host also needs the website origin in its CSP `frame-ancestors` policy. Its original policy omitted the new custom domain; this was corrected in `../robyn-artcraft-runtime/deploy/vercel.json` and published as `dpl_49HwsmSaLzYBjHkhYhNvQRXn3cFv` on 2026-10-23.
- The exact allowed parents are `https://robyn.academy`, the existing studio Vercel hostname, and the two localhost:3000 development origins. No wildcard was added.
- All 22 existing release directories (8,250 files) were preserved byte-for-byte. This deployment changes headers only; it does not promote candidate adapters.
- Production HTTP checks verify the policy on all 13 current editors, their existing release hashes, and the executable bytes for the enabled DeckCraft/VectorCraft releases. Evidence: `artifacts/qa/employee-handoff/editor-domain-proof.json`. DeckCraft also opened the saved native campaign file from the production asset browser (`deck-hosted-domain.png`). A separate direct-load empty-frame issue is still under investigation.

## Authentication and email

- Supabase project `aipgsgijclnrdegwodks` has Site URL `https://robyn.academy` and both `https://robyn.academy/**` and `https://robyn.academy/auth/callback` in the redirect allow-list. Existing localhost and Vercel callbacks remain available for development and migration.
- Public signup stays disabled and email confirmation stays required.
- Resend domain `mail.robyn.academy` (`d52df44d-2a77-4b1f-a6e1-9a074a411f4e`) is verified, including all three required DNS records.
- Supabase custom SMTP is enabled: `smtp.resend.com`, port `465`, username `resend`.
- Sender: **Robyn Creative Studio <studio@mail.robyn.academy>**.
- Credential: **Robyn Supabase SMTP**, restricted to sending from `mail.robyn.academy`; stored in Supabase's encrypted SMTP configuration. No Resend secret is needed in browser code or the Vercel application for Supabase Auth mail.
- Supabase's custom-SMTP hourly limit is 30, with a 60-second per-user interval.
- This configuration handles outgoing authentication email. Resend receiving is disabled; no inbound mailbox or forwarding was added.
- Existing Resend domains and keys were preserved. The initial domain setup did not send a test message. On 2026-10-24, read-only inspection of the existing Robyn invitation and sign-in records confirmed that Resend reports both as Delivered from `studio@mail.robyn.academy`. Actual detail-page screenshots and message IDs are recorded in `artifacts/qa/domain-setup/delivery-proof.json`; no new email was sent for this inspection. Inbox placement was not inspected.

## DNS records changed

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `216.198.79.1` | 600 seconds |
| A | `@` | `64.29.17.1` | 600 seconds |
| CNAME | `www` | `85905ceca1bc9c64.vercel-dns-017.com` | 1 hour |
| CNAME | `rsend.mail` | `rsend.forge.rmta.net` | 1 hour |
| CNAME | `send.mail` | `send.forge.rmta.net` | 1 hour |
| TXT | `resend._domainkey.mail` | Public DKIM key supplied by the Resend domain above | 1 hour |

The parked A record was replaced. GoDaddy's NS, SOA, `_domainconnect`, and existing `_dmarc` policy were preserved. The existing DMARC policy is `p=quarantine` with relaxed alignment and applies to the mail subdomain; it was not replaced with Resend's optional `p=none` suggestion.

## Verification

- `npm run typecheck`, all 20 tests, and `npm run build` passed.
- Public DNS resolves to the configured website and email records; Vercel reports valid configurations and Resend reports Verified.
- HTTPS homepage and login return 200; `www` redirects correctly, including path/query; anonymous dashboard access redirects to login and the private projects API returns 401.
- Hosted canonical/Open Graph metadata and desktop homepage/sign-in UI reviewed.
- Supabase configuration was read back through the Management API; no email template contains the old Vercel hostname.
- Configuration evidence and screenshots: `artifacts/qa/domain-setup/index.html` and `verification.json`. The original verifier does not send email and Supabase masks its saved SMTP credential. The later `delivery-proof.json`, `signin-delivered.png` and `invitation-delivered.png` separately establish provider-reported delivery of both existing branded messages.

Official setup reference: [Resend SMTP with Supabase](https://resend.com/docs/send-with-supabase-smtp).
