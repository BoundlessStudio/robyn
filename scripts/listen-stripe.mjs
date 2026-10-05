#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { saveSecrets } from './secrets.mjs';

try {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Forward Stripe test webhooks locally:\n  npm run billing:listen -- --port 3000\nInstall the official CLI with npm install --global @stripe/cli. Start this before npm run dev.');
  } else {
    const port = args.length === 2 && args[0] === '--port' ? Number(args[1]) : args.length ? NaN : 3000;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Use --port followed by a valid local port.');
    if (!/^([sr]k)_test_/.test(process.env.STRIPE_SECRET_KEY || '')) throw new Error('Local webhook forwarding requires Stripe test credentials.');
    const shim = process.platform === 'win32' && process.env.APPDATA
      ? path.join(process.env.APPDATA, 'npm/node_modules/@stripe/cli/bin/shim.js') : '';
    const executable = shim && existsSync(shim) ? process.execPath : 'stripe';
    const prefix = shim && existsSync(shim) ? [shim] : [];
    const env = { ...process.env, STRIPE_API_KEY: process.env.STRIPE_SECRET_KEY };
    const secret = spawnSync(executable, [...prefix, 'listen', '--print-secret', '--skip-update'], {
      env, encoding: 'utf8', timeout: 30000,
    });
    const value = secret.stdout?.trim();
    if (secret.status !== 0 || !/^whsec_[A-Za-z0-9]+$/.test(value || '')) throw new Error('Could not connect to Stripe test mode. Check the CLI installation and test key.');
    if (value !== process.env.STRIPE_WEBHOOK_SECRET) {
      saveSecrets({ STRIPE_WEBHOOK_SECRET: value });
      console.log('Local signing secret updated in the runtime environment file. Restart npm run dev to load it.');
    }
    const child = spawn(executable, [...prefix, 'listen', '--skip-update', '--latest', '--events',
      'payment_intent.succeeded,setup_intent.succeeded,charge.refunded', '--forward-to',
      `http://localhost:${port}/api/billing/webhook`], { env, stdio: ['inherit', 'pipe', 'pipe'] });
    // Stripe prints the signing secret at startup. Sanitize complete lines,
    // including secrets split across stream chunks.
    for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      let pending = '';
      const emit = line => output.write(line.replace(/(?:whsec_|[srp]k_(?:live|test)_)[A-Za-z0-9_]+/g, '[redacted]'));
      stream.on('data', chunk => {
        pending += chunk.toString();
        let index;
        while ((index = pending.indexOf('\n')) !== -1) {
          emit(pending.slice(0, index + 1)); pending = pending.slice(index + 1);
        }
      });
      stream.on('end', () => { if (pending) emit(pending); });
    }
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.on('error', () => { console.error('Could not start Stripe CLI.'); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
