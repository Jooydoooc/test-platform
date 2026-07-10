// Shared types for the admin student-management surface. Client-safe: no
// server-only imports here so both the API routes and the /admin/students page
// can pull from one contract.

import type { Role, SkillArea } from "@/lib/database.types";

export const MANAGEABLE_ROLES: Role[] = ["STUDENT", "TEACHER", "ADMIN"];

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

/** One recent graded result, flattened for display. */
export interface RecentResult {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  correct: number;
  total: number;
  accuracy: number; // 0..1
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
