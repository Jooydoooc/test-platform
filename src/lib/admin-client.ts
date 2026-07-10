"use client";

// Browser-side calls to the admin student API. Every route is ADMIN-gated on the
// server; these just surface the JSON (and throw a readable error on failure).

import type {
  GroupOption,
  StudentDetail,
  StudentListResponse,
  UpdateStudentPayload,
} from "@/lib/admin-students";
import type { Level } from "@/lib/database.types";

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Request failed (${res.status}).`;
  } catch {
    return `Request failed (${res.status}).`;
  }
}

export async function fetchStudents(): Promise<StudentListResponse> {
  const res = await fetch("/api/admin/students", { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as StudentListResponse & { ok: true };
  return { students: body.students, groups: body.groups };
}

export async function fetchStudentDetail(id: string): Promise<StudentDetail> {
  const res = await fetch(`/api/admin/students/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { detail: StudentDetail };
  return body.detail;
}

export async function updateStudent(
  id: string,
  payload: UpdateStudentPayload,
): Promise<void> {
  const res = await fetch(`/api/admin/students/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function deleteStudent(id: string): Promise<void> {
  const res = await fetch(`/api/admin/students/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res));
}

export async function createGroup(
  name: string,
  level: Level,
): Promise<GroupOption> {
  const res = await fetch("/api/admin/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, level }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { group: GroupOption };
  return body.group;
}
