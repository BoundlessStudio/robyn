import { redirect } from "next/navigation";
import { betaAdminSession } from "@/lib/beta-admin";
import { BetaRequests } from "@/components/admin/BetaRequests";

export default async function BetaRequestsPage() {
  if (!await betaAdminSession()) redirect("/admin/login");
  return <BetaRequests />;
}
