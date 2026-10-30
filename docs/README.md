# Documentation

Start with [architecture and scope](ARCHITECTURE.md) for how Robyn works, [setup](../SETUP.md) to configure it, and [current acceptance](CURRENT-STATUS.md) for recorded release pins and remaining gaps. Repository working rules live in [AGENTS.md](../AGENTS.md).

## System references

| Document | Purpose |
| --- | --- |
| [Architecture and scope](ARCHITECTURE.md) | Product boundaries, workstation model, authorization, files, jobs, media and allowance |
| [Current acceptance](CURRENT-STATUS.md) | Release evidence, verification scope and outstanding acceptance or policy work |
| [Operations](OPERATIONS.md) | Provisioning, stalled jobs, uncertain payments, retention, recovery, export and account closure |
| [Passwordless authentication](PASSWORDLESS-AUTH.md) | Invitation and sign-in confirmation flow |
| [Domain configuration](DOMAIN-SETUP.md) | Website, editor distribution, DNS, authentication mail and support forwarding |
| [Browser support](BROWSER-SUPPORT.md) | Desktop entry rules, tested browser scope and accessibility limits |
| [Media acceptance](MEDIA-ACCEPTANCE.md) | Enabled generation profiles, provider gates and promotion requirements |
| [Branding](BRANDING.md) | Identity sources, fonts, generated assets and metadata |
| [Homepage captures](HOMEPAGE-ARTWORK.md) | Product screenshot provenance and presentation |
| [Original artwork](ARTWORK.md) | Provenance of the earlier illustrative campaign asset |

## Evidence and history

[acceptance/](acceptance/) holds sanitized test summaries, hashes and release receipts. Private screenshots, credentials, signed URLs and recovery journals stay outside version control. Use the current acceptance page to find the relevant records; each receipt establishes only its named source, versions and verification scope.

[archive/](archive/README.md) holds dated release narratives, reviews, implementation plans and continuation checkpoints. These preserve the original work and rollback evidence, including superseded architecture and pending-action notes.

## Keeping this directory useful

Top-level documents explain the system or a procedure that remains useful across development passes. Update the owning reference when behavior changes. Keep current acceptance concise and replace superseded summaries instead of appending release narratives.

Use chat or ignored local notes for temporary plans and checkpoints. Retain a shared historical record in `archive/` only when it has continuing value; put sanitized verification evidence in `acceptance/`. Keep unresolved acceptance and policy gaps visible in current acceptance or the owning runbook. Historical receipts may name original source-tree paths and hashes; preserve those recorded identities when reorganizing documentation.
