# External MCP

Robyn exposes the private Studio at `https://robyn.academy/mcp` when the production deployment enables the endpoint. Other deployments use their configured HTTPS Studio origin followed by `/mcp`. The endpoint uses stateless Streamable HTTP and OAuth authorization code with S256 PKCE. Creators use their existing invitation-only email sign-in and approve the connection on Robyn.

## Connect ChatGPT

On the Robyn Projects page, open **Studio settings → External MCP**. The same section is available in each project's **Settings**. In [ChatGPT web](https://chatgpt.com/plugins), open **Plugins**, select **+**, then choose **Add custom MCP server**. Keep Robyn open so you can copy each value as you need it.

| ChatGPT field | What to enter |
| --- | --- |
| **Icon** (optional) | Select **Download icon** in Robyn, then upload the PNG using **+** in ChatGPT. |
| **Name** | Select **Copy name** and paste **Robyn**. |
| **Description** (optional) | Select **Copy description** and paste the suggested text. |
| **Connection** | Choose **Server URL**, select **Copy server URL** in Robyn, then paste the address. |
| **Authentication** | Choose **OAuth**. |
| **Advanced OAuth settings** | Use the discovered settings. If prompted for a client setup method, choose **Dynamic Client Registration**. |

1. Review the warning, select **I understand and want to continue**, then select **Create as a plugin**.
2. Choose **Connect Robyn**. If asked to sign in, use the email from your Robyn invitation and open the sign-in link. Approve the connection in Robyn after checking the client and callback host.
3. In a new **Work** chat, select **@Robyn**. Try “List my Robyn projects and find the saved spreadsheet in my project.” Ask for a specific Craft action to have ChatGPT call that application directly. Ask to delegate a job when you want Robyn to use its Studio AI allowance.

Review or revoke access under **Settings → External MCP → Manage MCP connections**, or visit `/oauth/connections` on your Studio.

[OpenAI’s custom MCP connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)

## Tools

| Tool | Operation |
| --- | --- |
| `list_projects`, `get_project` | Find projects and read a project's name, brief, status and timestamps. |
| `create_project`, `update_project` | Create an active project or edit its name and brief. |
| `list_assets`, `search_library` | Find saved native files, Notes, media and collections. Search by literal name across active and archived projects with `search_library`. Each match gives the project and exact current revision. |
| `import_assets` | Save an original attachment or a named collection and return its confirmed revision. |
| `rename_asset` | Edit the library display name while preserving the original filenames. |
| `download_asset` | Get one private download link for an original file in an exact revision. Supply a path when choosing from a collection. |
| `list_asset_revisions`, `open_asset_revision` | Inspect an exact immutable file package and dependencies. Request short-lived private download links explicitly with `includeDownloads`. |
| `list_crafts`, `run_<craft>` | Discover the 29 installed Craft tools and native formats. Start with `argv: ["--help"]` to see the installed application’s commands. |
| `list_craft_operations`, `get_craft_operation` | Recover operation IDs for this connection and read native output and confirmed revision receipts. |
| `get_robyn_allowance`, `start_robyn_job` | Read the configured AI allowance and delegate work. Job admission also checks remaining headroom and provider funding. |
| `list_robyn_jobs`, `get_robyn_job`, `cancel_robyn_job` | Find jobs started in Studio or through MCP, read their results, and stop a job by its project and assignment IDs. |

For paginated tools, pass the returned `nextCursor` as `cursor` with the same filters. To recover an interrupted project creation, repeat `create_project` with the same `creationId` UUID and arguments. For `update_project`, pass the `updatedAt` from `get_project` as `expectedUpdatedAt` and supply the fields you want to change. An empty brief clears it. Read the project again if the timestamp is stale or the update response is interrupted. Archive and reactivate projects in Studio settings.

A queued job can stop immediately. If `cancel_robyn_job` returns `cancelling`, poll `get_robyn_job` until the stop settles. Confirmed files stay in the library.

