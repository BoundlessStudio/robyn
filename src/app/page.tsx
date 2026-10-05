import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isHostAdmin } from "@/lib/host-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function Home() {
  const { user } = await getSession();
  if (!user) redirect("/login");
  redirect((await isHostAdmin(createAdminClient(), user.id)) ? "/host" : "/dashboard");
}
