# Private beta administration release — October 29, 2026

The pilot operator can manage beta requests at [the private admin login](https://robyn.academy/admin/login). A separate single username/password account controls request search, status filters, invite/resend and decline/reopen. Matching requests move to Joined after a confirmed Auth sign-in. Creator sessions and workspace roles grant no admin access. Public signup remains disabled.

[PR #35](https://github.com/BoundlessStudio/robyn/pull/35) is merged at web **`a0a9cdd5a38d6613f42da09a0d76e58d30e81553`**, containing implementation `564dee3a60186006d2889151711d85c3e77866b9`. [Vercel completed the production deployment](https://vercel.com/venatio-studios/robyn-creative-studio/x6CyBR5sXtunfjhCHX8ijUkLHUNk). Canonical production verification passed on October 29. Documentation-only follow-ups may rebuild the same application source.

## Production verification

Twenty-five checks passed against `https://robyn.academy`: actual API/browser admin login and logout, private request listing and counts, joined filtering, email search, revocation of logged-out sessions, creator-auth separation, cross-origin/oversized request rejection, anonymous table denial, robots/noindex, axe and desktop/compact layouts. Production cookies have HttpOnly, Secure, SameSite Strict and eight-hour expiry attributes. Public Auth settings independently reported `disable_signup: true`.

No creator invitation or sign-in email was sent, and no beta request status was changed during hosted verification. Actual recipient email acceptance remains outside this release check; local database and provider-boundary tests exercise invite/resend identities, unknown-send recovery and confirmed join tracking. Private screenshots, account credentials and session cookies remain outside version control. [Sanitized production evidence](acceptance/production-beta-administration-20261029.json) records checks, release pins and screenshot hashes.

## Checks and release pins

[Local acceptance](acceptance/beta-administration-2026-10-29.md) records all 137 passing tests, typecheck, production build, three-engine admin browser/accessibility checks and the public gate. Hosted branch, PR and main checks passed tests, typecheck, dependency audit, build and all three public browser engines. The first PR attempt aborted in native Node/V8 WebAssembly allocation code while a database test started; the same branch commit passed independently, and the failed PR job passed on retry. CI run identities and final conclusions are retained in the production evidence.

This web release pairs with runtime **`fe1b155754c592bd73702eb106e74f093a0929de`**, independently fetched and confirmed as runtime origin/main. Runtime code, native templates/images, Craft manifests and editor publications are unchanged. FilmCraft remains on adapter 0.2.3; the other twelve Crafts remain on 0.2.2. The evidence includes each manifest hash, exact editor bundle/release and workstation image/template pin. Workstation client **0.1.23** remains pinned to fingerprint `463adbe8641bb2b9f9c232027e4a1edcc5af9bc2c210581cce68af4bfc8ea58d`, MCP SHA-256 `6e7b4525b249cfdd81b00fccceec7ee4ca537663d4493fe1ef8ad6d0559a3b32`. No new native round trip is claimed.

Migrations **0025–0026** and the single admin account were applied/configured before web deployment through the existing checksummed runner. The verified checkpoint has **27 ledger entries**, through `0026_beta_admin_session_reset.sql`. SHA-256 of the ordered comma-joined `filename:checksum` pairs is `22d2f3789c045cbeb88bc773ca6eebd718ebf8b781a9a1a905652e0561d66633`; the independently compared compact MD5 summary is `482d81958ab7c376e438ab247eb3f80c`. This web rollout did not rerun setup, replay migrations or reset the admin password.

## Rollback

Restoring web source `2c248f6adfb9a90c6d5b3b4c2039f9e1215b2f45` rolls back the admin interface without changing creator assets, runtime or published editor bytes. Retain the checked database ledger and additive schema; never replay historical migrations or clear the ledger. Operator password replacement is a separate explicit action through `npm run admin:create -- admin`, which revokes previous admin sessions. The pilot's previously documented database recovery/restore gaps remain unchanged.
