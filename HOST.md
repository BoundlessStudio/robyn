# Host console

Host represents this Robyn deployment. Each workspace remains a tenant with its own members,
agents, and prepaid wallet. `/host` provides Overview, Tenants, and Configuration
views. It shows operational metadata and billing records; agent conversations and files stay
inside the tenant authorization boundary.

Host access is a row in `host_admins` for a verified Supabase session's user ID. The table and
Host SQL functions are service-role-only. Every Host page, read, and write checks permission;
removing the row revokes access on the next request. Host accounts land in `/host` and do not
automatically create a workspace. Workspace roles never grant Host access.

## Assign Host automatically

Apply the migrations before allowing signups:

```sh
npm run setup -- --no-create --migrations-only
# Production must be selected explicitly:
npm run setup -- --config prd --no-create --migrations-only
```

On a fresh installation, the first normal email signup receives Host permission in
that same database transaction and lands in `/host`. No particular email address,
invitation, or separate bootstrap command is required. Later signups receive the
usual tenant workspace. Invited and anonymous accounts do not claim this assignment.

`0010_first_signup_host.sql` uses a singleton claim to choose one Host even when
signups overlap. A failed signup rolls back its claim. The claim remains after
permission revocation or account deletion, so later users cannot take over Host.
Replaying migrations does not restore revoked access. The browser cannot read or
modify the claim, and user metadata cannot grant permission.

Existing installations retain their Host grants. When users exist without a Host,
the migration assigns the earliest normal email signup, ordered by creation time
and user ID. Automatic assignment runs once per Supabase project, so development,
preview, and production share a Host when they use the same project. Any later
permission recovery or transfer requires an explicit operator change in the
database; a new signup never performs that transfer.

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

Apply `0009_host_workspace_credit.sql` before using **Add credit** in tenant details. Host can
add **$0.01–$10,000** of USD credit directly to a workspace balance. Each grant atomically
updates the wallet and records a credit ledger entry with the Host user's ID. Retrying the same
request grants credit once. Workspace roles cannot grant credit. Coupon issuance and redemption
have been retired; historical coupon records and ledger entries remain available for audit.

Agent status and resources come from the database mirror. Opening or refreshing Host never
contacts agents, settles usage, charges cards, or provisions resources. Usage reconciliation
shows a UTC date; an older or absent date is flagged, but a current date does not prove the
five-minute scheduler is healthy. Unfinished automatic payments older than 23 hours are flagged
for review. Missing wallets appear as unavailable and are excluded from the recorded balance
total; if all tenant wallets are missing, the total is unavailable. Negative balances remain visible.

Configuration reports code defaults and credential presence, not service health. The signup
policy is the application's setup policy, not a live query of Supabase auth configuration.
Branding stays in code and credentials stay in local files and Vercel environment settings. Other tenant writes, editable configuration,
suspension, impersonation, and content access remain outside this version.
