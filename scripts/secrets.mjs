import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const settings = JSON.parse(readFileSync(new URL('../secrets.config.json', import.meta.url), 'utf8'));

export function selectConfig(args, env = process.env) {
  const forwarded = [...args];
  const index = forwarded.indexOf('--config');
  let config = env.ROBYN_ENVIRONMENT || settings.defaultConfig;
  if (index !== -1) {
    if (!forwarded[index + 1] || forwarded[index + 1].startsWith('-')) throw new Error('--config requires dev, stg, or prd.');
    config = forwarded[index + 1];
    forwarded.splice(index, 2);
  }
  if (!Object.hasOwn(settings.environmentFiles, config)) throw new Error('Select dev, stg, or prd.');
  return { config, runtimeFile: settings.environmentFiles[config], operationsFile: settings.operationsFiles[config], forwarded };
}

export function readSecretsFile(file, names) {
  if (!existsSync(file)) return {};
  const values = parseEnv(readFileSync(file, 'utf8'));
  const unexpected = Object.keys(values).filter(name => !names.includes(name));
  if (unexpected.length) throw new Error(`Move unsupported keys out of ${path.basename(file)}: ${unexpected.join(', ')}. Runtime and operations credentials must stay separate.`);
  return values;
}

export function assertEnvFiles(directory = root) {
  // Explicitly populate all runtime keys before Next can read another file.
  const legacy = ['.env', '.env.development', '.env.development.local', '.env.production', '.env.test', '.env.test.local'];
  if (legacy.some(file => existsSync(path.join(directory, file)))) {
    throw new Error('Move legacy .env values into the runtime/operations files listed in SECRETS.md to avoid mixed environments.');
  }
  for (const file of Object.values(settings.environmentFiles)) readSecretsFile(path.join(directory, file), settings.runtimeKeys);
}

export function runtimeEnvironment(parent, secrets, config) {
  const env = { ...parent };
  for (const name of [...settings.runtimeKeys, ...settings.operationsKeys, 'DOPPLER_TOKEN', 'DOPPLER_PROJECT', 'DOPPLER_CONFIG', 'DOPPLER_ENVIRONMENT',
    'ROBYN_DOPPLER_CONFIG', 'ROBYN_DOPPLER_PROJECT', 'ROBYN_SECRET_PROJECT', 'ROBYN_SECRET_CONFIG', 'ROBYN_SECRET_OPERATIONS',
    'ROBYN_SECRET_FILE', 'ROBYN_SECRET_OPERATIONS_FILE']) delete env[name];
  for (const name of settings.runtimeKeys) env[name] = secrets[name] || '';
  if (config !== 'prd' && /^([sr]k)_live_/.test(env.STRIPE_SECRET_KEY)) {
    throw new Error('Development and preview must use Stripe test credentials.');
  }
  return env;
}

export function serializeSecrets(values) {
  return Object.entries(values).map(([name, value]) => {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || typeof value !== 'string' || value.includes('\0')) throw new Error('Invalid environment entry.');
    if (!value) return `${name}=`;
    const quote = ["'", '"', '`'].find(candidate => !value.includes(candidate));
    if (!quote) throw new Error(`Cannot safely quote ${name} in a local environment file.`);
    return `${name}=${quote}${value}${quote}`;
  }).join('\n') + '\n';
}

export function writeSecretsFile(file, values, names) {
  if (Object.keys(values).some(name => !names.includes(name))) throw new Error('Unsupported keys in local environment update.');
  const merged = { ...readSecretsFile(file, names), ...values };
  const contents = serializeSecrets(merged);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, contents, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function saveSecrets(values, {
  runtimeFile = process.env.ROBYN_SECRET_FILE,
  operationsFile = process.env.ROBYN_SECRET_OPERATIONS_FILE,
} = {}) {
  if (!runtimeFile) throw new Error('Run setup through the npm command so generated secrets can be saved locally.');
  const runtime = {};
  const operations = {};
  for (const [name, value] of Object.entries(values)) {
    if (settings.operationsKeys.includes(name)) {
      if (!operationsFile) throw new Error('This command requires the operations environment file.');
      operations[name] = value;
    } else if (settings.runtimeKeys.includes(name)) runtime[name] = value;
    else throw new Error(`Unknown secret name: ${name}`);
  }
  if (Object.keys(runtime).length) writeSecretsFile(runtimeFile, runtime, settings.runtimeKeys);
  if (Object.keys(operations).length) writeSecretsFile(operationsFile, operations, settings.operationsKeys);
  for (const [name, value] of Object.entries(values)) process.env[name] = value;
}
