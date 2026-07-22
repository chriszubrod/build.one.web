import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getList, post } from "../../api/client";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import TimeLogForm, { type TimeLogFormValues } from "./TimeLogForm";
import type { TimeEntry, User } from "../../types/api";
import { canViewTeamTimeEntries } from "./timeEntryPermissions";
const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";

function fmtIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromDatetimeLocal(s: string): string {
  if (!s) return "";
  return `${s.replace("T", " ")}:00`;
}

export default function CreateLogScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();

  const dateParam = searchParams.get("date") || fmtIsoDate(new Date());

  const canPickUser = canViewTeamTimeEntries(me);

  const usersQuery = useQuery<User[]>({
    queryKey: ["users-roster"],
    queryFn: async () => (await getList<User>(`/api/v1/get/users?page_size=500`)).data,
    enabled: canPickUser,
    staleTime: 10 * 60 * 1000,
  });

  if (!me?.user) {
    return null;
  }

  const initial: TimeLogFormValues = {
    clockInLocal: `${dateParam}T${DEFAULT_START}`,
    clockOutLocal: `${dateParam}T${DEFAULT_END}`,
    note: "",
    projectId: null,
    userId: me.user.id,
  };

  const handleSave = async (next: TimeLogFormValues) => {
    try {
      const targetUserId = next.userId ?? me.user!.id;
      const targetUser = canPickUser
        ? usersQuery.data?.find((u) => u.id === targetUserId)
        : null;
      const targetUserPublicId =
        targetUser?.public_id ??
        (targetUserId === me.user!.id ? me.user!.public_id : null);

      if (!targetUserPublicId) {
        toast("Selected worker isn't loaded yet — try again in a moment.", "error");
        return;
      }

      const existing = await getList<TimeEntry>(
        `/api/v1/time-entries?user_id=${targetUserId}&start_date=${dateParam}&end_date=${dateParam}&page_size=10`,
      );

      let entryPublicId: string;
      if (existing.data.length > 0) {
        entryPublicId = existing.data[0].public_id;
      } else {
        const created = await post<TimeEntry>("/api/v1/time-entries", {
          user_public_id: targetUserPublicId,
          work_date: dateParam,
          note: null,
        });
        entryPublicId = created.public_id;
      }

      await post(`/api/v1/time-entries/${entryPublicId}/logs`, {
        clock_in: fromDatetimeLocal(next.clockInLocal),
        clock_out: fromDatetimeLocal(next.clockOutLocal),
        log_type: "work",
        project_id: next.projectId,
        note: next.note.trim(),
      });

      toast("Entry added", "success");
      queryClient.invalidateQueries({ queryKey: ["time-entries-day"] });
      queryClient.invalidateQueries({ queryKey: ["time-entry", entryPublicId] });
      navigate(-1);
    } catch (err) {
      console.error("Create failed", err);
      toast(err instanceof Error ? err.message : "Create failed", "error");
    }
  };

  const handleCancel = (hasUnsaved: boolean) => {
    if (hasUnsaved && !confirm("Discard changes?")) return;
    navigate(-1);
  };

  return (
    <TimeLogForm
      mode="create"
      isBreak={false}
      dateForHeader={dateParam}
      initial={initial}
      canPickUser={canPickUser}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}
