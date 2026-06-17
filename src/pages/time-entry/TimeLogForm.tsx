import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Pause, Trash2 } from "lucide-react";
import { getList } from "../../api/client";
import { useLookups } from "../../hooks/useLookups";
import SheetHeader from "../../components/ui/SheetHeader";
import SectionCard from "../../components/ui/SectionCard";
import ProjectPickerSheet from "./ProjectPickerSheet";
import UserPickerSheet from "./UserPickerSheet";
import type { LookupProject, User } from "../../types/api";

export interface TimeLogFormValues {
  clockInLocal: string;
  clockOutLocal: string;
  note: string;
  projectId: number | null;
  userId: number | null;
}

interface TimeLogFormProps {
  mode: "edit" | "create";
  isBreak: boolean;
  dateForHeader: string;
  initial: TimeLogFormValues;
  canPickUser: boolean;
  onSave: (next: TimeLogFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: (hasUnsaved: boolean) => void;
}

function fmtHeaderDate(s: string): string {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

// "YYYY-MM-DD" + N calendar days → "YYYY-MM-DD" (local, DST-safe).
function addDaysIso(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function projectAbbrev(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "—";
}

function compactUserName(u: User | undefined): string {
  if (!u) return "Pick a worker";
  const f = (u.firstname ?? "").trim();
  const l = (u.lastname ?? "").trim();
  if (f && l) return `${f} ${l[0]}.`;
  if (f) return f;
  if (l) return l;
  return "(unnamed)";
}

export default function TimeLogForm({
  mode,
  isBreak,
  dateForHeader,
  initial,
  canPickUser,
  onSave,
  onDelete,
  onCancel,
}: TimeLogFormProps) {
  const { data: lookups } = useLookups("projects");
  const usersQuery = useQuery<User[]>({
    queryKey: ["users-roster"],
    queryFn: async () => (await getList<User>(`/api/v1/get/users?page_size=500`)).data,
    enabled: canPickUser,
    staleTime: 10 * 60 * 1000,
  });

  const [clockInLocal, setClockInLocal] = useState(initial.clockInLocal);
  const [clockOutLocal, setClockOutLocal] = useState(initial.clockOutLocal);
  const [note, setNote] = useState(initial.note);
  const [projectId, setProjectId] = useState<number | null>(initial.projectId);
  const [userId, setUserId] = useState<number | null>(initial.userId);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const projectMap = useMemo(() => {
    const m = new Map<number, string>();
    (lookups.projects ?? []).forEach((p: LookupProject) => m.set(p.id, p.name ?? ""));
    return m;
  }, [lookups.projects]);

  const userMap = useMemo(() => {
    const m = new Map<number, User>();
    (usersQuery.data ?? []).forEach((u) => m.set(u.id, u));
    return m;
  }, [usersQuery.data]);

  const currentProjectName = projectId ? projectMap.get(projectId) ?? null : null;
  const currentUser = userId !== null ? userMap.get(userId) : undefined;

  // The calendar day this entry belongs to. A log's Clock In MUST fall on it,
  // so a single day's entry can't accumulate logs from other dates (the bug
  // that produced a 55h "one day" entry spanning weeks). Clock Out may roll
  // to the next morning for an overnight shift. Mirrors the server-side intent
  // and the guard already in the admin TimeEntryView.
  const day = (dateForHeader || "").slice(0, 10);

  const hasUnsavedChanges =
    clockInLocal !== initial.clockInLocal ||
    clockOutLocal !== initial.clockOutLocal ||
    (!isBreak && note !== initial.note) ||
    (!isBreak && projectId !== initial.projectId) ||
    (canPickUser && userId !== initial.userId);

  const validationMessage = useMemo<string | null>(() => {
    if (!clockInLocal || !clockOutLocal) return "Start and end times are required.";
    if (new Date(clockOutLocal) <= new Date(clockInLocal)) {
      return "End time must be after start time.";
    }
    if (day) {
      if (clockInLocal.slice(0, 10) !== day) {
        return `This entry is for ${day}. The start time must be on that date — to log a different day, open that day and add it there.`;
      }
      const outDay = clockOutLocal.slice(0, 10);
      if (outDay !== day && outDay !== addDaysIso(day, 1)) {
        return `The end time must be on ${day} (or the next morning for an overnight shift).`;
      }
    }
    if (mode === "create" && canPickUser && !userId) return "Pick a worker for this entry.";
    if (!isBreak && !projectId) return "Pick a project for this entry.";
    if (!isBreak && note.trim().length === 0) {
      return "A note is required for project entries.";
    }
    return null;
  }, [clockInLocal, clockOutLocal, note, projectId, userId, isBreak, canPickUser, mode, day]);

  const isValid = validationMessage === null;

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      await onSave({ clockInLocal, clockOutLocal, note, projectId, userId });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || saving) return;
    setSaving(true);
    try {
      await onDelete();
    } finally {
      setSaving(false);
    }
  };

  const headerTile = isBreak ? (
    <Pause size={20} />
  ) : currentProjectName ? (
    projectAbbrev(currentProjectName)
  ) : (
    "—"
  );
  const headerTitle = isBreak
    ? "Break"
    : currentProjectName ?? (mode === "create" ? "Pick a project" : "Untitled project");
  const headerMeta = `${fmtHeaderDate(dateForHeader)} · ${mode === "create" ? "New entry" : "Not submitted"}`;

  const saveDisabled =
    !isValid || saving || (mode === "edit" && !hasUnsavedChanges);

  return (
    <>
      <div className="ios-page">
        <SheetHeader
          title={mode === "create" ? "Add entry" : "Edit entry"}
          onCancel={() => onCancel(hasUnsavedChanges)}
          onSave={handleSave}
          saveDisabled={saveDisabled}
        />

        <div className="entry-edit-header">
          <div className="entry-edit-tile">{headerTile}</div>
          <div>
            <div className="entry-edit-title">{headerTitle}</div>
            <div className="entry-edit-meta">{headerMeta}</div>
          </div>
        </div>

        <SectionCard>
          {canPickUser && (
            <button
              type="button"
              className="list-row list-row-link"
              onClick={() => setShowUserPicker(true)}
            >
              <div className="list-row-content">
                <div className="list-row-title">Worker</div>
              </div>
              <div className="list-row-trailing">
                <span className="list-row-value">{compactUserName(currentUser)}</span>
                <ChevronRight size={18} strokeWidth={2} className="list-row-chevron" />
              </div>
            </button>
          )}
          {!isBreak && (
            <button
              type="button"
              className="list-row list-row-link"
              onClick={() => setShowProjectPicker(true)}
            >
              <div className="list-row-content">
                <div className="list-row-title">Project</div>
              </div>
              <div className="list-row-trailing">
                <span className="list-row-value">
                  {currentProjectName ?? "Pick a project"}
                </span>
                <ChevronRight size={18} strokeWidth={2} className="list-row-chevron" />
              </div>
            </button>
          )}
          <div className="time-row">
            <label className="time-row-label" htmlFor="clock-in">Start time</label>
            <input
              id="clock-in"
              className="time-row-input"
              type="datetime-local"
              value={clockInLocal}
              min={day ? `${day}T00:00` : undefined}
              max={day ? `${day}T23:59` : undefined}
              onChange={(e) => setClockInLocal(e.target.value)}
            />
          </div>
          <div className="time-row">
            <label className="time-row-label" htmlFor="clock-out">End time</label>
            <input
              id="clock-out"
              className="time-row-input"
              type="datetime-local"
              value={clockOutLocal}
              min={day ? `${day}T00:00` : undefined}
              max={day ? `${addDaysIso(day, 1)}T23:59` : undefined}
              onChange={(e) => setClockOutLocal(e.target.value)}
            />
          </div>
        </SectionCard>

        {!isBreak && (
          <SectionCard header="Note">
            <div className="note-area">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What did you work on?"
              />
            </div>
          </SectionCard>
        )}

        {validationMessage && (
          <div className="validation-banner">
            <AlertTriangle size={16} strokeWidth={2} />
            <span>{validationMessage}</span>
          </div>
        )}

        {onDelete && (
          <button
            type="button"
            className="destructive-button"
            onClick={handleDelete}
            disabled={saving}
          >
            <Trash2 size={16} strokeWidth={2} />
            <span>Delete entry</span>
          </button>
        )}
      </div>

      <ProjectPickerSheet
        open={showProjectPicker}
        onDismiss={() => setShowProjectPicker(false)}
        onSelect={(p) => {
          setProjectId(p.id);
          setShowProjectPicker(false);
        }}
      />

      <UserPickerSheet
        open={showUserPicker}
        onDismiss={() => setShowUserPicker(false)}
        onSelect={(u) => {
          setUserId(u.id);
          setShowUserPicker(false);
        }}
      />
    </>
  );
}
