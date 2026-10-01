import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { agent37 } from "@/lib/agent37";
import type { DB } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { inkbox, inkboxConfigured, InkboxError } from "@/lib/inkbox";
import { bootstrapConfigured, INKBOX_PORT, inkboxInstallCommand } from "@/lib/inkbox-setup";
import type { InkboxIdentityView } from "@/lib/inkbox-types";
import type { AgentRow } from "@/lib/types";

interface IdentityRow {
  agent37_id: string;
  handle: string;
  identity_id: string | null;
  email_address: string | null;
  owner_email: string;
  allowed_phone: string | null;
  plugin_installed: boolean;
  restart_pending: boolean;
  status: "pending" | "provisioning" | "ready" | "error";
  step: string;
  last_error: string | null;
  lease_token: string | null;
  lease_until: string;
}

const TABLE = "agent_inkbox_identities";
const LEASE_MS = 6 * 60_000;

export async function getInkboxRow(db: DB, id: string): Promise<IdentityRow | null> {
  const { data, error } = await db.from(TABLE).select("*").eq("agent37_id", id).maybeSingle();
  if (error) throw new ApiError(500, "db_error", "Could not read the agent identity.");
  return data as IdentityRow | null;
}

export async function queueInkboxIdentity(db: DB, id: string, ownerEmail: string): Promise<void> {
  const { error } = await db.from(TABLE).upsert({
    agent37_id: id,
    handle: `robyn-${createHash("md5").update(id).digest("hex").slice(0, 24)}`,
    owner_email: ownerEmail,
  }, { onConflict: "agent37_id", ignoreDuplicates: true });
  if (error) throw new ApiError(500, "db_error", "Could not queue the agent identity.");
}

async function claim(db: DB, id: string): Promise<IdentityRow | null> {
  const now = new Date();
  const { data, error } = await db.from(TABLE).update({
    lease_token: randomUUID(), lease_until: new Date(now.getTime() + LEASE_MS).toISOString(),
  }).eq("agent37_id", id).lt("lease_until", now.toISOString()).select("*").maybeSingle();
  if (error) throw new ApiError(500, "db_error", "Could not reserve the agent identity.");
  return data as IdentityRow | null;
}

async function save(db: DB, row: IdentityRow, changes: Partial<IdentityRow>): Promise<void> {
  const { data, error } = await db.from(TABLE).update({ ...changes, updated_at: new Date().toISOString() })
    .eq("agent37_id", row.agent37_id).eq("lease_token", row.lease_token).select("agent37_id").maybeSingle();
  if (error || !data) throw new ApiError(500, "db_error", "Could not save the agent identity setup.");
  Object.assign(row, changes);
}

