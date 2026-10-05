# Host console

Host represents this Robyn deployment. Each workspace remains a tenant with its own members,
agents, and prepaid wallet. `/host` provides Overview, Tenants, and Configuration
views. It shows operational metadata and billing records; agent conversations and files stay
inside the tenant authorization boundary.

Host access is a row in `host_admins` for a verified Supabase session's user ID. The table and
Host SQL functions are service-role-only. Every Host page, read, and write checks permission;
removing the row revokes access on the next request. Host accounts land in `/host` and do not
automatically create a workspace. Workspace roles never grant Host access.

## Set up the dedicated account

Apply migrations and bootstrap using Doppler `dev` by default:

```sh
npm run setup -- --no-create --migrations-only
npm run host:bootstrap -- --email master@rgbknights.com
```

The bootstrap command needs Supabase runtime credentials and `NEXT_PUBLIC_SITE_URL` in
the runtime config, plus `SUPABASE_ACCESS_TOKEN` in its matching operations config.
`--url http://localhost:3000` can select the development application origin. Run the app
at that origin before accepting the invitation.

Bootstrap configures the Supabase invitation template to send a token hash to
`/auth/callback`. Free-tier projects with the default email provider prohibit template edits;
there it uses Supabase's standard invitation and `/auth/invite`, which clears the URL fragment,
establishes the browser session, and verifies the user before opening the password page.
Bootstrap creates the account with `inviteUserByEmail` and grants the returned user
ID Host permission. The email lets the recipient choose a password and continue to Host.
The command never prints a password or invitation token. Supabase SMTP and its email limits
must permit delivery to the recipient. Completed bootstrap runs send no further invitation.

If an existing account has no Host permission, bootstrap stops. After reviewing its identity
in Supabase, an operator can explicitly resume with `--reviewed-user-id <uuid>`. This also
recovers an invitation whose permission insert failed. The UUID must match the requested
email; the command does not reset credentials or send another email in this mode.

Production requires explicit selection for both commands:

```sh
npm run setup -- --config prd --no-create --migrations-only
npm run host:bootstrap -- --config prd --email master@rgbknights.com
```

Apply the migration before deploying the application code, then bootstrap when the configured
origin serves the new callback/password flow. Host permissions are local to each Supabase
project. The existing signup and password-recovery flows remain available.

## Reading the console

Lists contain 50 entries per page; SQL computes counts without PostgREST's row limit. Search
matches a workspace name, ID, or owner email. Tenant details independently paginate members,
agent metadata, and ledger entries. Reads send `Cache-Control: private, no-store`.

## Workspace controls

Apply `0008_host_workspace_controls.sql` before using the controls. Each workspace defaults
to an agent limit of **1**, including existing workspaces. Host can set an integer limit from
0 through 1,000 in tenant details, which also shows that workspace's agent list. A lower limit
keeps existing agents and creations already reserved; it blocks further creation. Stopped and
failed agents continue to count until deleted. Only Host can change the limit; workspace roles
do not grant this permission.

Tenant administrators see their agent count and limit. Both creation buttons are disabled
when capacity is full, the wallet balance is zero or negative, or capacity/wallet data is
unavailable. The server also checks these conditions and reserves a slot under a database
lock before calling Agent37, so concurrent requests cannot claim the same available slot.
Successful creation atomically adds the agent mirror and releases the reservation. Confirmed
failures release it; an uncertain upstream result retains the slot for operator review.
The upstream metadata `app_creation` identifies that reservation. If a creation is unconfirmed,
verify its upstream outcome before completing its mirror or removing the service-role reservation;
never release it while the agent may still exist or the request may still be running.

Host can create a coupon with **$0.01–$10,000** of USD credit for a workspace. The code is shown
on creation for copying, expires after 30 days, and can be redeemed only once by that workspace's
admin in Billing. Creating it does not credit the wallet; redemption atomically adds the specified
amount and records a coupon ledger entry. Only the hash is stored, and Host issuance records its
creator. Concurrent redemption attempts still grant credit once. The existing trusted terminal
issuance command remains available.

Agent status and resources come from the database mirror. Opening or refreshing Host never
contacts agents, settles usage, charges cards, or provisions resources. Usage reconciliation
shows a UTC date; an older or absent date is flagged, but a current date does not prove the
five-minute scheduler is healthy. Unfinished automatic payments older than 23 hours are flagged
for review. Missing wallets appear as unavailable and are excluded from the recorded balance
total; if all tenant wallets are missing, the total is unavailable. Negative balances remain visible.

Configuration reports code defaults and credential presence, not service health. The signup
policy is the application's setup policy, not a live query of Supabase auth configuration.
Branding stays in code and credentials stay in Doppler. Other tenant writes, editable configuration,
suspension, impersonation, and content access remain outside this version.
