export type BetaStatus = "requested" | "invited" | "joined" | "declined";
export type BetaAction = "invite" | "resend" | "decline" | "reopen" | "check";
export interface BetaRequest {
  id: string; email: string; craft: string; consent_version: string; status: BetaStatus;
  created_at: string; updated_at: string; invited_at: string | null; last_invited_at: string | null;
  invite_count: number; joined_at: string | null; send_state: "idle" | "sending" | "sent" | "failed" | "uncertain";
}
export interface BetaRequestList { requests: BetaRequest[]; total: number; counts: Record<BetaStatus, number> }
export const betaStatuses: BetaStatus[] = ["requested", "invited", "joined", "declined"];