Use `import_assets` with ChatGPT file inputs. It accepts up to 20 attachments totaling 32 MiB per call. A single PNG, JPEG, GIF or WebP opens as an image in Assets and preserves its original bytes for Craft placement. Use one call per image to get separate image assets, or supply a name to save multiple attachments in one file collection. ChatGPT must pass an actual file input for a generated image. If needed, save the generated image from ChatGPT Images and attach it to the chat. Retry an interrupted import with the same `creationId` and file inputs. Download links expire after five minutes. [ChatGPT file inputs](https://developers.openai.com/plugins/reference#define-file-inputs) · [ChatGPT Images](https://help.openai.com/en/articles/11084440-chatgpt-image-libraryopenai)

Direct calls run the installed Craft on the creator’s shared workstation in an isolated working copy with no network access. Commands work with exact saved inputs from the selected project. In an argument or a JSON value, a whole `$input0` string resolves to the first input’s working master. Supply ordered native argument arrays and optional text or JSON command files under `scripts/`. For example, use the appropriate native command to save into the working copy, then ask to publish its native master. Use `save.inputIndex` to continue the exact supplied base revision or `save.name` to create a new asset. The operation reports the immutable library revision after confirmation. A concurrent save preserves the conflicting revision for review. DashCraft opens exact files for read-only computation and has no library save field.

With a **$0 Studio AI allowance**, project tools, library access, direct Craft calls, job history and cancellation are available. Robyn job submission is blocked. Direct calls can use workstation compute and storage while running, including starting the creator’s workstation on first use.

Each direct operation accepts up to 12 exact input packages totaling 1 GiB and up to eight ordered commands. Its native processes have two minutes per command and three minutes across the batch. Use `returnFiles` to retrieve up to four small exports totaling 128 KiB as MCP resources. Writable Crafts can include larger exports in a confirmed library save through `save.derivedFiles`. Editor windows in Studio are separate from a direct operation’s working copy.

## Deploy and verify

For the pilot rollout of the expanded catalog, collect any pending Craft receipts, remove the earlier connection in ChatGPT, and revoke its grant if it still appears under **MCP connections** in Studio. Reconnect after deployment to approve the expanded tools. Each grant has its own Craft operation history.

1. Apply the migrations through `0034_external_mcp_asset_tools.sql` using the checked migration ledger. Keep the Studio origin and passwordless redirects configured through [setup](../SETUP.md).
2. Deploy the web source and its checksummed `vendor/robyn-mcp-workstation` artifact together. The release manifest names the direct worker, sandbox binary and supported applications. The worker is delivered server-side to the current verified Studio workstation image. Use the matching sources in the companion runtime repository when preparing a new worker release.
3. Set the server-only `ROBYN_MCP_RUNTIME_SECRET` to a fresh random 32-byte base64url value. The endpoint responds with OAuth discovery only on enabled deployments. Drain unsettled direct operations before rotating the secret.
4. Check the resource and authorization metadata at `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server`. Confirm that an unauthenticated `/mcp` request returns the OAuth challenge. Use a designated invited QA creator for connection and ownership checks.
5. Connect `@Robyn`, verify the consent and 48-tool catalog, and test with a $0 allowance. Create and edit a QA project. Import an uploaded image and a generated image passed as a file input. Confirm the images preview in Studio, rename one, and compare the original download bytes and filename. Search across projects and confirm job submission is rejected. Open an exact QA library revision and run an app command that publishes an editable revision. Find the operation with `list_craft_operations`, then reopen the saved revision in the native and browser editors. Check DashCraft’s read-only discovery and its exact-input computation. Verify all registered app help commands on the pinned workstation image before claiming hosted coverage.
6. With an approved positive QA allowance, start one bounded Robyn job, find it with `list_robyn_jobs`, and cancel it while running. Poll until cancellation is confirmed and check that any confirmed files remain available. Revoke the QA connection in Robyn and verify the old bearer and refresh tokens fail. Record web and companion source commits, applied migration suffix, native image, editor pins and direct worker fingerprint in the release acceptance record.

If dispatch acknowledgement is lost, reconnect with the original command, arguments and operation UUID. The worker either returns its saved receipt or reports an interrupted operation after confirming its previous process ended. Review any preserved revision before submitting new work. A pending operation holds the workspace’s shared slot until there is a terminal receipt. When the old workstation is unreachable, use [workstation recovery](OPERATIONS.md#shared-workstation-ownership-and-task-recovery) to establish the exact operation’s state before clearing the slot. Preserve its private working files and transfer receipts outside version control.

### Prepare a direct worker release

In the companion runtime checkout, build the pinned sandbox on Linux with `sh scripts/build-mcp-sandbox.sh`, then run `node scripts/build-direct-workstation.mjs` with Node 24. Copy the worker, sandbox and accompanying license and source notices from `build/external-mcp/` into the versioned vendor directory named by the generated `runtime-release.json`. Import that manifest into `src/studio/mcp/runtime-release.json` with the new vendor directory. Keep existing published directories and bytes immutable.
