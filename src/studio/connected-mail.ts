export const mailProviders = {
  gmail: { name: "Gmail", draftsUrl: "https://mail.google.com/mail/#drafts" },
  outlook: { name: "Microsoft 365", draftsUrl: "https://outlook.office.com/mail/drafts" },
} as const;

export type MailProvider = keyof typeof mailProviders;

export function isMailProvider(value: unknown): value is MailProvider {
  return value === "gmail" || value === "outlook";
}

export function isMailConnectionId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

export type MailConnection = {
  id: string;
  provider: MailProvider;
  status: "active" | "pending" | "unavailable";
};

export type MailConnectionList = { workstationReady: boolean; connections: MailConnection[] };

export function hasActiveMailbox(connections: readonly MailConnection[]) {
  return connections.some(connection => connection.status === "active" && isMailProvider(connection.provider));
}

export const MAILCRAFT_LOCKED = "Connect Gmail or Microsoft 365 in Profile to open MailCraft.";

export type AssignmentMailbox = { connectionId: string; instanceId: string; provider: MailProvider };

export function mailConnectionLabel(connection: Pick<MailConnection, "id" | "provider">) {
  return `${mailProviders[connection.provider].name} · ${connection.id.slice(-8)}`;
}
