import { redirect } from "next/navigation";

// Keep old invitation/recovery bookmarks usable after moving to emailed sign-in links.
export default function LegacyPasswordPage() {
  redirect("/dashboard");
}
