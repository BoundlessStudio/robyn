import "server-only";
import type { DB } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { assignmentMailbox, ownedMailWorkstation, requireActiveMailConnection } from "./connected-mail-server";
import { type EmployeeScope, employeeDbFailure } from "./employee-auth";
import { id } from "./server";

type MailToolAuth = { db: DB; tokenHash: string; scope: EmployeeScope };
type MailTool = "studio_mail_access" | "studio_mail_reserve_draft" | "studio_mail_finish_draft";

export async function employeeMailTool(
  { db, tokenHash, scope }: MailToolAuth, name: MailTool, args: Record<string, unknown>,
) {
  if (scope.kind !== "robyn") throw new ApiError(403, "mail_access_denied", "This assignment has no connected mailbox.");
  let mailbox;
  if (name !== "studio_mail_finish_draft") {
    mailbox = await assignmentMailbox(db, scope.workspaceId, scope.assignmentId);
    const instance = mailbox && mailbox.instanceId === scope.instanceId
      ? await ownedMailWorkstation(db, scope.workspaceId)
      : null;
    if (!mailbox || instance?.id !== mailbox.instanceId) {
      throw new ApiError(403, "mail_access_denied", "This assignment has no connected mailbox.");
    }
    const connection = await requireActiveMailConnection(instance.id, mailbox.connectionId);
    if (connection.provider !== mailbox.provider) {
      throw new ApiError(409, "mail_connection_changed", "This assignment’s mailbox changed. Check Connected mail in Studio settings.");
    }
    if (name === "studio_mail_access") {
      // Ownership and the provider list are checked over the network. Recheck
      // the assignment fence after those reads before granting access.
      const { data, error } = await db.rpc("studio_employee_scope", { p_hash: tokenHash });
      employeeDbFailure(error);
      if (data?.assignmentId !== scope.assignmentId || data.instanceId !== scope.instanceId || data.generation !== scope.generation) {
        throw new ApiError(401, "employee_access_denied", "This assignment credential has expired or been revoked.");
      }
      return mailbox;
    }
  }
  if (scope.startMode === "plan") {
    throw new ApiError(409, "planning_only", "Creating a mail draft requires a first draft brief.");
  }
  const p_operation = id(args.operationId, "draft operation ID");
  if (name === "studio_mail_reserve_draft") {
    if (typeof args.requestHash !== "string" || !/^[a-f0-9]{64}$/.test(args.requestHash)) {
      throw new ApiError(400, "invalid_draft_request", "A draft request fingerprint is required.");
    }
    const { data, error } = await db.rpc("reserve_studio_mail_draft", { p_hash: tokenHash, p_operation, p_request_hash: args.requestHash });
    employeeDbFailure(error);
    return { ...data, mailbox };
  }
  const { state, draftId } = args;
  if (!(state === "saved" && typeof draftId === "string" && /^[A-Za-z0-9+/_=-]{1,512}$/.test(draftId))
    && !(state === "rejected" && draftId === null)) {
    throw new ApiError(400, "invalid_draft_receipt", "A confirmed mail draft receipt is required.");
  }
  const { data, error } = await db.rpc("finish_studio_mail_draft", { p_hash: tokenHash, p_operation, p_state: state, p_draft_id: draftId });
  employeeDbFailure(error);
  return data;
}
