import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Plus, Send, Trash2 } from "lucide-react";
import { ApiError, getList, getOne, post, put } from "../../api/client";
import { useLookups } from "../../hooks/useLookups";
import { useToast } from "../../components/Toast";
import NavHeader from "../../components/ui/NavHeader";
import SectionCard from "../../components/ui/SectionCard";
import ListRow from "../../components/ui/ListRow";
import SubCostCodePickerSheet from "./SubCostCodePickerSheet";
import ProjectPickerSheet from "../time-entry/ProjectPickerSheet";
import type {
  ContractLabor,
  ContractLaborLineItem,
  LookupProject,
  LookupSubCostCode,
  TimeEntry,
} from "../../types/api";

function fmtIsoDate(s: string | null | undefined): string {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : n ?? 0;
  if (isNaN(v)) return "$0.00";
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtHours(s: string | null | undefined): string {
  if (s === null || s === undefined || s === "") return "0.00h";
  const n = Number(s);
  if (isNaN(n)) return "0.00h";
  return `${n.toFixed(2)}h`;
}

function fmtTimeOfDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function abbrev(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "—";
}

/**
 * Per-line user edits. All fields are OPTIONAL — only fields the user has
 * touched have entries. Untouched fields fall back to the raw server value
 * at save time so we don't silently round-trip-truncate decimals beyond
 * what the user actually typed (review-workflow finding #1, #2, #9).
 */
interface LineEdit {
  sub_cost_code_id?: number | null;
  project_id?: number | null;
  is_billable?: boolean;
  is_overhead?: boolean;
  description?: string;
  /** hours, as typed (decimal string). "" means user cleared the field. */
  hours?: string;
  /** dollars per hour, as typed. "" means user cleared the field. */
  rate?: string;
  /** percentage as typed (e.g. "50" for 0.50 fraction); converted on save. */
  markup_pct?: string;
}

/**
 * Client-side-only line item the user has added on this screen. Identified
 * by a synthetic client_id ("new-1", "new-2") that doubles as the key in
 * the shared `edits` map. On save it ships with id=null so the server-side
 * line-items diff sees it as an INSERT.
 */
interface AddedLine {
  client_id: string;
  line_date: string;
  project_id: number | null;
  sub_cost_code_id: number | null;
  description: string;
  hours: string;
  rate: string;
  /** percentage as typed (e.g. "50" for 0.50 fraction); converted on save. */
  markup_pct: string;
  is_billable: boolean;
  is_overhead: boolean;
}

/** Display formatter — 2-decimal pad for the input boxes. Save path never
 *  reads this value, so the rounding is purely cosmetic. */
function decimalToDisplayString(v: string | null): string {
  if (v === null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2);
}

/** Display formatter for markup — converts fraction (0.50) to percent
 *  string ("50"). Used only for the input value. Save path preserves the
 *  original fraction when the field is untouched. */
function markupToPctDisplayString(markup: string | null): string {
  if (markup === null || markup === "") return "";
  const n = Number(markup);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 10000) / 100);
}

/** Strict non-negative number parse for *display* math. Negatives and
 *  non-finites clamp to 0 (review-workflow finding #8). */
