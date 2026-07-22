import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Send } from "lucide-react";
import { getList, post } from "../../api/client";
import { useToast } from "../../components/Toast";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useLookups } from "../../hooks/useLookups";
import NavHeader from "../../components/ui/NavHeader";
import DayStrip from "../../components/ui/DayStrip";
import EntryCard from "../../components/ui/EntryCard";
import ScopeToggle, { type Scope } from "../../components/ui/ScopeToggle";
import type { TimeEntry, TimeLog, LookupProject, User } from "../../types/api";
import { canViewTeamTimeEntries } from "./timeEntryPermissions";

function compactName(firstname?: string | null, lastname?: string | null): string {
  const f = (firstname ?? "").trim();
  const l = (lastname ?? "").trim();
  if (f && l) return `${f} ${l[0]}.`;
  if (f) return f;
  if (l) return l;
  return "Unknown";
}

function parseIsoDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fmtIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtLongDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function fmtTimeOfDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtDuration(hoursDecimal: number): string {
  const h = Math.floor(hoursDecimal);
  const m = Math.round((hoursDecimal - h) * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function projectAbbrev(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "—";
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  billed: "Billed",
};

export default function PastDayScreen() {
  const { date: dateParam } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const { data: lookups } = useLookups("projects");

  const projectMap = useMemo(() => {
    const m = new Map<number, string>();
    (lookups.projects ?? []).forEach((p: LookupProject) => m.set(p.id, p.name ?? ""));
    return m;
  }, [lookups.projects]);

  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const initialDate = dateParam ? parseIsoDate(dateParam) : today;
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const targetDate = selectedDate;
  const iso = fmtIsoDate(targetDate);
  const [scope, setScope] = useState<Scope>("me");

  const canViewTeam = canViewTeamTimeEntries(me);
  const effectiveScope: Scope = canViewTeam ? scope : "me";

  const usersQuery = useQuery<User[]>({
    queryKey: ["users-roster"],
    queryFn: async () => (await getList<User>(`/api/v1/get/users?page_size=500`)).data,
    enabled: effectiveScope === "team",
    staleTime: 10 * 60 * 1000,
  });
  const userMap = useMemo(() => {
    const m = new Map<number, string>();
    (usersQuery.data ?? []).forEach((u) => m.set(u.id, compactName(u.firstname, u.lastname)));
    return m;
  }, [usersQuery.data]);

  const handleDateChange = (d: Date) => {
    const target = startOfLocalDay(d);
    if (target.getTime() >= today.getTime()) {
      navigate("/time-entry/list");
      return;
    }
    setSelectedDate(target);
    navigate(`/time-entry/past/${fmtIsoDate(target)}`, { replace: true });
  };

  const userId = me?.user?.id;
  // Single-request fetch: ask the list endpoint to inline time_logs via
  // include_logs=true so we don't N+1 per-entry detail GETs on the team view.
  // The server batches the log lookup into one sproc call.
  const entriesQuery = useQuery<TimeEntry[]>({
    queryKey: ["time-entries-day", effectiveScope, userId, iso],
    queryFn: async () => {
      const userParam = effectiveScope === "team" ? "" : `user_id=${userId}&`;
      return (
        await getList<TimeEntry>(
          `/api/v1/time-entries?${userParam}start_date=${iso}&end_date=${iso}&page_size=100&include_logs=true`,
        )
      ).data;
    },
    enabled: !!userId,
  });

  interface EntryGroup {
    entry: TimeEntry;
    workerName?: string;
    logs: TimeLog[];
  }

  const entryGroups: EntryGroup[] = useMemo(() => {
    const groups: EntryGroup[] = [];
    (entriesQuery.data ?? []).forEach((entry) => {
      const sortedLogs = (entry.time_logs ?? []).slice().sort((a, b) =>
        (a.clock_in ?? "").localeCompare(b.clock_in ?? ""),
      );
      const workerName =
        effectiveScope === "team" && entry.user_id !== null
          ? userMap.get(entry.user_id)
          : undefined;
      groups.push({ entry, workerName, logs: sortedLogs });
    });
    if (effectiveScope === "team") {
      groups.sort((a, b) => (a.workerName ?? "").localeCompare(b.workerName ?? ""));
    }
    return groups;
  }, [entriesQuery.data, effectiveScope, userMap]);

  const totalHours = useMemo(() => {
    let sum = 0;
    entryGroups.forEach(({ logs }) => {
      logs.forEach((log) => {
        if (log.log_type === "work") sum += Number(log.duration ?? 0);
      });
    });
    return sum;
  }, [entryGroups]);

  const totalLogCount = useMemo(
    () => entryGroups.reduce((n, g) => n + g.logs.length, 0),
    [entryGroups],
  );

  const totalLabel = fmtDuration(totalHours);
  const dateLabel = fmtLongDate(targetDate);

  const soloStatus =
    effectiveScope === "me" ? entryGroups[0]?.entry.current_status ?? null : null;

  const [submittingEntryId, setSubmittingEntryId] = useState<string | null>(null);

  const handleSubmit = async (entry: TimeEntry, logCount: number, workerLabel: string) => {
    if (submittingEntryId) return;
    const message = `Submit ${logCount} log${logCount === 1 ? "" : "s"} for ${workerLabel} on ${dateLabel}? Once submitted, edits go through the back-office review.`;
    if (!confirm(message)) return;
    setSubmittingEntryId(entry.public_id);
    try {
      await post(`/api/v1/time-entries/${entry.public_id}/submit`, {});
      toast("Submitted for review", "success");
      queryClient.invalidateQueries({ queryKey: ["time-entries-day"] });
      queryClient.invalidateQueries({ queryKey: ["time-entry", entry.public_id] });
    } catch (err) {
      console.error("Submit failed", err);
      toast(err instanceof Error ? err.message : "Submit failed", "error");
    } finally {
      setSubmittingEntryId(null);
    }
  };

  return (
    <div className="ios-page">
      <NavHeader
        title={
          <>
            {dateLabel}
            {soloStatus && soloStatus !== "draft" && (
              <span className={`status-pill status-pill-${soloStatus}`}>
                {STATUS_LABELS[soloStatus] ?? soloStatus}
              </span>
            )}
          </>
        }
        onBack={() => navigate("/time-entry/list")}
        rightAction={
          <button
            type="button"
            className="nav-header-action-btn"
            onClick={() => navigate(`/time-entry/log/new?date=${iso}`)}
            aria-label="Add entry"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        }
      />

      <div className="hero-stat">
        <span className="hero-stat-value">{totalLabel.replace(/h\s.*$/, "")}</span>
        <span className="hero-stat-unit">hours</span>
      </div>

      <DayStrip
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        todayDate={today}
      />

      {canViewTeam && <ScopeToggle value={scope} onChange={setScope} />}

      <div className="section-label-prose">
        {effectiveScope === "team" ? "Entries · Team" : "Entries"}
      </div>

      {totalLogCount === 0 && (
        <div className="page-loading" style={{ padding: "var(--space-xl) 0" }}>
          {entriesQuery.isLoading ? "Loading…" : "No entries on this day."}
        </div>
      )}

      {entryGroups.map(({ entry, workerName, logs }) => {
        const status = entry.current_status ?? "draft";
        const canSubmit = (status === "draft" || status === null) && logs.length > 0;
        const submitting = submittingEntryId === entry.public_id;
        const workerLabel = workerName ?? "you";
        return (
          <div key={entry.public_id} className="worker-section">
            {effectiveScope === "team" && (
              <div className="worker-section-header">
                <span className="worker-section-name">{workerName ?? "Unknown worker"}</span>
                {status !== "draft" && (
                  <span className={`status-pill status-pill-${status}`}>
                    {STATUS_LABELS[status] ?? status}
                  </span>
                )}
              </div>
            )}
            {logs.map((log) => {
              const projectName = log.project_id
                ? projectMap.get(log.project_id) ?? "Unknown project"
                : log.log_type === "break"
                ? "Break"
                : "No project";
              const range = log.clock_out
                ? `${fmtTimeOfDay(log.clock_in)} — ${fmtTimeOfDay(log.clock_out)}`
                : `${fmtTimeOfDay(log.clock_in)} — ongoing`;
              const dur = fmtDuration(Number(log.duration ?? 0));
              return (
                <EntryCard
                  key={log.public_id}
                  projectAbbrev={projectAbbrev(projectName)}
                  projectName={projectName}
                  meta={range}
                  duration={dur}
                  active={false}
                  onClick={() => navigate(`/time-entry/${entry.public_id}/log/${log.public_id}`)}
                />
              );
            })}
            {canSubmit && (
              <button
                type="button"
                className="submit-button"
                onClick={() => handleSubmit(entry, logs.length, workerLabel)}
                disabled={!!submittingEntryId}
              >
                <Send size={16} strokeWidth={2} />
                <span>{submitting ? "Submitting…" : effectiveScope === "team" ? `Submit ${workerLabel}'s day` : "Submit day"}</span>
              </button>
            )}
          </div>
        );
      })}

      {totalLogCount > 0 && (
        <div className="day-total">
          <span className="day-total-label">Day total</span>
          <span className="day-total-value">{totalLabel}</span>
        </div>
      )}
    </div>
  );
}
