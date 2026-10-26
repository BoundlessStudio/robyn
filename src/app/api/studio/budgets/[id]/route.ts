import {json,handleError} from "@/lib/http";
import {requireStudio} from "@/studio/server";
import {ownedBudgetEmployee} from "@/studio/employee-budgets";
import {paidCapacity} from "@/studio/paid-capacity";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const {db,workspaceId}=await requireStudio();const employee=await ownedBudgetEmployee(db,workspaceId,(await params).id);return json(await paidCapacity(db,employee));}catch(error){return handleError(error);}}
