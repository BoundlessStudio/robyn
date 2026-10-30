# Settings budget, activity and SolidCraft icon — local acceptance

Baseline: web `cd7bd7d`, branch `codex/settings-budget-animal-icon`.

## Behavior

- New studios receive a $20 monthly AI allowance through migration `0029_studio_budget_default.sql`. Reinitialization preserves existing owner choices, including $0 and $75.
- The settings form and budget API accept $0–$100. Existing stored budgets remain readable.
- Saving $0 sets provider monthly headroom to zero and blocks new AI work even when one-time credit remains. Saved progress, manual editing and exports remain available. Existing cap-write receipts can reconcile without replaying an uncertain provider write.
- Activity has a bounded, sticky right sidebar with an independently scrollable, keyboard-focusable history. Increasing the fixture from 100 to 1,000 events does not increase the settings page height.
- SolidCraft uses an engraved armadillo icon generated with built-in imagegen, matching the existing animal family. The 256 × 256 WebP preserves alpha; the exact prompt and source digest are in `public/brand/apps/sources.json`.

Icon SHA-256: `edc580363fde8607c97e931370d907c548f90fa4992d35011484d0ea898e1ebd`.

## Verification

- `npm run typecheck` passed.
- `npm test` passed: 229 standard tests and four TSX tests (233 total).
- All five settings browser tests passed in Chromium, Firefox and WebKit, covering default/range/zero behavior, disabled AI submission, bounded activity, saved-request recovery and storage failure.
- `npm run build` passed after the final code and layout changes.
- Desktop visual review at 1600 × 1000 and 1200 × 900 covered default/zero budget states, project editing, keyboard activity scrolling, 1,000-event history and the SolidCraft launcher icon. No horizontal overflow or browser errors were observed.

Browser evidence uses isolated fixtures with synthetic data. Runtime and editor pins are unchanged. Migration 0029 is now applied in production, with 30 matching ledger entries, unchanged prior receipts and preserved existing owner budgets. The [release manifest](settings-budget-release-20261030.json) records matching source and runtime pins; [PR #40](https://github.com/BoundlessStudio/robyn/pull/40) tracks the web rollout.
