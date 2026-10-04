#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
const events = ['payment_intent.succeeded', 'setup_intent.succeeded', 'charge.refunded'];

function saveValue(name, value) {
  let contents = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  contents = pattern.test(contents) ? contents.replace(pattern, () => `${name}=${value}`) : `${contents.trimEnd()}\n${name}=${value}\n`;
  writeFileSync(envPath, contents);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Configure the Stripe billing webhook:\n  npm run billing:setup -- --url https://your-app.com\nRequires STRIPE_SECRET_KEY. Saves the signing secret to ignored .env.local.');
    return;
  }
  if (args.length && (args.length !== 2 || args[0] !== '--url')) throw new Error('Use --help for setup options.');
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Configure STRIPE_SECRET_KEY in .env.local first.');
  const site = new URL(args[1] || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost');
  if (site.protocol !== 'https:' || ['localhost','127.0.0.1','[::1]'].includes(site.hostname) || site.username || site.password) throw new Error('Provide the public HTTPS app URL. Use Stripe CLI webhook forwarding for local-only development.');
  const url = `${site.origin}/api/billing/webhook`;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 20000 });
  let existing = null;
  for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
    if (endpoint.url === url) { existing = endpoint; break; }
  }
  if (existing) {
    if (!process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_ENDPOINT_ID !== existing.id) throw new Error('A webhook already exists for this URL. Stripe reveals its signing secret only when created; save its secret as STRIPE_WEBHOOK_SECRET and its ID as STRIPE_WEBHOOK_ENDPOINT_ID in .env.local, then rerun.');
    const enabled = existing.enabled_events.includes('*') ? ['*'] : [...new Set([...existing.enabled_events, ...events])];
    await stripe.webhookEndpoints.update(existing.id, { enabled_events: enabled, disabled: false });
  } else {
    const endpoint = await stripe.webhookEndpoints.create({ url, enabled_events: events, api_version: '2026-09-30.endive', metadata: { app: 'workspace-billing' }, description: 'Workspace balance payments, card updates, and refund reconciliation' }, { idempotencyKey: `billing-webhook:${createHash('sha256').update(url).digest('hex')}` });
    if (!endpoint.secret) throw new Error('Stripe did not return a webhook signing secret. Retrieve it from your Stripe dashboard.');
    saveValue('STRIPE_WEBHOOK_SECRET', endpoint.secret);
    saveValue('STRIPE_WEBHOOK_ENDPOINT_ID', endpoint.id);
  }
  saveValue('NEXT_PUBLIC_SITE_URL', site.origin);
  console.log(`Configured billing webhook: ${url}\nSigning secret saved in ignored .env.local. Configure the same server-only values in your deployment and schedule billing:sync every five minutes.`);
}

main().catch((error) => {
  // Provider errors may contain private request context. Print only safe setup diagnostics.
  console.error(error.type ? `Stripe setup failed: ${error.type} (${error.statusCode || 'network'}). Check webhook write permissions.` : error.message);
  process.exitCode = 1;
});
