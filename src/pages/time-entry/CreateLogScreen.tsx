import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Plus } from "lucide-react";
import { getList, post } from "../../api/client";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useLookups } from "../../hooks/useLookups";
import { useToast } from "../../components/Toast";
import SheetHeader from "../../components/ui/SheetHeader";
import SectionCard from "../../components/ui/SectionCard";
import ProjectPickerSheet from "./ProjectPickerSheet";
import type { LookupProject, TimeEntry } from "../../types/api";

function fmtIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseIsoDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
}

function fmtHeaderDate(s: string): string {
  if (!s) return "";
  const d = parseIsoDate(s);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function fromDatetimeLocal(s: string): string {
  if (!s) return "";
  return `${s.replace("T", " ")}:00`;
}

function projectAbbrev(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "—";
}

const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";

export default function CreateLogScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const { data: lookups } = useLookups("projects");

  const dateParam = searchParams.get("date") || fmtIsoDate(new Date());
  const initialClockIn = `${dateParam}T${DEFAULT_START}`;
  const initialClockOut = `${dateParam}T${DEFAULT_END}`;

  const [clockInLocal, setClockInLocal] = useState(initialClockIn);
  const [clockOutLocal, setClockOutLocal] = useState(initialClockOut);
  const [note, setNote] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const projectMap = useMemo(() => {
    const m = new Map<number, string>();
    (lookups.projects ?? []).forEach((p: LookupProject) => m.set(p.id, p.name ?? ""));
    return m;
  }, [lookups.projects]);

  const currentProjectName = selectedProjectId ? projectMap.get(selectedProjectId) : null;

  const hasUnsavedChanges =
    selectedProjectId !== null ||
    note.length > 0 ||
    clockInLocal !== initialClockIn ||
    clockOutLocal !== initialClockOut;

  const validationMessage = useMemo<string | null>(() => {
    if (!clockInLocal || !clockOutLocal) return "Start and end times are required.";
    if (new Date(clockOutLocal) <= new Date(clockInLocal)) {
      return "End time must be after start time.";
    }
    if (!selectedProjectId) return "Pick a project for this entry.";
    if (note.trim().length === 0) return "A note is required for project entries.";
    return null;
  }, [clockInLocal, clockOutLocal, note, selectedProjectId]);

  const isValid = validationMessage === null;

  const handleCancel = () => {
    if (hasUnsavedChanges && !confirm("Discard changes?")) return;
    navigate(-1);
  };

  const handleSave = async () => {
    if (!isValid || saving || !me?.user) return;
    setSaving(true);
    try {
      const userPublicId = me.user.public_id;
      const userInternalId = me.user.id;

      const existing = await getList<TimeEntry>(
        `/api/v1/time-entries?user_id=${userInternalId}&start_date=${dateParam}&end_date=${dateParam}&page_size=10`,
      );

      let entryPublicId: string;
      if (existing.data.length > 0) {
        entryPublicId = existing.data[0].public_id;
      } else {
        const created = await post<TimeEntry>("/api/v1/time-entries", {
          user_public_id: userPublicId,
          work_date: dateParam,
          note: null,
        });
        entryPublicId = created.public_id;
      }

      await post(`/api/v1/time-entries/${entryPublicId}/logs`, {
        clock_in: fromDatetimeLocal(clockInLocal),
        clock_out: fromDatetimeLocal(clockOutLocal),
        log_type: "work",
        project_id: selectedProjectId,
        note: note.trim(),
      });

      toast("Entry added", "success");
      queryClient.invalidateQueries({ queryKey: ["time-entries-day"] });
      queryClient.invalidateQueries({ queryKey: ["time-entry", entryPublicId] });
      navigate(-1);
    } catch (err) {
      console.error("Create failed", err);
      toast(err instanceof Error ? err.message : "Create failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const headerTile = currentProjectName ? (
    projectAbbrev(currentProjectName)
  ) : (
    <Plus size={20} strokeWidth={2} />
  );
  const headerTitle = currentProjectName ?? "Pick a project";
  const headerMeta = `${fmtHeaderDate(dateParam)} · New entry`;

  return (
    <>
      <div className="ios-page">
        <SheetHeader
          title="Add entry"
          onCancel={handleCancel}
          onSave={handleSave}
          saveDisabled={!isValid || saving}
        />

        <div className="entry-edit-header">
          <div className="entry-edit-tile">{headerTile}</div>
          <div>
            <div className="entry-edit-title">{headerTitle}</div>
            <div className="entry-edit-meta">{headerMeta}</div>
          </div>
        </div>

        <SectionCard>
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
          <div className="time-row">
            <label className="time-row-label" htmlFor="clock-in">
              Start time
            </label>
            <input
              id="clock-in"
              className="time-row-input"
              type="datetime-local"
              value={clockInLocal}
              onChange={(e) => setClockInLocal(e.target.value)}
            />
          </div>
          <div className="time-row">
            <label className="time-row-label" htmlFor="clock-out">
              End time
            </label>
            <input
              id="clock-out"
              className="time-row-input"
              type="datetime-local"
              value={clockOutLocal}
              onChange={(e) => setClockOutLocal(e.target.value)}
            />
          </div>
        </SectionCard>

        <SectionCard header="Note">
          <div className="note-area">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you work on?"
            />
          </div>
        </SectionCard>

        {validationMessage && (
          <div className="validation-banner">
            <AlertTriangle size={16} strokeWidth={2} />
            <span>{validationMessage}</span>
          </div>
        )}
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
