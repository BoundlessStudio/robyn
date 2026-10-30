# Hide project activity — local acceptance

Settings no longer renders the Project activity section and uses the available content width. Save Studio budget uses its natural button width and matches the other settings buttons' height. Project history remains stored and returned by the existing private project API. Project editing, archive/reactivation, studio settings and AI allowance controls retain their behavior.

Six affected browser checks passed in Chromium, Firefox and WebKit (18 runs). TypeScript passed. Desktop visual review at 1600 × 1000 and 1200 × 900 confirmed the hidden section and no horizontal overflow, using actual components with 1,000 synthetic history events. These are isolated fixture checks; production verification is recorded in the change's pull request.

Baseline web: `8e1d876eb68d183e10170c4743cbd381f283d085`. Runtime: `833e70ab99480f3d6c779591b44fa10e6a031af6`. Shared image: `robyn-studio-0-1-1@1`, digest `sha256:23622a922f2ab7df9a45d6cfe64f42247954b31843e228ded96619ccefbbea0d`. Workstation client: `0.2.0`. Database baseline: 30 checksummed entries through `0029_studio_budget_default.sql`. Runtime, editor pins, client and migrations are unchanged by this UI change.
