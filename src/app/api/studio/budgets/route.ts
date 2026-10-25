import {json,handleError} from "@/lib/http";
import {requireStudio,readStudioBody} from "@/studio/server";
import {studioBudgets,updateStudioBudget} from "@/studio/studio-budgets";
export const maxDuration=300;
export async function GET(){try{const {db,workspaceId}=await requireStudio();return json(await studioBudgets(db,workspaceId));}catch(error){return handleError(error);}}
export async function PATCH(request:Request){try{const {db,workspaceId,user}=await requireStudio();return json(await updateStudioBudget(db,workspaceId,user.id,await readStudioBody(request)));}catch(error){return handleError(error);}}
