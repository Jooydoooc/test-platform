"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Badge, Button, Card, inputClass } from "@/components/ui";
import { LEVEL_OPTIONS } from "@/lib/books";
import {
  MANAGEABLE_ROLES,
  type GroupOption,
  type StudentDetail,
  type StudentSummary,
} from "@/lib/admin-students";
import {
  createGroup,
  deleteStudent,
  fetchStudentDetail,
  fetchStudents,
  updateGroup,
  updateStudent,
} from "@/lib/admin-client";
import type { Level, Role } from "@/lib/database.types";

const DAY = 86_400_000;

function timeAgo(ts: string | null): string {
  if (!ts) return "never";
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 0) return "just now";
  const d = Math.floor(diff / DAY);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function fullName(s: { firstName: string; lastName: string; email: string }) {
  return `${s.firstName} ${s.lastName}`.trim() || s.email || "Unnamed";
}

const ROLE_TONE: Record<Role, "brand" | "amber" | "neutral"> = {
  ADMIN: "brand",
  // TEACHER is retired but remains in the DB enum; map any lingering rows so the
  // Record stays exhaustive over the enum.
  TEACHER: "amber",
  STUDENT: "neutral",
};

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"All" | Role>("All");
  const [groupFilter, setGroupFilter] = useState<string>("All"); // "All" | groupId | "none"

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { students, groups } = await fetchStudents();
      setStudents(students);
      setGroups(groups);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load students.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (roleFilter !== "All" && s.role !== roleFilter) return false;
      if (groupFilter === "none" && s.groupId) return false;
      if (groupFilter !== "All" && groupFilter !== "none" && s.groupId !== groupFilter)
        return false;
      if (q) {
        const hay = `${s.firstName} ${s.lastName} ${s.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [students, query, roleFilter, groupFilter]);

  const counts = useMemo(() => {
    return {
      total: students.length,
      students: students.filter((s) => s.role === "STUDENT").length,
      admins: students.filter((s) => s.role === "ADMIN").length,
    };
  }, [students]);

  const selected = students.find((s) => s.id === selectedId) ?? null;
  const isRealGroup = groupFilter !== "All" && groupFilter !== "none";
  const editingGroup = groups.find((g) => g.id === editGroupId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="size-4" />
          Admin
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Students
            </h1>
            <p className="text-sm text-slate-600">
              Full control over every account — roles, groups, and performance.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setShowNewGroup(true)}>
            <Plus className="size-4" />
            New group
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Everyone" value={counts.total} />
        <Stat label="Students" value={counts.students} />
        <Stat label="Admins" value={counts.admins} />
      </div>

      <Card className="!p-3 sm:!p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-h-[44px] flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/25">
            <Search className="size-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              aria-label="Search students"
              className="w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 sm:text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-auto sm:grid-cols-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as "All" | Role)}
              aria-label="Filter by role"
              className={`${inputClass} min-h-[44px] sm:min-h-0`}
            >
              <option value="All">All roles</option>
              {MANAGEABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0) + r.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                aria-label="Filter by group"
                className={`${inputClass} min-h-[44px] flex-1 sm:min-h-0`}
              >
                <option value="All">All groups</option>
                <option value="none">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              {isRealGroup && (
                <Button
                  variant="secondary"
                  onClick={() => setEditGroupId(groupFilter)}
                  className="shrink-0 !px-3"
                  aria-label="Edit selected group"
                  title="Edit group"
                >
                  <Pencil className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {error ? (
        <Card className="flex items-center gap-3 border-red-200 bg-red-50 text-sm text-red-700">
          <AlertCircle className="size-5 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="secondary" onClick={load}>
            Retry
          </Button>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="size-5 animate-spin" />
          Loading students…
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 py-16 text-center">
          <Users className="size-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            {students.length === 0
              ? "No accounts yet."
              : "No one matches these filters."}
          </p>
        </div>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {shown.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                    {fullName(s).charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {fullName(s)}
                    </p>
                    <p className="truncate text-xs text-slate-500">{s.email}</p>
                  </div>
                  <div className="hidden text-right text-xs text-slate-500 sm:block">
                    <p>{s.groupName ?? "No group"}</p>
                    <p>{timeAgo(s.lastActiveAt)}</p>
                  </div>
                  <Badge tone={ROLE_TONE[s.role]}>
                    {s.role.charAt(0) + s.role.slice(1).toLowerCase()}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {selected && (
        <StudentDrawer
          summary={selected}
          groups={groups}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}

      {showNewGroup && (
        <NewGroupModal onClose={() => setShowNewGroup(false)} onCreated={load} />
      )}

      {editingGroup && (
        <EditGroupModal
          group={editingGroup}
          onClose={() => setEditGroupId(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal: edit a group's name and level.
// ---------------------------------------------------------------------------

function EditGroupModal({
  group,
  onClose,
  onSaved,
}: {
  group: GroupOption;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(group.name);
  const [level, setLevel] = useState<Level>(group.level);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const dirty = name.trim() !== group.name || level !== group.level;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    firstInputRef.current?.focus();
    firstInputRef.current?.select();
  }, []);

  async function save() {
    if (!name.trim()) {
      setErr("Group name is required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await updateGroup(group.id, { name: name.trim(), level });
      await onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update the group.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-group-title"
        className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="edit-group-title" className="text-lg font-bold text-slate-900">
            Edit group
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </div>

        {err && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="size-4 shrink-0" />
            {err}
          </div>
        )}

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Name
            </span>
            <input
              ref={firstInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. B2 Evening"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Level
            </span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as Level)}
              className={inputClass}
            >
              {LEVEL_OPTIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={save} disabled={!dirty || saving} className="flex-1">
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal: create a group.
// ---------------------------------------------------------------------------

function NewGroupModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState<Level>(LEVEL_OPTIONS[0].value);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Escape key closes the modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus the first input when the modal opens.
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  async function create() {
    if (!name.trim()) {
      setErr("Group name is required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await createGroup(name.trim(), level);
      await onCreated();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the group.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-group-title"
        className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="new-group-title" className="text-lg font-bold text-slate-900">New group</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </div>

        {err && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="size-4 shrink-0" />
            {err}
          </div>
        )}

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Name
            </span>
            <input
              ref={firstInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. B2 Evening"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Level
            </span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as Level)}
              className={inputClass}
            >
              {LEVEL_OPTIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={create} disabled={saving} className="flex-1">
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create group"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="!p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Drawer: edit account + performance for one student.
// ---------------------------------------------------------------------------

function StudentDrawer({
  summary,
  groups,
  onClose,
  onChanged,
}: {
  summary: StudentSummary;
  groups: GroupOption[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(summary.firstName);
  const [lastName, setLastName] = useState(summary.lastName);
  const [role, setRole] = useState<Role>(summary.role);
  const [groupId, setGroupId] = useState<string>(summary.groupId ?? "");

  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchStudentDetail(summary.id)
      .then((d) => active && setDetail(d))
      .catch(() => active && setDetail(null));
    return () => {
      active = false;
    };
  }, [summary.id]);

  const dirty =
    firstName !== summary.firstName ||
    lastName !== summary.lastName ||
    role !== summary.role ||
    (groupId || null) !== summary.groupId;

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await updateStudent(summary.id, {
        firstName,
        lastName,
        role,
        groupId: groupId || null,
      });
      await onChanged();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (
      !confirm(
        `Delete ${fullName(summary)}? This removes their account and all attempts/results permanently.`,
      )
    )
      return;
    setDeleting(true);
    setErr(null);
    try {
      await deleteStudent(summary.id);
      await onChanged();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-slate-900">
              {fullName(summary)}
            </h2>
            <p className="truncate text-xs text-slate-500">{summary.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-6 p-5">
          {err && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="size-4 shrink-0" />
              {err}
            </div>
          )}

          {/* --- Account --- */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Account
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  First name
                </span>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Last name
                </span>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                Role
              </span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className={inputClass}
              >
                {MANAGEABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.charAt(0) + r.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                Group
              </span>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className={inputClass}
              >
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={save} disabled={!dirty || saving} className="w-full">
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </section>

          {/* --- Performance --- */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Performance
            </h3>
            {!detail ? (
              <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
                <Loader2 className="size-4 animate-spin" />
                Loading…
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="Attempts" value={detail.attemptsCount} />
                  <MiniStat label="Results" value={detail.resultsCount} />
                  <MiniStat label="Points" value={detail.points} />
                </div>

                {detail.skills.length > 0 && (
                  <div className="space-y-2">
                    {detail.skills.map((s) => {
                      const pct = Math.round(s.accuracy * 100);
                      return (
                        <div key={s.skill}>
                          <div className="mb-1 flex items-center justify-between text-xs font-medium">
                            <span className="capitalize text-slate-600">
                              {s.skill.toLowerCase()}
                            </span>
                            <span className="text-slate-500">{pct}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${
                                pct >= 80
                                  ? "bg-emerald-500"
                                  : pct >= 50
                                    ? "bg-brand-500"
                                    : "bg-amber-500"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {detail.recent.length > 0 ? (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {detail.recent.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {r.title}
                          </p>
                          <p className="text-xs text-slate-400">
                            {timeAgo(r.createdAt)}
                            {r.status === "PENDING_REVIEW" && " · pending review"}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-slate-700">
                          {r.correct}/{r.total}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400">No graded results yet.</p>
                )}
              </>
            )}
          </section>

          {/* --- Danger zone --- */}
          <section className="space-y-2 border-t border-slate-200 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-red-500">
              Danger zone
            </h3>
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete account
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
    </div>
  );
}
