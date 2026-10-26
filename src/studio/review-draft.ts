export type ReviewDecision = "approved" | "changes_requested";
export interface ReviewDraft { feedback: string; pending: { requestId: string; decision: ReviewDecision; feedback: string } | null }
export type ReviewDrafts = Record<string, ReviewDraft>;
export const reviewDraftKey = (projectId: string) => `robyn-review-drafts:${projectId}`;
const uuid = (value: unknown) => typeof value === "string" && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
export function readReviewDrafts(storage: Pick<Storage,"getItem">, projectId: string): ReviewDrafts {
  const raw = storage.getItem(reviewDraftKey(projectId));
  if (raw === null) return {};
  const drafts = JSON.parse(raw) as ReviewDrafts;
  if (!drafts || typeof drafts !== "object" || Array.isArray(drafts)) throw Error("Invalid saved reviews");
  for (const [job, draft] of Object.entries(drafts)) {
    if (!uuid(job) || !draft || typeof draft.feedback !== "string" || draft.feedback.length > 10000) throw Error("Invalid saved review");
    const pending = draft.pending;
    if (pending !== null && (!pending || !uuid(pending.requestId) || !["approved","changes_requested"].includes(pending.decision)
      || typeof pending.feedback !== "string" || pending.feedback.length > 10000 || pending.feedback !== draft.feedback)) throw Error("Invalid saved review request");
  }
  return drafts;
}
export function saveReviewDrafts(storage: Pick<Storage,"setItem">, projectId: string, drafts: ReviewDrafts) {
  storage.setItem(reviewDraftKey(projectId),JSON.stringify(drafts));
}
