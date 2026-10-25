export type WorkflowKind = "assignment" | "campaign" | "media";
export function retryDelay(failures: number) { return Math.min(900, 15 * 2 ** Math.min(6,Math.max(0,failures-1))); }
export function workflowFailure(error: unknown) {
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
  return status===403||status===401 ? "authorization_changed" : status===404 ? "resource_missing" : status>=500 ? "platform_unavailable" : "workflow_step_failed";
}
export function workflowNeedsAttention(row: {consecutive_failures:number;last_state:string;last_progress_at:string;fingerprint?:{budgetPaused?:boolean;error?:string}}, now=Date.now()) {
  if(["payment_outcome_unknown","payment_workstation_missing"].includes(row.fingerprint?.error??""))return true;
  if(row.consecutive_failures>=5||["uncertain","failed"].includes(row.last_state))return true;
  return !row.fingerprint?.budgetPaused && !["waiting_budget","waiting_capacity","completed","cancelled","awaiting_review"].includes(row.last_state) && now-Date.parse(row.last_progress_at)>30*60_000;
}
