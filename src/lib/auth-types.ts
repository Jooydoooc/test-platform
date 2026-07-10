// Shared auth types used by both the Supabase and legacy (localStorage) auth
// implementations. App-facing role stays lowercase (`user.role === "admin"`).
// The platform has exactly two roles: admin (all elevated duties) and student.
export type Role = "admin" | "student";

export interface User {
  name: string;
  role: Role;
  id?: string;
  email?: string;
  username?: string;
}
