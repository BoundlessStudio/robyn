import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DB } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { dbFailure } from "./server";

export interface EmployeeScope {
  workspaceId: string; projectId: string; assignmentId: string; employeeId: string;
  appId: string | null; kind: "director" | "specialist"; userId: string;
  instanceId: string; brief: string; role: string;
}
export function employeeDbFailure(error: {message:string;code?:string} | null) {
  if (error?.message.includes("employee access denied")) throw new ApiError(401,"employee_access_denied","This assignment credential has expired or been revoked.");
  if (error?.message.includes("operation key reused")) throw new ApiError(409,"operation_key_reused","Use the same operation ID only when retrying the same request.");
  if (error?.message.includes("campaign already planned")) throw new ApiError(409,"campaign_already_planned","This assignment already has a saved plan. Read studio_context to see it; do not submit a different plan.");
  dbFailure(error);
}
export const hashEmployeeToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function requireEmployee(request: Request) {
  const origin=request.headers.get("origin");
  const site=process.env.NEXT_PUBLIC_SITE_URL;
  if (origin && (!site || origin!==new URL(site).origin)) throw new ApiError(403,"origin_mismatch","Invalid employee request origin.");
  const match=/^Bearer (rbs_[A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization")??"");
  if (!match) throw new ApiError(401,"employee_access_denied","An assignment credential is required.");
  const tokenHash=hashEmployeeToken(match[1]); const db=createAdminClient();
  const {data,error}=await db.rpc("studio_employee_scope",{p_hash:tokenHash});
  employeeDbFailure(error);
  if (!data) throw new ApiError(401,"employee_access_denied","This assignment credential is unavailable.");
  return {db,tokenHash,scope:data as EmployeeScope};
}

/** Trusted provisioning delivers this token only to its assigned workstation.
 * Never include it in a browser response, log, workflow output, or DB row. */
export async function issueEmployeeToken(db:DB, assignmentId:string, instanceId:string) {
  const token=`rbs_${randomBytes(32).toString("base64url")}`;
  const {error}=await db.from("studio_employee_tokens").insert({assignment_id:assignmentId,instance_id:instanceId,token_hash:hashEmployeeToken(token),expires_at:new Date(Date.now()+23*60*60*1000).toISOString()});
  employeeDbFailure(error);
  return token;
}
