# External MCP

Robyn exposes the private Studio at `https://robyn.academy/mcp` when the production deployment enables the endpoint. Other deployments use their configured HTTPS Studio origin followed by `/mcp`. The endpoint uses stateless Streamable HTTP and OAuth authorization code with S256 PKCE. Creators use their existing invitation-only email sign-in and approve the connection on Robyn.

## Connect ChatGPT

1. In ChatGPT web, open **Plugins → + → Add custom MCP server**. Name it **Robyn**, enter the deployed `/mcp` HTTPS URL and choose **OAuth** with dynamic client registration.
2. Create and install the plugin. When ChatGPT asks you to connect, sign in with the email from your Robyn invitation, open the sign-in link and confirm the connection. The Robyn consent screen identifies the client and callback host.
3. In a new **Work** chat, select **@Robyn**. Try “List my Robyn projects and find the saved spreadsheet in my project.” Ask for a specific Craft action to have ChatGPT call that application directly. Ask to delegate a job when you want Robyn to use its Studio AI allowance.
4. Revoke access under **Studio → Settings → MCP connections**, or visit `/oauth/connections` on your Studio.

[OpenAI’s custom MCP connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)

## Tools

| Tool | Operation |
| --- | --- |
| `list_projects`, `list_assets` | Find projects and saved native files, Notes, media and file collections by name and filters. Follow the returned cursor for more results. |
| `list_asset_revisions`, `open_asset_revision` | Inspect an exact immutable file package and dependencies. Request short-lived private download links explicitly with `includeDownloads`. |
| `list_crafts`, `run_<craft>` | Discover the 29 installed Craft tools and native formats. Start with `argv: ["--help"]` to see the installed application’s commands. |
| `get_craft_operation` | Read the outcome, native output and any confirmed revision for a direct Craft command. |
| `get_robyn_allowance`, `start_robyn_job`, `get_robyn_job` | Read the configured AI allowance, delegate work and inspect its status and outputs. Job admission also checks remaining headroom and provider funding. |

Direct calls run the installed Craft on the creator’s shared workstation in an isolated working copy with no network access. Commands work with exact saved inputs from the selected project. In an argument or a JSON value, a whole `$input0` string resolves to the first input’s working master. Supply ordered native argument arrays and optional text or JSON command files under `scripts/`. For example, use the appropriate native command to save into the working copy, then ask to publish its native master. Use `save.inputIndex` to continue the exact supplied base revision or `save.name` to create a new asset. The operation reports the immutable library revision after confirmation. A concurrent save preserves the conflicting revision for review. DashCraft opens exact files for read-only computation and has no library save field.

With a **$0 Studio AI allowance**, direct Craft calls and library access are available. Robyn job submission is blocked. Direct calls can use workstation compute and storage while running, including starting the creator’s workstation on first use.

Each direct operation accepts up to 12 exact input packages totaling 1 GiB and up to eight ordered commands. Its native processes have two minutes per command and three minutes across the batch. Use `returnFiles` to retrieve up to four small exports totaling 128 KiB as MCP resources. Writable Crafts can include larger exports in a confirmed library save through `save.derivedFiles`. Editor windows in Studio are separate from a direct operation’s working copy.

## Deploy and verify

1. Apply `0031_external_mcp_oauth.sql` and `0032_external_mcp_commands.sql` through the checked migration ledger. Keep the Studio origin and passwordless redirects configured through [setup](../SETUP.md).
2. Deploy the web source and its checksummed `vendor/robyn-mcp-workstation` artifact together. The release manifest names the direct worker, sandbox binary and supported applications. The worker is delivered server-side to the current verified Studio workstation image. Use the matching sources in the companion runtime repository when preparing a new worker release.
3. Set the server-only `ROBYN_MCP_RUNTIME_SECRET` to a fresh random 32-byte base64url value. The endpoint responds with OAuth discovery only on enabled deployments. Drain unsettled direct operations before rotating the secret.
4. Check the resource and authorization metadata at `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server`. Confirm that an unauthenticated `/mcp` request returns the OAuth challenge. Use a designated invited QA creator for connection and ownership checks.
5. Test `@Robyn` with a $0 allowance. Confirm job submission is rejected. Open an exact QA library revision, run an app command, publish an editable revision and reopen it in the native and browser editors. Check DashCraft’s read-only discovery and its exact-input computation. Verify all registered app help commands on the pinned workstation image before claiming hosted coverage.
6. With an approved positive QA allowance, start and poll one bounded Robyn job. Revoke the QA connection in Robyn and verify the old bearer and refresh tokens fail. Record web and companion source commits, applied migration suffix, native image, editor pins and direct worker fingerprint in the release acceptance record.

If dispatch acknowledgement is lost, reconnect with the original command, arguments and operation UUID. The worker either returns its saved receipt or reports an interrupted operation after confirming its previous process ended. Review any preserved revision before submitting new work. A pending operation holds the workspace’s shared slot until there is a terminal receipt. When the old workstation is unreachable, use [workstation recovery](OPERATIONS.md#shared-workstation-ownership-and-task-recovery) to establish the exact operation’s state before clearing the slot. Preserve its private working files and transfer receipts outside version control.

### Prepare a direct worker release

In the companion runtime checkout, build the pinned sandbox on Linux with `sh scripts/build-mcp-sandbox.sh`, then run `node scripts/build-direct-workstation.mjs` with Node 24. Copy the worker, sandbox and accompanying license and source notices from `build/external-mcp/` into the versioned vendor directory named by the generated `runtime-release.json`. Import that manifest into `src/studio/mcp/runtime-release.json` with the new vendor directory. Keep existing published directories and bytes immutable.
