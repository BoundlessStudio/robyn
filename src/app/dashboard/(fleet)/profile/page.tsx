import { redirect } from "next/navigation";
import { CONNECTED_MAIL_SETTINGS_HREF } from "@/studio/connected-mail";

export default function Page() {
  // Existing mailbox consent returns and bookmarks still use this route.
  redirect(CONNECTED_MAIL_SETTINGS_HREF);
}
