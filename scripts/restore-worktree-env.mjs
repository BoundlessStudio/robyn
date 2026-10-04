#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The primary checkout survives disposal of managed worktrees. No values are logged.
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

try {
  const root = git('rev-parse', '--show-toplevel');
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  const source = path.join(path.dirname(common), '.env.local');
  const target = path.join(root, '.env.local');
  const sameFile = () => fs.existsSync(source) && fs.existsSync(target) && fs.realpathSync(source) === fs.realpathSync(target);
  if (process.argv.includes('--save') && fs.existsSync(target) && !sameFile()) {
    git('check-ignore', '--no-index', '.env.local');
    const parse = (text) => Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      return match ? [[match[1], match[2].trim()]] : [];
    }));
    const nextText = fs.readFileSync(target, 'utf8');
    const next = parse(nextText);
    const current = fs.existsSync(source) ? parse(fs.readFileSync(source, 'utf8')) : {};
    const empty = (value) => !value || /replace_me|your-project|your-anon/.test(value);
    for (const [key, value] of Object.entries(current)) {
      if (!empty(value) && empty(next[key])) throw new Error(`Refusing to replace populated ${key} in the primary checkout with a missing/example value.`);
    }
    fs.writeFileSync(source, nextText);
    console.log('Synced ignored .env.local to the primary checkout.');
  }
  if (process.argv.includes('--link') && fs.existsSync(source) && fs.existsSync(target) && !sameFile()) {
    if (fs.readFileSync(source, 'utf8') !== fs.readFileSync(target, 'utf8')) throw new Error('Local environments differ. Run npm run env:save before linking.');
    git('check-ignore', '--no-index', '.env.local');
    fs.unlinkSync(target); // The identical canonical copy was verified above.
  }
  if (fs.existsSync(source) && !fs.existsSync(target)) {
    git('check-ignore', '--no-index', '.env.local');
    try { fs.symlinkSync(source, target, 'file'); console.log('Linked ignored .env.local to the primary checkout; edits are shared immediately.'); }
    catch { fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL); console.log('Restored ignored .env.local from the primary checkout.'); }
  }
  if (process.argv.includes('--install-hook')) {
    const hooksPath = git('rev-parse', '--path-format=absolute', '--git-path', 'hooks');
    const hook = path.join(hooksPath, 'post-checkout');
    const saveHook = path.join(hooksPath, 'pre-commit');
    const marker = '# robyn-worktree-env';
    if (fs.existsSync(hook) && !fs.readFileSync(hook, 'utf8').includes(marker)) {
      throw new Error('Existing post-checkout hook was preserved. Run npm run env:restore in new worktrees.');
    }
    if (fs.existsSync(saveHook) && !fs.readFileSync(saveHook, 'utf8').includes(marker)) throw new Error('Existing pre-commit hook was preserved. Run npm run env:save after editing .env.local.');
    fs.mkdirSync(hooksPath, { recursive: true });
    fs.copyFileSync(fileURLToPath(import.meta.url), path.join(common, 'hooks', 'robyn-env.mjs'));
    fs.writeFileSync(hook, '#!/bin/sh\n' + marker + '\nnode "$(git rev-parse --git-common-dir)/hooks/robyn-env.mjs"\n');
    fs.writeFileSync(saveHook, '#!/bin/sh\n' + marker + '\nnode "$(git rev-parse --git-common-dir)/hooks/robyn-env.mjs" --save\n');
    fs.chmodSync(hook, 0o755);
    fs.chmodSync(saveHook, 0o755);
    console.log('Installed local worktree restore and pre-commit environment sync hooks.');
  }
} catch (error) {
  // Build platforms need neither a Git checkout nor a developer's .env.local.
  if (['--install-hook', '--save', '--link'].some(flag => process.argv.includes(flag))) { console.error(error.message); process.exitCode = 1; }
}
