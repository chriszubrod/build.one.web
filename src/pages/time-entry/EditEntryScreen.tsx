import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { del, getOne, put } from "../../api/client";
import { useToast } from "../../components/Toast";
import SheetHeader from "../../components/ui/SheetHeader";
import TimeLogForm, { type TimeLogFormValues } from "./TimeLogForm";
import type { TimeEntry, TimeLog } from "../../types/api";

function toDatetimeLocal(s: string | null | undefined): string {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : "";
}

function fromDatetimeLocal(s: string): string {
  if (!s) return "";
  return `${s.replace("T", " ")}:00`;
}

export default function EditEntryScreen() {
  const { entryPublicId, logPublicId } = useParams<{
    entryPublicId: string;
    logPublicId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const entryQuery = useQuery<TimeEntry>({
    queryKey: ["time-entry", entryPublicId],
    queryFn: () => getOne<TimeEntry>(`/api/v1/time-entries/${entryPublicId}`),
    enabled: !!entryPublicId,
  });

  const log = useMemo<TimeLog | undefined>(
    () => entryQuery.data?.time_logs?.find((l) => l.public_id === logPublicId),
    [entryQuery.data, logPublicId],
  );

  if (entryQuery.isLoading || !entryQuery.data) {
    return (
      <div className="ios-page">
        <SheetHeader title="Edit entry" onCancel={() => navigate(-1)} />
        <div className="page-loading">Loading…</div>
      </div>
    );
  }

  if (!log) {
    return (
      <div className="ios-page">
        <SheetHeader title="Edit entry" onCancel={() => navigate(-1)} />
        <div className="page-error">Log not found.</div>
      </div>
    );
  }

  const isBreak = log.log_type === "break";

  const initial: TimeLogFormValues = {
    clockInLocal: toDatetimeLocal(log.clock_in),
    clockOutLocal: toDatetimeLocal(log.clock_out),
    note: log.note ?? "",
    projectId: log.project_id,
    userId: entryQuery.data.user_id,
  };

  // Anchor on the entry's Work Date so the TimeLogForm date guard enforces
  // "this log belongs to this entry's day" (a log can't be edited onto a
  // different date). Fall back to the log's own clock-in date only if the
  // entry has no work_date.
  const dateForHeader =
    entryQuery.data.work_date ||
    (log.clock_in && /^(\d{4}-\d{2}-\d{2})/.exec(log.clock_in)?.[1]) ||
    "";

  const handleSave = async (next: TimeLogFormValues) => {
    try {
      await put(`/api/v1/time-logs/${logPublicId}`, {
        row_version: log.row_version,
        clock_in: fromDatetimeLocal(next.clockInLocal),
        clock_out: fromDatetimeLocal(next.clockOutLocal),
        log_type: log.log_type,
        project_id: isBreak ? null : next.projectId,
        note: isBreak ? null : next.note.trim(),
      });
      toast("Entry saved", "success");
      queryClient.invalidateQueries({ queryKey: ["time-entry", entryPublicId] });
      queryClient.invalidateQueries({ queryKey: ["time-entries-day"] });
      navigate(-1);
    } catch (err) {
      console.error("Save failed", err);
      toast(err instanceof Error ? err.message : "Save failed", "error");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete entry?\n\nThis removes the entry from your day. The action can't be undone.")) {
      return;
    }
    try {
      await del(`/api/v1/time-logs/${logPublicId}`);
      toast("Entry deleted", "success");
      queryClient.invalidateQueries({ queryKey: ["time-entry", entryPublicId] });
      queryClient.invalidateQueries({ queryKey: ["time-entries-day"] });
      navigate(-1);
    } catch (err) {
      console.error("Delete failed", err);
      toast(err instanceof Error ? err.message : "Delete failed", "error");
    }
  };

  const handleCancel = (hasUnsaved: boolean) => {
    if (hasUnsaved && !confirm("Discard changes?")) return;
    navigate(-1);
  };

  return (
    <TimeLogForm
      mode="edit"
      isBreak={isBreak}
      dateForHeader={dateForHeader}
      initial={initial}
      canPickUser={false}
      onSave={handleSave}
      onDelete={handleDelete}
      onCancel={handleCancel}
    />
  );
}
