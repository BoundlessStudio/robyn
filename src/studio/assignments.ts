import type { AssetRef } from "./assets";

export type AssignmentState = "queued" | "running" | "cancelling" | "cancelled" | "awaiting_review" | "completed" | "failed";
export interface Assignment {
  id: string; workspace_id: string; project_id: string; employee_id: string;
  request_key: string; brief: string; state: AssignmentState; created_by: string;
  workflow_id: string | null; run_attempt: string | null; session_id: string | null; response_id: string | null;
  dispatch_state: "idle" | "dispatching" | "dispatched" | "uncertain" | "finished";
  dispatch_started_at: string | null; terminal_history_at: string | null;
  employee_generation: number | null;
  browser_paused?: boolean;
  budget_paused?: boolean;
  budget_turns?: Array<{sessionId:string;responseId:string;pausedAt:string}>;
  browser_turns?: Array<{sessionId:string;responseId:string|null;returnedAt:string;controlId:string}>;
  result_text: string | null; error_code: string | null;
  purpose: "independent" | "campaign_step" | "campaign_final";
  created_at: string; started_at: string | null; finished_at: string | null;
}
export interface StudioEmployee {
  id: string; workspace_id: string; employee_key: string; kind: "director" | "specialist";
  app_id: string | null; role: string; instructions: string;
  instance_id: string | null; provision_state: "unprovisioned" | "provisioning" | "ready" | "failed";
  provision_attempt: string | null; provision_create_started_at: string | null; provision_error: string | null;
  browser_control?: "agent" | "requesting" | "human";
  browser_control_id?: string | null;
  browser_assignment_id?: string | null;
  monthly_cap_micros?: number;
}
export interface AssignmentIdentity { workspaceId: string; userId: string; assignmentId: string }
export interface AssignmentFence extends AssignmentIdentity { workflowId: string; attemptId: string }
export interface AssignmentSummary {
  id: string; employeeId: string; role: string; appId: string | null; brief: string; state: AssignmentState;
  result: string | null; errorCode: string | null; createdAt: string; finishedAt: string | null;
  recovering: boolean; deliverables: Array<AssetRef & { name: string; state: "committed" | "conflict" }>;
  browserPaused?: boolean;
  reviewDecision?: "approved" | "changes_requested" | null;
  purpose?: Assignment["purpose"];
  campaign?: {id:string;state:import("./campaigns").CampaignState;steps:number;finishedSteps:number} | null;
}
export const assignmentIsActive = (a: Pick<Assignment, "state">) => ["queued", "running", "cancelling"].includes(a.state);
export const assignmentMarker = (id: string) => `[Robyn assignment ${id}]`;
