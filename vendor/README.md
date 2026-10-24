# Workstation client releases

`robyn-workstation/` contains immutable build artifacts imported from the companion `robyn-artcraft-runtime` repository. It contains the Studio MCP client, its Hermes configurator, and the thirteen employee skills. Native applications, container definitions and browser source patches remain in that companion repository.

Run `node scripts/import-workstation-release.mjs ../robyn-artcraft-runtime` after building a companion release. The importer verifies the client hash, permits only the known client/configuration/skill files, and refuses to overwrite different bytes. `src/studio/workstation-release.json` records the composite fingerprint and each file's SHA-256 and size. Preparation verifies those bytes again before transferring them to an owned employee workstation.

The bundled client retains dependency legal notices at its end. It contains no credentials. Assignment credentials are generated server-side at execution time and transferred separately to the employee's private configuration; they never enter the workflow arguments or returned values.
