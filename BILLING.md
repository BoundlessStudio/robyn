# Workspace billing

Each app workspace has its own USD prepaid wallet, initialized to **$0**, separate from the operator's Agent37 wallet. No signup credit, subscription, or tier is granted. Billing is admin-only and shows the balance, a saved card, automatic top-up settings, and coupon redemption. Usage stays off this page.

## Enable payments

1. Apply the migrations with `npm run setup`, including `0006_workspace_billing.sql`.
2. Set the server-only `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, and set `NEXT_PUBLIC_SITE_URL` to the deployed app's origin. Use Stripe test credentials while testing.
3. Run `npm run billing:setup -- --url https://your-app.com` to register the webhook for `payment_intent.succeeded`, `setup_intent.succeeded`, and `charge.refunded`. It saves the signing secret and endpoint ID to ignored `.env.local`; configure the same server-only values in your deployed environment. A restricted Stripe key needs Customers, Checkout Sessions, PaymentIntents, and SetupIntents write access, PaymentMethods read access, and WebhookEndpoints write access for setup. For local testing, forward these events with Stripe CLI to `http://localhost:3000/api/billing/webhook` and use its signing secret.
4. Set `BILLING_CRON_SECRET` to a random secret. Run `npm run billing:schedule` to configure the existing Supabase project's `pg_cron`/`pg_net` scheduler **every five minutes**. This requires database read/write access through `SUPABASE_ACCESS_TOKEN` and stores the deployed origin and cron credential encrypted in Supabase Vault. Re-running updates the same job and secrets. This works with Vercel Hobby, whose native cron interval cannot support this sweep. Alternatively schedule `npm run billing:sync`, or send `POST /api/billing/sync` with `Authorization: Bearer <BILLING_CRON_SECRET>`. Ongoing debit settlement and automatic top-up depend on this sweep; opening Billing does not run it.

Checkout and card updates happen on Stripe's hosted pages. Card details and Stripe credentials stay out of the browser. Checkout uses USD card payments and saves the card. Both signed webhooks and the authenticated checkout return can fulfill a successful payment; one unique PaymentIntent ID credits the ledger once. A URL parameter by itself never credits the wallet. Automatic top-up starts **off**. Enabling it explicitly authorizes charging the chosen amount below the threshold.

Keep the **operator's Agent37 wallet funded separately**. Agent37 documents no balance or payment endpoints on `/v1`; payments collected by this app do not fund that wallet. Agent37 account limits still apply upstream, independently of these app balances.

## Grant a coupon

From a trusted operator terminal with the server's Supabase credentials:

```sh
npm run billing:coupon -- --workspace <workspace-uuid> --amount 25
```

The command prints a random code for the recipient. Its hash is stored, it expires after 30 days, and it can be redeemed once by an admin of that specific workspace. `--expires <ISO-date>` and `--code <8-to-64-letter/digit/hyphen-code>` are optional. Issue amounts from $0.01 through $10,000. Workspace admins cannot issue their own credits. Coupon credits enter the same spendable balance as paid top-ups.

## Settlement and automatic refill

The operator sweep reads Agent37's documented `GET /v1/usage` and attributes debits only to persisted agent IDs belonging to each workspace. Attribution survives deleting an agent, so final compute debits are retained. Integer USD micros avoid rounding away small charges. SQL row locks, cumulative per-day watermarks, and unique credit sources prevent duplicate debits or credits, including stale or overlapping sweeps. The previous two days are rechecked for delayed settlement; outages are caught up within the upstream 90-day retention window. A longer outage requires operator reconciliation. Existing agents establish a baseline on the first sweep, so their historical costs are not charged to the new wallet.

Before stopping unfunded agents, the sweep attempts an enabled automatic refill. Stripe retries reuse a persisted attempt ID; network uncertainty keeps the same attempt pending. Card failures disable automatic top-up and appear on Billing. An unresolved attempt older than 23 hours is held for operator review to avoid creating another charge after Stripe's retry-key retention expires. Resolve the payment in Stripe and reconcile its PaymentIntent before marking that attempt finished in the service-role table.

Creation, starts, restarts, updates, resizes, and chat require a positive app balance. The sweep explicitly stops agents whose balance is empty. A top-up or coupon permits starting them again; it does not restart agents that were deliberately stopped. Running agents can cross zero between sweeps, and Agent37's hourly compute settlement can make the balance negative. **Stopped agents still incur disk charges upstream**, which continue to debit their wallet. This app does not delete agents for nonpayment. External channels, scheduled jobs, and already-issued URLs can operate between sweeps; this is periodic enforcement, not a per-call upstream spending reservation.

Refunds initiated by the operator in Stripe debit the corresponding credit through signed `charge.refunded` events; partial and repeated refund events are reconciled once. This integration does not initiate refunds or process disputes. Chargebacks require operator review and an audited wallet adjustment.
