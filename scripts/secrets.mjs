import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const settings = JSON.parse(readFileSync(new URL('../secrets.config.json', import.meta.url), 'utf8'));

export function dopplerExecutable(env = process.env) {
  if (process.platform === 'win32') {
    const installed = path.join(env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'Microsoft', 'WinGet', 'Links', 'doppler.exe');
    if (existsSync(installed)) return installed;
  }
  return 'doppler';
}

export function doppler(args, input) {
  const result = spawnSync(dopplerExecutable(), [...args, '--no-check-version'], {
    input, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
    // Keep provider responses captured: setters can echo secret values.
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    throw new Error('Doppler request failed. Check installation, doppler login, and access to the selected project/config.');
  }
  return result.stdout;
}

export function downloadSecrets(project, config) {
  const response = doppler(['secrets', 'download', '--project', project, '--config', config, '--format', 'json', '--no-file', '--no-fallback']);
  try { return JSON.parse(response); }
  catch { throw new Error('Doppler returned an invalid response. No secret values were logged.'); }
}

export function selectConfig(args, env = process.env) {
  const forwarded = [...args];
  const index = forwarded.indexOf('--config');
  let config = env.ROBYN_DOPPLER_CONFIG || settings.defaultConfig;
  if (index !== -1) {
    if (!forwarded[index + 1] || forwarded[index + 1].startsWith('-')) throw new Error('--config requires a Doppler config name.');
    config = forwarded[index + 1];
    forwarded.splice(index, 2);
  }
  if (!/^[a-z][a-z0-9_]*$/.test(config)) throw new Error('Invalid Doppler config name.');
  const environment = config.split('_')[0];
  const operations = settings.operationsConfigs[environment];
  if (!operations) throw new Error('Select a runtime config in dev, stg, or prd.');
  return { project: env.ROBYN_DOPPLER_PROJECT || settings.project, config, operations, forwarded };
}

export function assertNoEnvFiles(directory = root) {
  const files = ['.env', '.env.local', ...['development', 'production', 'test'].flatMap(mode => [`.env.${mode}`, `.env.${mode}.local`])];
  if (files.some(file => existsSync(path.join(directory, file)))) {
    throw new Error('Remove local .env files after migrating their values to Doppler. They can silently mix credentials from different environments.');
  }
}

export function runtimeEnvironment(parent, secrets, config) {
  const env = { ...parent };
  for (const name of [...settings.runtimeKeys, ...settings.operationsKeys, 'DOPPLER_TOKEN', 'ROBYN_SECRET_PROJECT', 'ROBYN_SECRET_CONFIG', 'ROBYN_SECRET_OPERATIONS']) delete env[name];
  for (const name of settings.runtimeKeys) env[name] = secrets[name] || '';
  if (!config.startsWith('prd') && /^([sr]k)_live_/.test(env.STRIPE_SECRET_KEY)) {
    throw new Error('Development and preview configs must use Stripe test credentials.');
  }
  return env;
}

export function saveSecrets(values) {
  const project = process.env.ROBYN_SECRET_PROJECT;
  const runtimeConfig = process.env.ROBYN_SECRET_CONFIG;
  const opsConfig = process.env.ROBYN_SECRET_OPERATIONS;
  if (!project || !runtimeConfig) throw new Error('Run setup through the npm command so generated secrets can be saved to Doppler.');
  for (const [name, value] of Object.entries(values)) {
    const operational = settings.operationsKeys.includes(name);
    if (!operational && !settings.runtimeKeys.includes(name)) throw new Error(`Unknown secret name: ${name}`);
    if (operational && !opsConfig) throw new Error('This command requires the operations config.');
    doppler(['secrets', 'set', name, '--project', project, '--config', operational ? opsConfig : runtimeConfig,
      '--visibility', name.startsWith('NEXT_PUBLIC_') ? 'unmasked' : 'masked', '--silent'], value);
    process.env[name] = value;
  }
}
