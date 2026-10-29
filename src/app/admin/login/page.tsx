import { redirect } from "next/navigation";
import { betaAdminSession } from "@/lib/beta-admin";
import { BetaAdminLogin } from "@/components/admin/BetaAdminLogin";

export default async function AdminLoginPage() {
  if (await betaAdminSession()) redirect("/admin/beta-requests");
  return <BetaAdminLogin />;
}
