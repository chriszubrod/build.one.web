import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueries } from "@tanstack/react-query";
import { getList, getOne } from "../../api/client";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useLookups } from "../../hooks/useLookups";
import { Plus } from "lucide-react";
import NavHeader from "../../components/ui/NavHeader";
import HeroButton from "../../components/ui/HeroButton";
import DayStrip from "../../components/ui/DayStrip";
import EntryCard from "../../components/ui/EntryCard";
import ScopeToggle, { type Scope } from "../../components/ui/ScopeToggle";
import type { TimeEntry, TimeLog, LookupProject, User } from "../../types/api";

const TIME_TRACKING_MODULE = "Time Tracking";

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

export default function PastDayScreen() {
  const { date: dateParam } = useParams<{ date: string }>();
  const navigate = useNavigate();
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

  const canViewTeam =
    me?.modules?.find((m) => m.name === TIME_TRACKING_MODULE)?.can_view_team ?? false;
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
  const entriesQuery = useQuery<TimeEntry[]>({
    queryKey: ["time-entries-day", effectiveScope, userId, iso],
    queryFn: async () => {
      const userParam = effectiveScope === "team" ? "" : `user_id=${userId}&`;
      return (
        await getList<TimeEntry>(
          `/api/v1/time-entries?${userParam}start_date=${iso}&end_date=${iso}&page_size=100`,
        )
      ).data;
    },
    enabled: !!userId,
  });

  const detailQueries = useQueries({
    queries: (entriesQuery.data ?? []).map((te) => ({
      queryKey: ["time-entry", te.public_id],
      queryFn: () => getOne<TimeEntry>(`/api/v1/time-entries/${te.public_id}`),
      enabled: !!te.public_id,
    })),
  });

  const allLogs: { entryId: string; userId: number | null; log: TimeLog }[] = useMemo(() => {
    const out: { entryId: string; userId: number | null; log: TimeLog }[] = [];
    detailQueries.forEach((q) => {
      const entry = q.data;
      if (!entry?.time_logs) return;
      entry.time_logs.forEach((log) => {
        out.push({ entryId: entry.public_id, userId: entry.user_id, log });
      });
    });
    out.sort((a, b) => (a.log.clock_in ?? "").localeCompare(b.log.clock_in ?? ""));
    return out;
  }, [detailQueries]);

  const totalHours = useMemo(() => {
    return allLogs.reduce((sum, { log }) => {
      if (log.log_type !== "work") return sum;
      return sum + Number(log.duration ?? 0);
    }, 0);
  }, [allLogs]);

  const totalLabel = fmtDuration(totalHours);

  return (
    <div className="ios-page">
      <NavHeader title={fmtLongDate(targetDate)} onBack={() => navigate("/time-entry/list")} />

      <div className="hero-stat">
        <span className="hero-stat-value">{totalLabel.replace(/h\s.*$/, "")}</span>
        <span className="hero-stat-unit">hours</span>
      </div>

      <HeroButton
        label="+ Add entry"
        icon={<Plus size={18} strokeWidth={2.5} />}
        onClick={() => navigate(`/time-entry/log/new?date=${iso}`)}
      />

      <DayStrip
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        todayDate={today}
      />

      {canViewTeam && <ScopeToggle value={scope} onChange={setScope} />}

      <div className="section-label-prose">
        {effectiveScope === "team" ? "Entries · Team" : "Entries"}
      </div>

      {allLogs.length === 0 && (
        <div className="page-loading" style={{ padding: "var(--space-xl) 0" }}>
          {entriesQuery.isLoading || detailQueries.some((q) => q.isLoading)
            ? "Loading…"
            : "No entries on this day."}
        </div>
      )}

      {allLogs.map(({ entryId, userId: entryUserId, log }) => {
        const projectName = log.project_id
          ? projectMap.get(log.project_id) ?? "Unknown project"
          : log.log_type === "break"
          ? "Break"
          : "No project";
        const range = log.clock_out
          ? `${fmtTimeOfDay(log.clock_in)} — ${fmtTimeOfDay(log.clock_out)}`
          : `${fmtTimeOfDay(log.clock_in)} — ongoing`;
        const dur = fmtDuration(Number(log.duration ?? 0));
        const workerName =
          effectiveScope === "team" && entryUserId !== null
            ? userMap.get(entryUserId)
            : undefined;
        return (
          <EntryCard
            key={log.public_id}
            projectAbbrev={projectAbbrev(projectName)}
            projectName={projectName}
            meta={range}
            duration={dur}
            active={false}
            workerName={workerName}
            onClick={() => navigate(`/time-entry/${entryId}/log/${log.public_id}`)}
          />
        );
      })}

      {allLogs.length > 0 && (
        <div className="day-total">
          <span className="day-total-label">Day total</span>
          <span className="day-total-value">{totalLabel}</span>
        </div>
      )}
    </div>
  );
}
