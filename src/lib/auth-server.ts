import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Role as DbRole } from "@/lib/database.types";

export interface ServerUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: DbRole;
  groupId: string | null;
}

// Server-side current user + profile. Returns null when not signed in.
// Use in Server Components / Route Handlers / Server Actions. Route protection
// also happens in middleware; this is for reading the user in server code.
export async function getServerUser(): Promise<ServerUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, role, group_id")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return {
    id: user.id,
    email: user.email ?? "",
    firstName: profile.first_name,
    lastName: profile.last_name,
    role: profile.role,
    groupId: profile.group_id,
  };
}

export function isTeacherRole(role: DbRole): boolean {
  return role === "TEACHER" || role === "ADMIN";
}
