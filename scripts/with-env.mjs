#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { assertEnvFiles, readSecretsFile, root, runtimeEnvironment, selectConfig, settings } from './secrets.mjs';

const commands = {
  dev: ['node_modules/next/dist/bin/next', 'dev'],
  build: ['node_modules/next/dist/bin/next', 'build'],
  start: ['node_modules/next/dist/bin/next', 'start'],
  setup: ['scripts/setup.mjs'],
  'email:setup': ['--experimental-strip-types', 'scripts/setup-email.mjs'],
  smoke: ['scripts/smoke.mjs'],
  'billing:setup': ['scripts/setup-stripe.mjs'],
  'billing:sync': ['scripts/sync-billing.mjs'],
  'billing:listen': ['scripts/listen-stripe.mjs'],
  'billing:schedule': ['scripts/setup-billing-scheduler.mjs'],
};
const operationCommands = new Set(['setup', 'email:setup', 'billing:setup', 'billing:schedule']);

try {
  const [command, ...args] = process.argv.slice(2);
  if (!commands[command] && command !== 'check') throw new Error('Unknown command.');
  const selection = selectConfig(args);
  let env;
  if (process.env.VERCEL === '1') {
    if (!['build', 'start'].includes(command)) throw new Error('Operations commands run locally, not inside Vercel.');
    env = runtimeEnvironment(process.env, process.env, process.env.VERCEL_ENV === 'production' ? 'prd' : 'stg');
  } else {
    assertEnvFiles();
    const runtimeFile = path.join(root, selection.runtimeFile);
    const operationsFile = path.join(root, selection.operationsFile);
    env = runtimeEnvironment(process.env, readSecretsFile(runtimeFile, settings.runtimeKeys), selection.config);
    env.ROBYN_SECRET_FILE = runtimeFile;
    if (operationCommands.has(command)) {
      const operations = readSecretsFile(operationsFile, settings.operationsKeys);
      for (const name of settings.operationsKeys) env[name] = operations[name] || '';
      env.ROBYN_SECRET_OPERATIONS_FILE = operationsFile;
    }
  }
  if (command === 'check') {
    for (const name of settings.runtimeKeys) console.log(`${name}: ${env[name] ? 'configured' : 'missing'}`);
  } else {
    const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'AGENT37_API_KEY'].filter(name => !env[name]);
    if (['dev', 'start'].includes(command) && missing.length) throw new Error(`Configure ${missing.join(', ')} in ${selection.runtimeFile}.`);
    const argv = commands[command].map(arg => arg.endsWith('.mjs') || arg.startsWith('node_modules/') ? path.join(root, arg) : arg);
    const child = spawn(process.execPath, [...argv, ...selection.forwarded], { env, stdio: 'inherit', cwd: root });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.on('error', () => { console.error('Could not start the requested command.'); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
