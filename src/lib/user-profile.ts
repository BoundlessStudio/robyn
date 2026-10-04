import type { User } from "@supabase/supabase-js";
import type { UserProfile } from "@/lib/types";

export const MAX_DISPLAY_NAME_LENGTH = 320;
export const MAX_PHONE_NUMBER_LENGTH = 50;

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// full_name is also read by get_workspace_members_with_names, keeping account and
// agent-assignment names consistent. Contact numbers do not change auth.phone.
export function userProfileFromUser(user: Pick<User, "email" | "user_metadata">): UserProfile {
  const metadata = user.user_metadata ?? {};
  const email = user.email ?? "";
  return {
    email,
    display_name: trimmedString(metadata.full_name) || trimmedString(metadata.name) || email,
    phone_number: trimmedString(metadata.phone_number) || null,
  };
}

export interface UserProfilePatch {
  display_name?: string;
  phone_number?: string | null;
}

export function validateUserProfilePatch(body: unknown): UserProfilePatch {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Provide a display name or phone number.");
  }
  const input = body as Record<string, unknown>;
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => key !== "display_name" && key !== "phone_number")) {
    throw new Error("Only display name and phone number can be changed.");
  }

  const patch: UserProfilePatch = {};
  if (Object.hasOwn(input, "display_name")) {
    if (typeof input.display_name !== "string") throw new Error("Display name must be text.");
    const name = input.display_name.trim();
    if (!name || name.length > MAX_DISPLAY_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) {
      throw new Error(`Display name must be between 1 and ${MAX_DISPLAY_NAME_LENGTH} characters on one line.`);
    }
    patch.display_name = name;
  }
  if (Object.hasOwn(input, "phone_number")) {
    if (input.phone_number !== null && typeof input.phone_number !== "string") {
      throw new Error("Phone number must be text or empty.");
    }
    const phone = trimmedString(input.phone_number);
    if (phone && (phone.length > MAX_PHONE_NUMBER_LENGTH || !/[0-9]/.test(phone) ||
      !/^\+?[0-9(). -]+(?: *(?:x|ext\.?) *[0-9]+)?$/i.test(phone))) {
      throw new Error("Enter a phone number using digits, spaces, parentheses or hyphens, with an optional country code or extension.");
    }
    patch.phone_number = phone || null;
  }
  return patch;
}
