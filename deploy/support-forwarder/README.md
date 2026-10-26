# Support forwarding

Live since October 25, 2026: **support@robyn.academy → developer@venatiostudios.com**. This Worker is independent of the Studio web deployment.

- Endpoint: `https://robyn-support-forwarder.robyn-artcraft-runtime.workers.dev/inbound`
- Resend receiving inbox: `support@robyn.academy`
- Event: `inbox.email.received`
- Deployed Worker version: `4c89517b-e71c-4bc9-805c-2c2853b6c616`
- Secrets: `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET`, stored encrypted by Cloudflare, never in this directory.

Resend's forwarding API required a Full access key across the account; it offered no inbox-only key. The owner explicitly approved that scope. The Worker itself validates the signed webhook, timestamp and exact inbox, forwards only to the fixed destination, and uses the received email ID as a stable provider idempotency key. It does not read or log message bodies/attachments; Resend performs the forward. HTTP redirects are not followed. Invalid/unrelated events cannot cause a forward.

Provider idempotency expires after 24 hours. Events older than 20 hours are refused for operator inspection rather than risking another forward. For a late retry, inspect the original inbox thread's Sent messages and delivery status. Forward manually only after confirming it has not already been sent; do not replay an expired idempotency key blindly.

```sh
node --test tests/support-forwarder.test.mjs
```

Deploy from the web repository with the companion's pinned Wrangler installation:

```sh
node ../robyn-artcraft-runtime/node_modules/wrangler/bin/wrangler.js deploy --config deploy/support-forwarder/wrangler.jsonc
```

For rotation, create the approved replacement Resend key, update the corresponding Cloudflare secret using Wrangler's secret prompt or a protected temporary input file, verify one authorized delivery, then revoke the old key. Rotate the webhook signing secret in Resend and Cloudflare together. Never put secret values on the command line, in screenshots, in a release record or in Git. Routine deployment preserves existing Worker secrets.

Verification: one setup message was received, forwarded and reported Delivered by Resend; its webhook eventually succeeded after the deployed runtime fix. An unsigned request returned 401 and a repeated signed event returned 204 with the same forward identity. Sanitized evidence hashes are in `docs/acceptance/evidence-index.json`; full provider IDs and screenshots remain in the private QA archive. No creator messages were used for testing.
