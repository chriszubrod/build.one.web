import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Pause, Trash2 } from "lucide-react";
import { del, getOne, put } from "../../api/client";
import { useLookups } from "../../hooks/useLookups";
import { useToast } from "../../components/Toast";
import SheetHeader from "../../components/ui/SheetHeader";
import SectionCard from "../../components/ui/SectionCard";
import ProjectPickerSheet from "./ProjectPickerSheet";
import type { LookupProject, TimeEntry, TimeLog } from "../../types/api";

function toDatetimeLocal(s: string | null | undefined): string {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : "";
}

function fromDatetimeLocal(s: string): string {
  if (!s) return "";
  return `${s.replace("T", " ")}:00`;
}

function fmtHeaderDate(s: string): string {
  if (!s) return "";
  const parsed = new Date(s.replace(" ", "T"));
  if (isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function projectAbbrev(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "—";
}

export default function EditEntryScreen() {
  const { entryPublicId, logPublicId } = useParams<{
    entryPublicId: string;
    logPublicId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: lookups } = useLookups("projects");

  const entryQuery = useQuery<TimeEntry>({
    queryKey: ["time-entry", entryPublicId],
    queryFn: () => getOne<TimeEntry>(`/api/v1/time-entries/${entryPublicId}`),
    enabled: !!entryPublicId,
  });

  const log = useMemo<TimeLog | undefined>(
    () => entryQuery.data?.time_logs?.find((l) => l.public_id === logPublicId),
    [entryQuery.data, logPublicId],
  );

  const isBreak = log?.log_type === "break";

  const [clockInLocal, setClockInLocal] = useState("");
  const [clockOutLocal, setClockOutLocal] = useState("");
  const [note, setNote] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const [initialClockIn, setInitialClockIn] = useState("");
  const [initialClockOut, setInitialClockOut] = useState("");
  const [initialNote, setInitialNote] = useState("");
  const [initialProjectId, setInitialProjectId] = useState<number | null>(null);

  useEffect(() => {
    if (!log) return;
    const ci = toDatetimeLocal(log.clock_in);
    const co = toDatetimeLocal(log.clock_out);
    const n = log.note ?? "";
    const pid = log.project_id;
    setClockInLocal(ci);
    setClockOutLocal(co);
    setNote(n);
    setSelectedProjectId(pid);
    setInitialClockIn(ci);
    setInitialClockOut(co);
    setInitialNote(n);
    setInitialProjectId(pid);
  }, [log]);

  const projectMap = useMemo(() => {
    const m = new Map<number, string>();
    (lookups.projects ?? []).forEach((p: LookupProject) => m.set(p.id, p.name ?? ""));
    return m;
  }, [lookups.projects]);

  const currentProjectName = selectedProjectId ? projectMap.get(selectedProjectId) : null;

  const hasUnsavedChanges =
    clockInLocal !== initialClockIn ||
    clockOutLocal !== initialClockOut ||
    (!isBreak && note !== initialNote) ||
    (!isBreak && selectedProjectId !== initialProjectId);

  const validationMessage = useMemo<string | null>(() => {
    if (!clockInLocal || !clockOutLocal) return null;
    if (new Date(clockOutLocal) <= new Date(clockInLocal)) {
      return "End time must be after start time.";
    }
    if (!isBreak && note.trim().length === 0) {
      return "A note is required for project entries.";
    }
    return null;
  }, [clockInLocal, clockOutLocal, note, isBreak]);

  const isValid = validationMessage === null;

  const handleCancel = () => {
    if (hasUnsavedChanges && !confirm("Discard changes?")) return;
    navigate("/time-entry/list");
  };

  const handleSave = async () => {
    if (!isValid || !log || saving) return;
    setSaving(true);
    try {
      await put(`/api/v1/time-logs/${logPublicId}`, {
        row_version: log.row_version,
        clock_in: fromDatetimeLocal(clockInLocal),
        clock_out: fromDatetimeLocal(clockOutLocal),
        log_type: log.log_type,
        project_id: isBreak ? null : selectedProjectId,
        note: isBreak ? null : note.trim(),
      });
      toast("Entry saved", "success");
      queryClient.invalidateQueries({ queryKey: ["time-entry", entryPublicId] });
      queryClient.invalidateQueries({ queryKey: ["time-entries-day"] });
      navigate("/time-entry/list");
    } catch (err) {
      console.error("Save failed", err);
      toast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!log) return;
    if (!confirm("Delete entry?\n\nThis removes the entry from your day. The action can't be undone.")) {
      return;
    }
    setSaving(true);
    try {
      await del(`/api/v1/time-logs/${logPublicId}`);
      toast("Entry deleted", "success");
      queryClient.invalidateQueries({ queryKey: ["time-entry", entryPublicId] });
      queryClient.invalidateQueries({ queryKey: ["time-entries-day"] });
      navigate("/time-entry/list");
    } catch (err) {
      console.error("Delete failed", err);
      toast(err instanceof Error ? err.message : "Delete failed", "error");
      setSaving(false);
    }
  };

  if (entryQuery.isLoading || !entryQuery.data) {
    return (
      <div className="ios-page">
        <SheetHeader title="Edit entry" onCancel={() => navigate("/time-entry/list")} />
        <div className="page-loading">Loading…</div>
      </div>
    );
  }

  if (!log) {
    return (
      <div className="ios-page">
        <SheetHeader title="Edit entry" onCancel={() => navigate("/time-entry/list")} />
        <div className="page-error">Log not found.</div>
      </div>
    );
  }

  const headerTitle = isBreak ? "Break" : currentProjectName ?? "Untitled project";
  const headerTile = isBreak ? <Pause size={20} /> : projectAbbrev(currentProjectName ?? "—");
  const dateText = fmtHeaderDate(log.clock_in ?? "");
  const headerMeta = `${dateText}${dateText ? " · " : ""}Not submitted`;

  return (
    <>
      <div className="ios-page">
        <SheetHeader
          title="Edit entry"
          onCancel={handleCancel}
          onSave={handleSave}
          saveDisabled={!isValid || saving || !hasUnsavedChanges}
        />

        <div className="entry-edit-header">
          <div className="entry-edit-tile">{headerTile}</div>
          <div>
            <div className="entry-edit-title">{headerTitle}</div>
            <div className="entry-edit-meta">{headerMeta}</div>
          </div>
        </div>

        <SectionCard>
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
                <span className="list-row-value">{currentProjectName ?? "Pick a project"}</span>
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

        <button
          type="button"
          className="destructive-button"
          onClick={handleDelete}
          disabled={saving}
        >
          <Trash2 size={16} strokeWidth={2} />
          <span>Delete entry</span>
        </button>
      </div>

      <ProjectPickerSheet
        open={showProjectPicker}
        onDismiss={() => setShowProjectPicker(false)}
        onSelect={(p) => {
          setSelectedProjectId(p.id);
          setShowProjectPicker(false);
        }}
      />
    </>
  );
}
