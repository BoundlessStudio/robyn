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
  if (fs.existsSync(source) && !fs.existsSync(target)) {
    git('check-ignore', '--no-index', '.env.local');
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    console.log('Restored ignored .env.local from the primary checkout.');
  }
  if (process.argv.includes('--install-hook')) {
    const hooksPath = git('rev-parse', '--path-format=absolute', '--git-path', 'hooks');
    const hook = path.join(hooksPath, 'post-checkout');
    const marker = '# robyn-worktree-env';
    if (fs.existsSync(hook) && !fs.readFileSync(hook, 'utf8').includes(marker)) {
      throw new Error('Existing post-checkout hook was preserved. Run npm run env:restore in new worktrees.');
    }
    fs.mkdirSync(hooksPath, { recursive: true });
    fs.copyFileSync(fileURLToPath(import.meta.url), path.join(common, 'hooks', 'robyn-env.mjs'));
    fs.writeFileSync(hook, '#!/bin/sh\n' + marker + '\nnode "$(git rev-parse --git-common-dir)/hooks/robyn-env.mjs"\n');
    fs.chmodSync(hook, 0o755);
    console.log('Installed the local worktree environment restore hook.');
  }
} catch (error) {
  // Build platforms need neither a Git checkout nor a developer's .env.local.
  if (process.argv.includes('--install-hook')) { console.error(error.message); process.exitCode = 1; }
}