function parseOrZero(s: string): number {
  if (s === "") return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

/** Reject negative, non-finite, or -0 input at the field level — keeps
 *  pasted-garbage / scientific-notation overflow / typed-minus / -0 from
 *  reaching state or the save payload. */
function inputRejectsNegative(v: string): boolean {
  if (v === "") return false;
  const n = Number(v);
  if (!Number.isFinite(n)) return true;
  if (Object.is(n, -0)) return true;
  return n < 0;
}

/** Reject typed/pasted values above a maximum at the field level. Used
 *  for the Hours input to enforce the 24h soft limit symmetrically with
 *  the negative reject. */
function inputRejectsAboveMax(v: string, max: number): boolean {
  if (v === "") return false;
  const n = Number(v);
  if (!Number.isFinite(n)) return true;
  return n > max;
}

function computeAmount(hours: number, rate: number): number {
  return hours * rate;
}

function computePrice(hours: number, rate: number, markupFraction: number): number {
  return hours * rate * (1 + markupFraction);
}

export default function LaborReviewScreen() {
  const { public_id } = useParams<{ public_id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: lookups } = useLookups("projects,sub_cost_codes");

  const projectMap = useMemo(() => {
    const m = new Map<number, string>();
    (lookups.projects ?? []).forEach((p: LookupProject) => m.set(p.id, p.name ?? ""));
    return m;
  }, [lookups.projects]);

  const sccMap = useMemo(() => {
    const m = new Map<number, LookupSubCostCode>();
    (lookups.sub_cost_codes ?? []).forEach((s: LookupSubCostCode) => m.set(s.id, s));
    return m;
  }, [lookups.sub_cost_codes]);

  const clQuery = useQuery<ContractLabor>({
    queryKey: ["contract-labor", public_id],
    queryFn: () => getOne<ContractLabor>(`/api/v1/contract-labor/${public_id}`),
    enabled: !!public_id,
  });

  const linesQuery = useQuery<ContractLaborLineItem[]>({
    queryKey: ["contract-labor", public_id, "line-items"],
    queryFn: async () =>
      (await getList<ContractLaborLineItem>(`/api/v1/contract-labor/${public_id}/line-items`)).data,
    enabled: !!public_id,
  });

  const sourceTeQuery = useQuery<TimeEntry>({
    queryKey: ["time-entry", clQuery.data?.source_time_entry_public_id],
    queryFn: () =>
      getOne<TimeEntry>(`/api/v1/time-entries/${clQuery.data?.source_time_entry_public_id}`),
    enabled: !!clQuery.data?.source_time_entry_public_id,
  });

  // edits is intentionally sparse — only fields the user has touched have
  // entries. Initial render and refetches do NOT seed edits, so untouched
  // fields preserve the raw server precision through the save path.
  // Map is keyed by line.public_id for server lines and by AddedLine.client_id
  // for newly-added lines (set at create time; never mutated).
  const [edits, setEdits] = useState<Map<string, LineEdit>>(new Map());
  // Client-only state for additions + deletions. addedLines holds NewLines
  // the user has tapped + Add for; removedServerLineIds holds public_ids of
  // server lines they've tapped delete on. On save, server lines minus the
  // removed set + addedLines are sent through the same diff endpoint.
  const [addedLines, setAddedLines] = useState<AddedLine[]>([]);
  const [removedServerLineIds, setRemovedServerLineIds] = useState<Set<string>>(
    () => new Set(),
  );
  const addedLineCounter = useRef(0);
  const [pickingForLineId, setPickingForLineId] = useState<string | null>(null);
  const [pickingProjectForLineId, setPickingProjectForLineId] =
    useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);

  // After a refetch, drop any local state that became inconsistent — added
  // lines that the server now knows about (id assigned), and removed ids
  // that no longer exist on the server.
  useEffect(() => {
    const serverIds = new Set((linesQuery.data ?? []).map((li) => li.public_id));
    setRemovedServerLineIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (serverIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
    // We intentionally don't auto-clear addedLines here — the user's
    // additions are kept until they either save (server returns the row,
    // then the next effective render shows it via linesQuery.data and
    // addedLines is cleared at save success) or explicitly remove.
  }, [linesQuery.data]);

  const shapeLine = (
    base: {
      public_id: string;
      id: number | null;
      row_version: string | null;
      line_date: string | null;
      project_id: number | null;
      sub_cost_code_id: number | null;
      description: string | null;
      hours: string | null;
      rate: string | null;
      markup: string | null;
      is_billable: boolean;
      is_overhead: boolean;
      _line_kind: "server" | "new";
      _client_id?: string;
    },
    e: LineEdit | undefined,
  ) => {
    const hoursStr = e?.hours ?? decimalToDisplayString(base.hours);
    const rateStr = e?.rate ?? decimalToDisplayString(base.rate);
    const markupPctStr = e?.markup_pct ?? markupToPctDisplayString(base.markup);
    const hoursNum = parseOrZero(hoursStr);
    const rateNum = parseOrZero(rateStr);
    const markupFraction = parseOrZero(markupPctStr) / 100;
    const computedAmount = computeAmount(hoursNum, rateNum);
    const computedPrice = computePrice(hoursNum, rateNum, markupFraction);
    return {
      ...base,
      sub_cost_code_id:
        e?.sub_cost_code_id !== undefined ? e.sub_cost_code_id : base.sub_cost_code_id,
      project_id:
        e?.project_id !== undefined ? e.project_id : base.project_id,
      is_billable: e?.is_billable ?? base.is_billable,
      is_overhead: e?.is_overhead ?? base.is_overhead,
      description: e?.description ?? base.description ?? "",
      hours_str: hoursStr,
      rate_str: rateStr,
      markup_pct_str: markupPctStr,
      computed_amount: computedAmount,
      computed_price: computedPrice,
      dirty_hours: e?.hours !== undefined,
      dirty_rate: e?.rate !== undefined,
      dirty_markup: e?.markup_pct !== undefined,
    };
  };

  const effectiveLines = useMemo(() => {
    const serverShaped = (linesQuery.data ?? [])
      .filter((li) => !removedServerLineIds.has(li.public_id))
      .map((li) =>
        shapeLine(
          {
            public_id: li.public_id,
            id: li.id,
            row_version: li.row_version,
            line_date: li.line_date,
            project_id: li.project_id,
            sub_cost_code_id: li.sub_cost_code_id,
            description: li.description,
            hours: li.hours,
            rate: li.rate,
            markup: li.markup,
            is_billable: li.is_billable,
            is_overhead: li.is_overhead,
            _line_kind: "server",
          },
          edits.get(li.public_id),
        ),
      );
    const addedShaped = addedLines.map((al) =>
      shapeLine(
        {
          public_id: al.client_id,
          id: null,
          row_version: null,
          line_date: al.line_date,
          project_id: al.project_id,
          sub_cost_code_id: al.sub_cost_code_id,
          description: al.description,
          hours: al.hours,
          rate: al.rate,
          markup: al.markup_pct === "" ? null : String(Number(al.markup_pct) / 100),
          is_billable: al.is_billable,
          is_overhead: al.is_overhead,
          _line_kind: "new",
          _client_id: al.client_id,
        },
        edits.get(al.client_id),
      ),
    );
    return [...serverShaped, ...addedShaped];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesQuery.data, edits, addedLines, removedServerLineIds]);

  const missingSCC = effectiveLines.some((li) => li.is_billable && li.sub_cost_code_id === null);
  // Block both empty AND zero values — a billable line with hours="0" or
  // rate="0" would ship a $0 line to billing just like an empty one.
  const missingHoursOrRate = effectiveLines.some(
    (li) =>
      li.is_billable &&
      (parseOrZero(li.hours_str) <= 0 || parseOrZero(li.rate_str) <= 0),
  );
  // Billable, non-overhead lines need a project bound — added lines start
  // null; server lines should always have one but a user could clear it.
  const missingProject = effectiveLines.some(
    (li) => li.is_billable && !li.is_overhead && li.project_id === null,
  );
  const isReady =
    !missingSCC &&
    !missingHoursOrRate &&
    !missingProject &&
    effectiveLines.length > 0;

  // Header totals are scoped to BILLABLE lines so the "X hours · $Y" pair
  // reconciles for the reviewer. Non-billable line hours are still shown
  // on the per-line cards but excluded from the header summary
  // (review-workflow finding #4).
  const totalHoursBillable = useMemo(
    () =>
      effectiveLines.reduce(
        (sum, li) => (li.is_billable ? sum + parseOrZero(li.hours_str) : sum),
        0,
      ),
    [effectiveLines],
  );

  const totalAmount = useMemo(
    () =>
      effectiveLines.reduce((sum, li) => {
        if (!li.is_billable) return sum;
        return sum + li.computed_price;
      }, 0),
    [effectiveLines],
  );

  const updateLine = (lineId: string, patch: LineEdit) => {
    setEdits((prev) => {
      const next = new Map(prev);
      const current = next.get(lineId) ?? {};
      next.set(lineId, { ...current, ...patch });
      return next;
    });
  };

  /** Default Rate + Markup for a new line.
   *
   *  Source priority:
   *    1. Parent CL.hourly_rate / .markup — set by the aggregator from
   *       ReadEffectiveRateForVendorProject when the CL is single-project.
   *    2. Fallback: scan existing line items for the first non-null rate.
   *       Same-vendor day usually means same per-line rate, so picking the
   *       first one is a reasonable default for multi-project CLs where
   *       the parent's rate is NULL.
   *    3. Empty (user fills in manually).
   */
  const defaultRateForNewLine = useMemo(() => {
    const fromParent = clQuery.data?.hourly_rate;
    if (fromParent && fromParent !== "") return decimalToDisplayString(fromParent);
    for (const li of linesQuery.data ?? []) {
      if (li.rate && li.rate !== "") return decimalToDisplayString(li.rate);
    }
    return "";
  }, [clQuery.data?.hourly_rate, linesQuery.data]);

  const defaultMarkupPctForNewLine = useMemo(() => {
    const fromParent = clQuery.data?.markup;
    if (fromParent && fromParent !== "") return markupToPctDisplayString(fromParent);
    for (const li of linesQuery.data ?? []) {
      if (li.markup && li.markup !== "") return markupToPctDisplayString(li.markup);
    }
    return "";
  }, [clQuery.data?.markup, linesQuery.data]);

  /** Add a blank client-only line item. Defaults line_date to the CL's
   *  work_date and Rate / Markup from defaultRateForNewLine /
   *  defaultMarkupPctForNewLine (vendor defaults via the parent CL). The
   *  new line participates in the same edit pipeline (via its client_id)
   *  and ships to the server with id=null on save. */
  const handleAddLine = () => {
    if (!clQuery.data) return;
    addedLineCounter.current += 1;
    const clientId = `new-${Date.now()}-${addedLineCounter.current}`;
    setAddedLines((prev) => [
      ...prev,
      {
        client_id: clientId,
        line_date: clQuery.data?.work_date ?? "",
        project_id: null,
        sub_cost_code_id: null,
        description: "",
        hours: "",
        rate: defaultRateForNewLine,
        markup_pct: defaultMarkupPctForNewLine,
        is_billable: true,
        is_overhead: false,
      },
    ]);
  };

  /** Remove a line. For server lines we mark the public_id removed (the
   *  next save sees a missing id and the server's diff DELETEs it). For
   *  added lines we just drop them from local state — they were never
   *  persisted. Edits map entries for the removed line are cleared so
   *  they don't survive into the next save payload. */
  const handleRemoveLine = (li: typeof effectiveLines[number]) => {
    const label =
      li._line_kind === "new"
        ? "this new line"
        : `Line ${
            effectiveLines.findIndex((x) => x.public_id === li.public_id) + 1
          }`;
    if (!confirm(`Remove ${label}? This cannot be undone after save.`)) return;
    setEdits((prev) => {
      if (!prev.has(li.public_id)) return prev;
      const next = new Map(prev);
      next.delete(li.public_id);
      return next;
    });
    if (li._line_kind === "new") {
      setAddedLines((prev) => prev.filter((al) => al.client_id !== li.public_id));
    } else {
      setRemovedServerLineIds((prev) => {
        const next = new Set(prev);
        next.add(li.public_id);
        return next;
      });
    }
  };

  /** Build the line-items payload. For decimal fields (hours/rate/markup),
   *  prefer the RAW server value when the user didn't edit that field —
   *  preserves decimal precision instead of round-tripping through the
   *  display's toFixed(2) (review-workflow findings #1/#2/#9). Price is
   *  recomputed from the same precise hours/rate/markup that we send,
   *  so it stays consistent with them (covers the followup precision
   *  residual where computed_price was derived from display strings).
   *  Negatives clamp to 0 as defense-in-depth alongside the input-level
   *  reject (finding #8). */
  const buildLineItemsPayload = () =>
    effectiveLines.map((li) => {
      const hoursForSave = li.dirty_hours
        ? li.hours_str === ""
          ? null
          : Math.max(0, Number(li.hours_str))
        : li.hours === null || li.hours === ""
        ? null
        : Math.max(0, Number(li.hours));
      const rateForSave = li.dirty_rate
        ? li.rate_str === ""
          ? null
          : Math.max(0, Number(li.rate_str))
        : li.rate === null || li.rate === ""
        ? null
        : Math.max(0, Number(li.rate));
      const markupForSave = li.dirty_markup
        ? li.markup_pct_str === ""
          ? null
          : Math.max(0, Number(li.markup_pct_str) / 100)
        : li.markup === null || li.markup === ""
        ? null
        : Math.max(0, Number(li.markup));
      // Recompute price from the SAME values we're persisting so the
      // server-stored row is internally consistent. Nulls treated as 0
      // for the multiplication; result clamped non-negative.
      const h = hoursForSave ?? 0;
      const r = rateForSave ?? 0;
      const mf = markupForSave ?? 0;
      const priceForSave = Math.max(0, h * r * (1 + mf));
      // Server-line: keep its id + public_id + row_version. Added line:
      // ship id=null so the diff-based PUT inserts it; public_id and
      // row_version are dropped (they're client-only sentinels).
      const isNew = li._line_kind === "new";
      return {
        id: isNew ? null : li.id,
        public_id: isNew ? null : li.public_id,
        row_version: isNew ? null : li.row_version,
        line_date: li.line_date,
        project_id: li.is_overhead ? null : li.project_id,
        sub_cost_code_id: li.sub_cost_code_id,
        description: li.description.trim() || null,
        hours: hoursForSave,
        rate: rateForSave,
        markup: markupForSave,
        price: Number(priceForSave.toFixed(2)),
        is_billable: li.is_billable,
        is_overhead: li.is_overhead,
      };
    });

  /** Refetch the parent ContractLabor + its line items so a subsequent
   *  PUT/POST sees the latest row_versions. Used after every PUT — both
   *  on success (before the follow-up POST in handleSubmitForReview) and
   *  on failure (so a retry doesn't 409 on the bumped row_version). */
  const refreshFromServer = async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["contract-labor", public_id] }),
      queryClient.refetchQueries({
        queryKey: ["contract-labor", public_id, "line-items"],
      }),
    ]);
  };

  const handleSubmitForReview = async () => {
    if (!clQuery.data || submittingReview || saving) return;
    if (effectiveLines.length === 0) return;
    // No confirm — click is authoritative (per Chris 2026-07-02); the
    // button is disabled while submitting so accidental double-taps are
    // blocked and 409 "already submitted" is treated as success now.
    setSubmittingReview(true);
    let putSucceeded = false;
    try {
      // Persist current edits so reviewers see the latest values.
      // bill_vendor_id / bill_date / due_date / bill_number are deliberately
      // null'd — those are derived by the downstream Generate Bills flow,
      // never set on this screen (legacy ContractLaborEdit:339-345 noted
      // the same intent).
      await put(`/api/v1/contract-labor/${public_id}/bill`, {
        row_version: clQuery.data.row_version,
        bill_vendor_id: null,
        bill_date: null,
        due_date: null,
        bill_number: null,
        status: undefined,
        line_items: buildLineItemsPayload(),
      });
      putSucceeded = true;
      // Skip the mid-flow refetch — /submit/review doesn't consume
      // row_version, so we save ~1s of blocking round-trip. The final
      // invalidateQueries + navigate at the end triggers React Query's
      // background refetch on the next mount.
      await post(`/api/v1/submit/review/contract-labor/${public_id}`, {
        comments: null,
      });
      // PUT diff persisted: server now has our additions (with real ids)
      // and removals are gone. Local sentinels can be dropped — the next
      // mount won't see them, and we're navigating away here anyway.
      setAddedLines([]);
      setRemovedServerLineIds(new Set());
      setEdits(new Map());
      toast("Submitted for review", "success");
      queryClient.invalidateQueries({ queryKey: ["contract-labor"] });
      navigate(-1);
    } catch (err) {
      // Tag the log with which phase failed for prod-side diagnosis.
      console.error("Submit for review failed", { putSucceeded, err });

      // 409 "review already in progress" / "already approved" — the
      // server-side Review row already exists (either an earlier submit
      // succeeded silently from the client's perspective, or another
      // window submitted first). Treat as effective success: clean up
      // local state and navigate away instead of showing a misleading
      // "tap Submit again to retry" that would just 409 again.
      const isAlreadySubmitted =
        err instanceof ApiError &&
        err.status === 409 &&
        /already (in progress|approved)/i.test(err.detail ?? "");
      if (isAlreadySubmitted) {
        setAddedLines([]);
        setRemovedServerLineIds(new Set());
        setEdits(new Map());
        toast("Already submitted for review", "success");
        queryClient.invalidateQueries({ queryKey: ["contract-labor"] });
        navigate(-1);
        return;
      }

      // If the PUT succeeded but the POST failed for some OTHER reason,
      // the edits are persisted but the review request didn't start.
      // Refresh state so a retry uses fresh row_versions, and surface a
      // phase-specific message.
      if (putSucceeded) {
        await refreshFromServer().catch(() => undefined);
        toast(
          "Edits were saved, but the review request didn't start. Tap Submit again to retry.",
          "error",
        );
      } else {
        // PUT failed — server row_version unchanged, but refresh anyway
        // in case the failure was concurrent-edit (409) caused by
        // another user updating the row.
        await refreshFromServer().catch(() => undefined);
        toast(err instanceof Error ? err.message : "Submit for review failed", "error");
      }
    } finally {
      setSubmittingReview(false);
    }
  };

  const hasUnsavedChanges =
    edits.size > 0 || addedLines.length > 0 || removedServerLineIds.size > 0;

  /** Persist current edits WITHOUT changing status or triggering review.
   *  Use this when the CL is in `ready` (past review) but the user still
   *  needs to tweak line items, or when the user wants a checkpoint
   *  before walking away from a `pending_review` CL. The PUT does the
   *  same line-items diff (insert / update / delete) as the other save
   *  paths; status is left unchanged (undefined on the wire). */
  const handleSaveChanges = async () => {
    if (!clQuery.data || saving || submittingReview) return;
    if (!hasUnsavedChanges) return;
    setSaving(true);
    try {
      await put(`/api/v1/contract-labor/${public_id}/bill`, {
        row_version: clQuery.data.row_version,
        bill_vendor_id: null,
        bill_date: null,
        due_date: null,
        bill_number: null,
        status: undefined,
        line_items: buildLineItemsPayload(),
      });
      setAddedLines([]);
      setRemovedServerLineIds(new Set());
      setEdits(new Map());
      await refreshFromServer();
      toast("Saved", "success");
      queryClient.invalidateQueries({ queryKey: ["contract-labor"] });
    } catch (err) {
      console.error("Save failed", err);
      await refreshFromServer().catch(() => undefined);
      toast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkReady = async () => {
    if (!isReady || !clQuery.data || saving) return;
    const msg =
      `Mark ${clQuery.data.employee_name} ready for billing? Once ready, line items can no longer be edited from this screen.`;
    if (!confirm(msg)) return;
    setSaving(true);
    try {
      // bill_vendor_id / bill_date / due_date / bill_number are deliberately
      // null'd — derived downstream by Generate Bills, never set here.
      // Mirrors legacy ContractLaborEdit:339-345 intent.
      await put(`/api/v1/contract-labor/${public_id}/bill`, {
        row_version: clQuery.data.row_version,
        bill_vendor_id: null,
        bill_date: null,
        due_date: null,
        bill_number: null,
        status: "ready",
        line_items: buildLineItemsPayload(),
      });
      // Same reasoning as the submit-for-review success path.
      setAddedLines([]);
      setRemovedServerLineIds(new Set());
      setEdits(new Map());
      toast("Marked ready for billing", "success");
      queryClient.invalidateQueries({ queryKey: ["contract-labor"] });
      navigate(-1);
    } catch (err) {
      console.error("Mark ready failed", err);
      // Refresh state so a retry doesn't 409 on the (possibly) bumped
      // row_version.
      await refreshFromServer().catch(() => undefined);
      toast(err instanceof Error ? err.message : "Mark ready failed", "error");
    } finally {
      setSaving(false);
    }
  };

  if (clQuery.isLoading || !clQuery.data) {
    return (
      <div className="ios-page">
        <NavHeader title="Review" onBack={() => navigate(-1)} />
        <div className="page-loading">Loading…</div>
      </div>
    );
  }

  const cl = clQuery.data;
  const headerMeta = `${fmtIsoDate(cl.work_date)} · ${totalHoursBillable.toFixed(2)}h billable · ${fmtMoney(totalAmount)}`;

  return (
    <>
      <div className="ios-page">
        <NavHeader title="Review" onBack={() => navigate(-1)} />

        <div className="entry-edit-header">
          <div className="entry-edit-tile">{abbrev(cl.employee_name ?? "—")}</div>
          <div>
            <div className="entry-edit-title">{cl.employee_name ?? "Unknown worker"}</div>
            <div className="entry-edit-meta">{headerMeta}</div>
          </div>
        </div>

        {cl.source_time_entry_public_id && (
          <SectionCard header="Time logs">
            {sourceTeQuery.isLoading && (
              <div className="time-row">
                <span className="time-row-label">Loading source logs…</span>
              </div>
            )}
            {sourceTeQuery.data?.time_logs?.map((log) => {
              const projectName = log.project_id
                ? projectMap.get(log.project_id) ?? "Unknown project"
                : log.log_type === "break"
                ? "Break"
                : "No project";
              const range = log.clock_out
                ? `${fmtTimeOfDay(log.clock_in)} — ${fmtTimeOfDay(log.clock_out)}`
                : `${fmtTimeOfDay(log.clock_in)} — ongoing`;
              const note = log.note?.trim() || undefined;
              return (
                <ListRow
                  key={log.public_id}
                  title={projectName}
                  subtitle={note ? `${range} · ${note}` : range}
                  value={fmtHours(log.duration)}
                />
              );
            })}
          </SectionCard>
        )}

        <div className="section-card-header">Line items</div>
        {effectiveLines.length === 0 && (
          <SectionCard>
            <div className="time-row">
              <span className="time-row-label">No line items.</span>
            </div>
          </SectionCard>
        )}
        {effectiveLines.map((li, idx) => {
          const projectName = li.is_overhead
            ? "Overhead"
            : li.project_id
            ? projectMap.get(li.project_id) ?? "Unknown project"
            : "Pick project";
          const sccLabel =
            li.sub_cost_code_id !== null
              ? (() => {
                  const scc = sccMap.get(li.sub_cost_code_id);
                  return scc ? `${scc.number} · ${scc.name}` : `#${li.sub_cost_code_id}`;
                })()
              : "Pick sub cost code";
          return (
            <SectionCard
              key={li.public_id}
              header={
                <span className="line-card-header">
                  <span>
                    Line {idx + 1} · {projectName}
                    {li._line_kind === "new" && (
                      <span className="line-card-new-badge">NEW</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="line-card-delete"
                    onClick={() => handleRemoveLine(li)}
                    aria-label={`Remove line ${idx + 1}`}
                  >
                    <Trash2 size={16} strokeWidth={2} />
                  </button>
                </span>
              }
            >
              <button
                type="button"
                className="list-row list-row-link"
                onClick={() => setPickingProjectForLineId(li.public_id)}
                disabled={li.is_overhead}
              >
                <div className="list-row-content">
                  <div className="list-row-title">Project</div>
                </div>
                <div className="list-row-trailing">
                  <span className="list-row-value">
                    {li.is_overhead
                      ? "Overhead (no project)"
                      : li.project_id
                      ? projectMap.get(li.project_id) ?? `#${li.project_id}`
                      : "Pick project"}
                  </span>
                  <ChevronRight size={18} strokeWidth={2} className="list-row-chevron" />
                </div>
              </button>
              <div className="time-row">
                <label className="time-row-label" htmlFor={`hours-${li.public_id}`}>Hours</label>
                <input
                  id={`hours-${li.public_id}`}
                  className="time-row-input"
                  type="number"
                  inputMode="decimal"
                  step="0.25"
                  min="0"
                  max="24"
                  value={li.hours_str}
                  onChange={(e) => {
                    if (inputRejectsNegative(e.target.value)) return;
                    if (inputRejectsAboveMax(e.target.value, 24)) return;
                    updateLine(li.public_id, { hours: e.target.value });
                  }}
                />
              </div>
              <div className="time-row">
                <label className="time-row-label" htmlFor={`rate-${li.public_id}`}>Rate ($/hr)</label>
                <input
                  id={`rate-${li.public_id}`}
                  className="time-row-input"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={li.rate_str}
                  onChange={(e) => {
                    if (inputRejectsNegative(e.target.value)) return;
                    updateLine(li.public_id, { rate: e.target.value });
                  }}
                />
              </div>
              <div className="time-row">
                <span className="time-row-label">Amount</span>
                <span className="time-row-label" style={{ color: "var(--color-text-muted)" }}>
                  {fmtMoney(li.computed_amount)}
                </span>
              </div>
              <div className="time-row">
                <label className="time-row-label" htmlFor={`markup-${li.public_id}`}>Markup (%)</label>
                <input
                  id={`markup-${li.public_id}`}
                  className="time-row-input"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={li.markup_pct_str}
                  onChange={(e) => {
                    if (inputRejectsNegative(e.target.value)) return;
                    updateLine(li.public_id, { markup_pct: e.target.value });
                  }}
                />
              </div>
              <div className="time-row">
                <span className="time-row-label">Price</span>
                <span className="time-row-label" style={{ color: "var(--color-text)" }}>
                  {fmtMoney(li.computed_price)}
                </span>
              </div>
              <button
                type="button"
                className="list-row list-row-link"
                onClick={() => setPickingForLineId(li.public_id)}
              >
                <div className="list-row-content">
                  <div className="list-row-title">Sub cost code</div>
                </div>
                <div className="list-row-trailing">
                  <span className="list-row-value">{sccLabel}</span>
                  <ChevronRight size={18} strokeWidth={2} className="list-row-chevron" />
                </div>
              </button>
              <div className="description-area">
                <label className="description-area-label" htmlFor={`desc-${li.public_id}`}>
                  Description
                </label>
                <textarea
                  id={`desc-${li.public_id}`}
                  value={li.description}
                  onChange={(e) => updateLine(li.public_id, { description: e.target.value })}
                  placeholder="What was done?"
                />
              </div>
              <ListRow
                title="Billable"
                toggleValue={li.is_billable}
                onToggleChange={(v) => updateLine(li.public_id, { is_billable: v })}
              />
              <ListRow
                title="Overhead"
                toggleValue={li.is_overhead}
                onToggleChange={(v) => updateLine(li.public_id, { is_overhead: v })}
              />
            </SectionCard>
          );
        })}

        <button
          type="button"
          className="add-line-button"
          onClick={handleAddLine}
          disabled={cl.status === "billed"}
        >
          <Plus size={16} strokeWidth={2} />
          <span>Add line item</span>
        </button>

        {(missingSCC || missingHoursOrRate || missingProject) && (
          <div className="validation-banner">
            <AlertTriangle size={16} strokeWidth={2} />
            <span>
              {(() => {
                const needs: string[] = [];
                if (missingProject) needs.push("a project (or Overhead)");
                if (missingHoursOrRate) needs.push("Hours and Rate > 0");
                if (missingSCC) needs.push("a sub cost code");
                return `Every billable line item needs ${needs.join(", ")} before this can be marked ready.`;
              })()}
            </span>
          </div>
        )}

        {/* Save changes — visible for any non-billed CL whenever there are
            unsaved edits. Submit / Mark Ready still gate on
            status === 'pending_review' because those transition workflows
            don't apply once review has resolved. */}
        {cl.status !== "billed" && (
          <button
            type="button"
            className="submit-button"
            onClick={handleSaveChanges}
            disabled={!hasUnsavedChanges || saving || submittingReview}
          >
            <Send size={16} strokeWidth={2} />
            <span>{saving ? "Saving…" : "Save changes"}</span>
          </button>
        )}
        {/* Submit for review: pending_review only. Once flipped to
            'submitted' the row already has a Review; re-submitting
            409s. */}
        {cl.status === "pending_review" && (
          <button
            type="button"
            className="submit-button"
            onClick={handleSubmitForReview}
            disabled={submittingReview || saving || effectiveLines.length === 0}
          >
            <Send size={16} strokeWidth={2} />
            <span>{submittingReview ? "Submitting…" : "Submit for review"}</span>
          </button>
        )}
        {/* Mark ready: both pending_review AND submitted. The
            'submitted' state is where the user is applying PM
            responses (SCCs) and then advancing to 'ready' manually. */}
        {(cl.status === "pending_review" || cl.status === "submitted") && (
          <button
            type="button"
            className="submit-button"
            onClick={handleMarkReady}
            disabled={!isReady || saving || submittingReview}
          >
            <Send size={16} strokeWidth={2} />
            <span>{saving ? "Saving…" : "Mark ready for billing"}</span>
          </button>
        )}
      </div>

      <SubCostCodePickerSheet
        open={pickingForLineId !== null}
        onDismiss={() => setPickingForLineId(null)}
        onSelect={(scc) => {
          if (pickingForLineId) {
            updateLine(pickingForLineId, { sub_cost_code_id: scc.id });
          }
          setPickingForLineId(null);
        }}
      />

      <ProjectPickerSheet
        open={pickingProjectForLineId !== null}
        onDismiss={() => setPickingProjectForLineId(null)}
        onSelect={(p) => {
          if (pickingProjectForLineId) {
            updateLine(pickingProjectForLineId, { project_id: p.id });
          }
          setPickingProjectForLineId(null);
        }}
      />
    </>
  );
}
