// Shared types for the admin student-management surface. Client-safe: no
// server-only imports here so both the API routes and the /admin/students page
// can pull from one contract.

import type { Level, Role, SkillArea } from "@/lib/database.types";

export const MANAGEABLE_ROLES: Role[] = ["STUDENT", "ADMIN"];

/** One row in the admin roster. */
export interface StudentSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  groupId: string | null;
  groupName: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  resultsCount: number;
}

export interface GroupOption {
  id: string;
  name: string;
  level: Level;
}

export interface StudentListResponse {
  students: StudentSummary[];
  groups: GroupOption[];
}

/** Per-skill roll-up across all of a student's results. */
export interface SkillStat {
  skill: SkillArea;
  accuracy: number; // 0..1
  resultCount: number;
}

/** What kind of thing an attempt was taken against — determines whether a
 *  re-open is even meaningful, and lets the UI render an honest label instead
 *  of a generic "Untitled". */
export type AttemptKind = "test" | "html_test" | "task" | "vocab" | "unknown";

/** One recent graded result, flattened for display. */
export interface RecentResult {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  correct: number;
  total: number;
  accuracy: number; // 0..1
  /** The attempt this result belongs to — what a re-open acts on. Optional
   *  only for backward compatibility with older cached responses; the API
   *  always sends it now. */
  attemptId?: string;
  /** DB test vs hosted HTML test vs task vs vocab unit. */
  attemptKind?: AttemptKind;
  /** True once an admin has already reopened this attempt (its result is
   *  excluded from progress and a fresh attempt exists). A superseded row
   *  must never be offered the re-open control again. */
  superseded?: boolean;
}

export interface StudentDetail {
  student: StudentSummary;
  attemptsCount: number;
  resultsCount: number;
  points: number;
  skills: SkillStat[];
  recent: RecentResult[];
}

/** Fields an admin may change on a profile. */
export interface UpdateStudentPayload {
  firstName?: string;
  lastName?: string;
  role?: Role;
  groupId?: string | null;
}
