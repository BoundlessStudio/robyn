#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { billingUsdToCents, normalizeCoupon } from '../src/lib/billing-input.ts';

const envFile = fileURLToPath(new URL('../.env.local', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Issue one credit coupon for a workspace:\n  npm run billing:coupon -- --workspace <uuid> --amount 25 [--expires <ISO date>] [--code <code>]\nExpires in 30 days by default. Requires server-side Supabase credentials.');
    return;
  }
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (!['--workspace', '--amount', '--expires', '--code'].includes(flag) || !args[index + 1]) throw new Error('Use --help for coupon issuance options.');
    values[flag.slice(2)] = args[index + 1];
  }
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(values.workspace || '')) throw new Error('A workspace UUID is required.');
  const amount = billingUsdToCents(values.amount, 1) * 10_000;
  const code = normalizeCoupon(values.code || `CREDIT-${randomBytes(12).toString('hex')}`);
  const expiration = values.expires ? new Date(values.expires) : new Date(Date.now() + 30 * 86400000);
  if (!Number.isFinite(expiration.getTime()) || expiration.getTime() <= Date.now()) throw new Error('The expiration must be a future ISO date.');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Configure the server-side Supabase credentials first.');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { error } = await db.from('billing_coupons').insert({
    code_hash: createHash('sha256').update(code).digest('hex'), workspace_id: values.workspace,
    amount_micros: amount, expires_at: expiration.toISOString(),
  });
  if (error) throw new Error(error.code === '23505' ? 'That coupon code already exists.' : 'Could not issue the coupon. Check the workspace ID and billing migration.');
  console.log(`Coupon: ${code}\nCredit: $${(amount / 1_000_000).toFixed(2)} USD\nWorkspace: ${values.workspace}\nExpires: ${expiration.toISOString()}\nRedeem once from workspace Billing.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
