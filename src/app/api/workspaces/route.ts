import { json, handleError, ApiError } from "@/lib/http";
import { requireStudio } from "@/studio/server";
export async function GET(){try{const {workspace}=await requireStudio();return json({workspaces:[{...workspace,role:"admin"}]});}catch(error){return handleError(error);}}
export async function POST(){try{await requireStudio();throw new ApiError(410,"private_studio","Each invited creator has one private studio.");}catch(error){return handleError(error);}}
