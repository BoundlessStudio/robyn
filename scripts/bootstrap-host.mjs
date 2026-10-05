#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { normalizeOrigin } from '../src/lib/site-url.ts';
import { bootstrapHost, configureHostInvitation, DEFAULT_HOST_EMAIL } from './host-bootstrap-lib.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Bootstrap a dedicated Host account:\n  npm run host:bootstrap -- [--email master@rgbknights.com] [--url https://your-app.com]\nUses dev by default; select --config prd explicitly for production. Sends a password setup invitation once.\nAn existing account without Host access requires identity review, then --reviewed-user-id <uuid>.');
    return;
  }
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!['--email', '--url', '--reviewed-user-id'].includes(args[index]) || !args[index + 1]) throw new Error('Use --help for Host bootstrap options.');
    options[args[index].slice(2)] = args[index + 1];
  }
  const origin = normalizeOrigin(options.url || process.env.NEXT_PUBLIC_SITE_URL);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!origin || !supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Configure the Supabase runtime credentials and application origin in Doppler first.');
  const db = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const result = await bootstrapHost(db, {
    email: options.email || DEFAULT_HOST_EMAIL, origin, reviewedUserId: options['reviewed-user-id'],
    configureInvite: () => configureHostInvitation({ token: process.env.SUPABASE_ACCESS_TOKEN, projectRef, origin }),
  });
  console.log(result.invited ? 'Host account created and password setup invitation requested.' : result.alreadyGranted ? 'Host access is already configured. No invitation was sent.' : 'Host access granted to the reviewed account. No invitation was sent.');
  console.log(`User ID: ${result.userId}\nConsole: ${origin}/host`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'Host bootstrap failed.'); process.exitCode = 1; });