async function waitHealthy(id: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try { if ((await agent37.getHealth(id)).healthy) return; } catch { /* gateway still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new ApiError(504, "agent_starting", "Hermes is still starting. Retry identity setup when the agent is running.");
}

// The lease is claimed before registering after(), so duplicate requests cannot install twice.
// Every successful stage is persisted; retries reuse the identity and an already installed plugin.
export async function beginInkboxSetup(db: DB, id: string, phone?: string | null): Promise<IdentityRow> {
  if (!inkboxConfigured()) throw new ApiError(503, "inkbox_not_configured", "The operator must add INKBOX_ADMIN_KEY.");
  const row = await claim(db, id);
  if (!row) throw new ApiError(409, "identity_busy", "Identity setup is already running. Try again shortly.");
  try {
    await save(db, row, { status: "provisioning", last_error: null, step: "Preparing identity", ...(phone !== undefined ? { allowed_phone: phone } : {}) });
    return row;
  } catch (error) {
    await save(db, row, { lease_until: new Date(0).toISOString() }).catch(() => {});
    throw error;
  }
}

export async function runInkboxSetup(db: DB, row: IdentityRow, displayName: string): Promise<void> {
  try {
    const id = row.agent37_id;
    await save(db, row, { step: "Creating inbox and iMessage identity" });
    // Resolve by a handle saved before creation to recover a lost create response without duplicates.
    let identity;
    try { identity = await inkbox.getIdentity(row.handle); } catch (error) {
      if (!(error instanceof InkboxError && error.upstreamStatus === 404)) throw error;
    }
    identity ??= await inkbox.createIdentity(row.handle, displayName);
    // Close access BEFORE installing the conversation plugin or publishing its webhook.
    await inkbox.restrictIdentity(row.handle);
    await save(db, row, { identity_id: identity.id, email_address: identity.email_address, step: "Setting contact permissions" });
    await inkbox.allowContact(row.handle, "email", row.owner_email);
    if (row.allowed_phone) await inkbox.allowContact(row.handle, "phone", row.allowed_phone);
    // Reconcile from Inkbox rather than relying on a local rule ID: safe after any interrupted update.
    const rules = await inkbox.listPhoneRules(row.handle);
    for (const rule of rules) {
      if (rule.action === "allow" && rule.match_target !== row.allowed_phone) {
        try { await inkbox.deletePhoneRule(row.handle, rule.id); } catch (error) {
          if (!(error instanceof InkboxError && error.upstreamStatus === 404)) throw error;
        }
      }
    }

    if (!row.plugin_installed) {
      await save(db, row, { step: "Installing Inkbox conversations and voice support" });
      await waitHealthy(id);
      const live = await agent37.getAgent(id);
      const port = live.public_ports?.find((entry) => entry.port === INKBOX_PORT)
        ?? await agent37.createPublicPort(id, INKBOX_PORT, "inkbox");
      const minted = await inkbox.mintKey(identity.id, row.handle);
      try {
        const result = await agent37.exec(id, inkboxInstallCommand(row.handle, port.url, minted.api_key));
        if (!bootstrapConfigured(result)) {
          throw new ApiError(502, "inkbox_plugin_setup", "Inkbox plugin setup needs attention. Run hermes inkbox doctor in this agent’s terminal, then retry.");
        }
      } catch (error) {
        await inkbox.revokeKey(minted.api_key).catch(() => {});
        throw error;
      }
      // A lost database response must not revoke a key that bootstrap has already installed.
      // Retrying after this save fails is safe: the persisted handle still owns the same identity.
      await save(db, row, { plugin_installed: true, restart_pending: true });
    }
    if (row.restart_pending) {
      await save(db, row, { step: "Starting Inkbox conversations" });
      await agent37.restart(id);
      await waitHealthy(id);
      await save(db, row, { restart_pending: false });
    }
    await save(db, row, { status: "ready", step: "Identity ready", last_error: null, lease_until: new Date(0).toISOString() });
  } catch (error) {
    // Never persist exec output or unfiltered upstream errors; they may include a scoped key.
    const message = error instanceof ApiError ? error.message : "Identity setup was interrupted. Please retry.";
    await save(db, row, { status: "error", last_error: message, lease_until: new Date(0).toISOString() }).catch(() => {});
    console.error("Inkbox setup failed", { agentId: row.agent37_id, step: row.step });
  }
}

export async function inkboxIdentityView(db: DB, agent: AgentRow): Promise<InkboxIdentityView> {
  const supported = agent.template === "agent37-hermes";
  const configured = inkboxConfigured();
  const row = supported ? await getInkboxRow(db, agent.agent37_id) : null;
  const connect = row?.status === "ready" && row.identity_id && row.allowed_phone && configured
    ? await inkbox.connectInfo(row.identity_id) : null;
  return {
    supported, configured,
    identity: row ? {
      handle: row.handle, email: row.email_address, ownerEmail: row.owner_email, allowedPhone: row.allowed_phone,
      status: row.status, step: row.step, error: row.last_error,
      retryable: new Date(row.lease_until).getTime() < Date.now(),
    } : null,
    connect,
  };
}

export async function deleteInkboxIdentity(db: DB, id: string, removeAgent: () => Promise<void>): Promise<void> {
  if (!(await getInkboxRow(db, id))) { await removeAgent(); return; }
  const row = await claim(db, id);
  if (!row) throw new ApiError(409, "identity_busy", "Wait for identity setup to finish before deleting this agent.");
  try {
    // Deleting the identity also revokes every scoped key and removes its mailbox and subscriptions.
    try { await inkbox.deleteIdentity(row.handle); } catch (error) {
      if (!(error instanceof InkboxError && error.upstreamStatus === 404)) throw error;
    }
    // Keep the lease through mirror deletion, preventing a concurrent retry from recreating it.
    await removeAgent();
  } catch (error) {
    await save(db, row, { lease_until: new Date(0).toISOString() }).catch(() => {});
    throw error;
  }
}
