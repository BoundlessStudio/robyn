#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { assertNoEnvFiles, downloadSecrets, root, runtimeEnvironment, selectConfig, settings } from './secrets.mjs';

const commands = {
  dev: ['node_modules/next/dist/bin/next', 'dev'],
  build: ['node_modules/next/dist/bin/next', 'build'],
  start: ['node_modules/next/dist/bin/next', 'start'],
  setup: ['scripts/setup.mjs'],
  smoke: ['scripts/smoke.mjs'],
  'billing:coupon': ['--experimental-strip-types', 'scripts/issue-billing-coupon.mjs'],
  'billing:setup': ['scripts/setup-stripe.mjs'],
  'billing:sync': ['scripts/sync-billing.mjs'],
  'billing:schedule': ['scripts/setup-billing-scheduler.mjs'],
};
const operationCommands = new Set(['setup', 'billing:setup', 'billing:schedule']);

try {
  const [command, ...args] = process.argv.slice(2);
  if (!commands[command] && command !== 'check') throw new Error('Unknown command.');
  const selection = selectConfig(args);
  assertNoEnvFiles();
  let env;
  if (process.env.VERCEL === '1') {
    if (!['build', 'start'].includes(command)) throw new Error('Operations commands run locally, not inside Vercel.');
    env = runtimeEnvironment(process.env, process.env, process.env.VERCEL_ENV === 'production' ? 'prd' : 'stg');
  } else {
    env = runtimeEnvironment(process.env, downloadSecrets(selection.project, selection.config), selection.config);
    env.ROBYN_SECRET_PROJECT = selection.project;
    env.ROBYN_SECRET_CONFIG = selection.config;
    delete env.ROBYN_SECRET_OPERATIONS;
    if (operationCommands.has(command)) {
      const operations = downloadSecrets(selection.project, selection.operations);
      for (const name of settings.operationsKeys) env[name] = operations[name] || '';
      env.ROBYN_SECRET_OPERATIONS = selection.operations;
    }
  }
  if (command === 'check') {
    for (const name of settings.runtimeKeys) console.log(`${name}: ${env[name] ? 'configured' : 'missing'}`);
  } else {
    const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'AGENT37_API_KEY'].filter(name => !env[name]);
    if (['dev', 'start'].includes(command) && missing.length) throw new Error(`Configure ${missing.join(', ')} in ${selection.project}/${selection.config}.`);
    const argv = commands[command].map(arg => arg.endsWith('.mjs') || arg.startsWith('node_modules/') ? path.join(root, arg) : arg);
    const child = spawn(process.execPath, [...argv, ...selection.forwarded], { env, stdio: 'inherit', cwd: root });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.on('error', () => { console.error('Could not start the requested command.'); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
