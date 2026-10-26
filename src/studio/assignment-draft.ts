import type { AssetRef } from "./assets";

export interface PendingAssignment {
  projectId: string;
  employeeId: string;
  brief: string;
  inputs: AssetRef[];
  requestId: string;
}
export interface AssignmentDraft {
  version: 1;
  brief: string;
  employeeId: string;
  includeOpen: boolean;
  pending: PendingAssignment | null;
}
export const emptyAssignmentDraft = (): AssignmentDraft => ({ version: 1, brief: "", employeeId: "", includeOpen: true, pending: null });
export const assignmentDraftKey = (projectId: string, mode: string) => `robyn-assignment-draft:${projectId}:${mode}`;
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function readAssignmentDraft(storage: Pick<Storage, "getItem">, projectId: string, mode: string): AssignmentDraft {
  const raw = storage.getItem(assignmentDraftKey(projectId, mode));
  if (raw === null) return { ...emptyAssignmentDraft(), brief: storage.getItem(`robyn-brief:${projectId}:${mode}`) ?? "" };
  const draft = JSON.parse(raw) as AssignmentDraft;
  if (!draft || draft.version !== 1 || typeof draft.brief !== "string" || typeof draft.employeeId !== "string" || typeof draft.includeOpen !== "boolean"
    || draft.pending === undefined) throw new Error("Invalid saved assignment draft");
  const request = draft.pending;
  if (request !== null && (typeof request !== "object" || request.projectId !== projectId || !uuid(request.requestId) || !uuid(request.employeeId)
    || typeof request.brief !== "string" || !request.brief.trim() || !Array.isArray(request.inputs) || request.inputs.length > 100
    || request.inputs.some(ref => !ref || !uuid(ref.assetId) || !uuid(ref.revisionId)))) throw new Error("Invalid saved assignment request");
  // The frozen payload is authoritative, even if another editor is now open.
  return request ? { ...draft, brief: request.brief, employeeId: request.employeeId, includeOpen: request.inputs.length > 0 } : draft;
}

export function saveAssignmentDraft(storage: Pick<Storage, "setItem">, projectId: string, mode: string, draft: AssignmentDraft) {
  // Keep a cleared journal after acknowledgement. Removing it would resurrect
  // the old text-only draft on reload (or after an interrupted cleanup).
  storage.setItem(assignmentDraftKey(projectId, mode), JSON.stringify(draft));
}

export function acknowledgeAssignmentDraft(storage: Pick<Storage, "getItem" | "setItem">, projectId: string, mode: string, requestId: string): AssignmentDraft {
  const current = readAssignmentDraft(storage, projectId, mode);
  // An older mounted panel's late acknowledgement must not erase a newer brief.
  if (current.pending?.requestId !== requestId) return current;
  const cleared = { ...current, brief: "", pending: null };
  saveAssignmentDraft(storage, projectId, mode, cleared);
  return cleared;
}
