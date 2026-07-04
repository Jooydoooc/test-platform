// Shared auth types used by both the Supabase and legacy (localStorage) auth
// implementations. App-facing role stays lowercase so existing checks
// (`user.role === "teacher"`) keep working. Teacher/Admin merge -> "teacher".
export type Role = "teacher" | "student";

export interface User {
  name: string;
  role: Role;
  id?: string;
  email?: string;
  username?: string;
}
