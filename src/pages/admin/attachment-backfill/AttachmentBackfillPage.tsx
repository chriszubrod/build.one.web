import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../../../components/PageHeader";
import { useAdminGate } from "../../../hooks/useAdminGate";
import { ATTACHMENT_BACKFILL_KEY_PREFIX } from "../../../persistPolicy";
import type { AttachmentBackfillReviewStatus } from "../../../types/api";
import { getFacets, listRuns } from "./attachmentBackfillApi";
import {
  type BatchSelection,
  EVIDENCE_GROUPS,
  GROUP_LABELS,
  SAMPLE_GROUP,
  SAMPLE_LABEL,
  batchCount,
  defaultBatch,
  defaultRun,
  firstBatchIn,
  groupCounts,
  hasSample,
  isSampleBatch,
  projectOptions,
  sampleCount,
  sampleProgress,
  withHeldProject,
  withHeldYear,
  yearOptions,
} from "./backfillModel";
import ReviewQueue from "./ReviewQueue";

/**
 * U-535b b3 — review historical Box invoice PDFs as candidate bill links
 * (/attachment-backfill). System admins only: the menu entry is
 * requiresAdmin and this page redirects a non-admin (useAdminGate); the API
 * re-checks require_system_admin on every call.
 *
 * The owner approves EVERY candidate individually. Everything on this page is
 * neutral evidence — counts, flags and the text as printed — never a verdict.
 */

const STATUS_OPTIONS: { value: AttachmentBackfillReviewStatus | "all"; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

const NONE = "__none__";

export default function AttachmentBackfillPage() {
  const { isAdmin, gate } = useAdminGate();
  const queryClient = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<AttachmentBackfillReviewStatus | "all">("pending");
  const [selection, setSelection] = useState<BatchSelection | null>(null);
  // A group the user picked that had no batch yet. Only the PICK is stored;
  // whether it is empty is derived from the current facets on every render (R4).
  const [pickedGroup, setPickedGroup] = useState<BatchSelection["group"] | null>(null);

  const runsQuery = useQuery({
    queryKey: [ATTACHMENT_BACKFILL_KEY_PREFIX, "runs"],
    queryFn: listRuns,
    enabled: isAdmin,
  });
  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);

  // Defaults are adopted ONCE and then held in state: a later refetch of
  // runs/facets (after every decision) must never move the reviewer to another batch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot adoption of the default run
    if (runId === null && runs.length > 0) setRunId(defaultRun(runs)?.public_id ?? null);
  }, [runId, runs]);

  const facetsQuery = useQuery({
    queryKey: [ATTACHMENT_BACKFILL_KEY_PREFIX, "facets", runId],
    queryFn: () => getFacets(runId!),
    enabled: isAdmin && !!runId,
  });
  const facets = useMemo(() => facetsQuery.data ?? [], [facetsQuery.data]);

  // Default batch (owner decision: open on the clean group) once facets arrive.
  useEffect(() => {
    if (selection !== null || pickedGroup !== null || !facetsQuery.data) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot adoption of the default batch
    setSelection(defaultBatch(facetsQuery.data, reviewStatus));
  }, [selection, pickedGroup, facetsQuery.data, reviewStatus]);

  // A picked group that was empty: adopt its first batch once it has candidates.
  const pickedGroupBatch = pickedGroup && facetsQuery.data ? firstBatchIn(facetsQuery.data, pickedGroup, reviewStatus) : null;
  useEffect(() => {
    if (!pickedGroupBatch) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot adoption when the group fills
    setSelection(pickedGroupBatch);
    setPickedGroup(null);
  }, [pickedGroupBatch]);
  const groupEmpty = pickedGroup !== null && pickedGroupBatch === null;
  // The group the pickers name: a pick still waiting for candidates, else the batch's.
  const shownGroup = pickedGroup ?? selection?.group ?? null;

  // The sample's total over every status changes only when the sample is redrawn or
  // closed (decisions move members between statuses, never in or out), so keying on
  // it remounts the queue from its first page instead of paging a stale cursor (W2).
  const sample = sampleProgress(facets);
  const sampleKey = selection && isSampleBatch(selection) ? `|n${sample?.total ?? 0}` : "";
  const batchKey = selection
    ? `${runId}|${selection.group}|${selection.projectPublicId ?? NONE}|${selection.year ?? NONE}|${reviewStatus}${sampleKey}`
    : null;

  if (gate) return gate;

  const counts = groupCounts(facets, reviewStatus);
  // b5: the open random sample is a picker choice only while facets carry `sample`
  // rows — or while it is the batch under review, so the picker keeps naming it.
  const showSample = hasSample(facets) || shownGroup === SAMPLE_GROUP;
  // The held batch stays an option (count 0) after it empties, so the pickers always
  // name the batch under review until the user picks another (fix L2).
  // The sample is one flat list (EM decision): no project/year options, so both pickers show "—" disabled.
  const sampleShown = shownGroup === SAMPLE_GROUP;
  const batched = selection && !isSampleBatch(selection) ? selection : null;
  const projects = batched ? withHeldProject(projectOptions(facets, batched.group, reviewStatus), batched, facets) : [];
  const years = batched
    ? withHeldYear(yearOptions(facets, batched.group, batched.projectPublicId, reviewStatus), batched)
    : [];
  const run = runs.find((r) => r.public_id === runId);

  const pickGroup = (group: BatchSelection["group"]) => {
    const batch = firstBatchIn(facets, group, reviewStatus);
    setSelection(batch);
    setPickedGroup(batch ? null : group);
  };
  const pickProject = (value: string) => {
    if (!selection || isSampleBatch(selection)) return;
    const projectPublicId = value === NONE ? null : value;
    const year = yearOptions(facets, selection.group, projectPublicId, reviewStatus)[0]?.year ?? null;
    const projectName = projects.find((p) => p.projectPublicId === projectPublicId)?.projectName;
    setSelection({ group: selection.group, projectPublicId, year, projectName });
  };
  const pickYear = (value: string) => {
    if (!selection || isSampleBatch(selection)) return;
    setSelection({ ...selection, year: value === NONE ? null : Number(value) });
  };
  const pickStatus = (value: AttachmentBackfillReviewStatus | "all") => {
    setReviewStatus(value);
    setPickedGroup(null);
    setSelection(facetsQuery.data ? defaultBatch(facetsQuery.data, value) : null);
  };
  const pickRun = (value: string) => {
    setRunId(value);
    setPickedGroup(null);
    setSelection(null);
  };

  // A select keeps focus after a pick; blur it so the review keys work straight away.
  const blurAfter =
    <T,>(fn: (v: T) => void) =>
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      fn(e.target.value as T);
      e.currentTarget.blur();
    };

  return (
    <div className="page abf-page">
      <PageHeader title="Attachment backfill" />
      {runsQuery.error && <div className="page-error">Could not load runs.</div>}
      {runsQuery.isSuccess && runs.length === 0 && <p className="text-muted">No runs.</p>}

      {runs.length > 0 && (
        <div className="abf-pickers">
          <label className="abf-picker">
            <span>Run</span>
            <select
              value={runId ?? ""}
              onChange={blurAfter(pickRun)}
              data-testid="abf-run"
            >
              {runs.map((r) => (
                <option key={r.public_id} value={r.public_id}>
                  {(r.created_datetime ?? "").slice(0, 10) || r.public_id} · {r.status ?? "—"} · pending{" "}
                  {r.pending}
                </option>
              ))}
            </select>
          </label>
          <label className="abf-picker">
            <span>Status</span>
            <select value={reviewStatus} onChange={blurAfter(pickStatus)} data-testid="abf-status-filter">
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {shownGroup && (
            <>
              <label className="abf-picker abf-picker-wide">
                <span>Evidence group</span>
                <select
                  value={shownGroup}
                  onChange={blurAfter(pickGroup)}
                  data-testid="abf-group"
                >
                  {EVIDENCE_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {GROUP_LABELS[g]} ({counts[g]})
                    </option>
                  ))}
                  {showSample && (
                    <option value={SAMPLE_GROUP}>
                      {SAMPLE_LABEL} ({sampleCount(facets, reviewStatus)})
                    </option>
                  )}
                </select>
              </label>
              <label className="abf-picker">
                <span>Project</span>
                <select
                  value={selection?.projectPublicId ?? NONE}
                  onChange={blurAfter(pickProject)}
                  data-testid="abf-project"
                  disabled={projects.length === 0}
                >
                  {projects.length === 0 && <option value={NONE}>—</option>}
                  {projects.map((p) => (
                    <option key={p.projectPublicId ?? NONE} value={p.projectPublicId ?? NONE}>
                      {p.projectName} ({p.count})
                    </option>
                  ))}
                </select>
              </label>
              <label className="abf-picker">
                <span>Year</span>
                <select
                  value={selection?.year == null ? NONE : String(selection.year)}
                  onChange={blurAfter(pickYear)}
                  data-testid="abf-year"
                  disabled={years.length === 0}
                >
                  {years.length === 0 && <option value={NONE}>—</option>}
                  {years.map((y) => (
                    <option key={y.year ?? NONE} value={y.year == null ? NONE : String(y.year)}>
                      {y.year == null ? "Bill gone" : y.year} ({y.count})
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      )}

      {run && (
        <div className="abf-run-summary" data-testid="abf-run-summary">
          Run: {run.candidate_count} candidates · pending {run.pending} · approved {run.approved} · rejected{" "}
          {run.rejected} · linked {run.linked}
        </div>
      )}

      {sample && (
        <div className="abf-run-summary" data-testid="abf-sample-progress">
          Sample: {sample.decided} of {sample.total} decided
        </div>
      )}

      {sampleShown && (
        <p className="text-muted" data-testid="abf-sample-note">
          {sample ? `All ${sample.total}, randomly selected` : "Sample closed"}
        </p>
      )}

      {facetsQuery.isSuccess && !shownGroup && (
        <p className="text-muted" data-testid="abf-nothing">
          Nothing to review in this status.
        </p>
      )}

      {groupEmpty && (
        <p className="text-muted" data-testid="abf-group-empty">
          Nothing in this batch.
        </p>
      )}

      {runId && selection && batchKey && (
        <ReviewQueue
          key={batchKey}
          runPublicId={runId}
          selection={selection}
          reviewStatus={reviewStatus}
          batchTotal={batchCount(facets, selection, reviewStatus)}
          onDecided={() => {
            void queryClient.invalidateQueries({ queryKey: [ATTACHMENT_BACKFILL_KEY_PREFIX] });
          }}
        />
      )}

      <p className="abf-keys text-muted">
        Keys: A approve · R reject (1–6 reason, Esc cancel) · U undo · J next · K previous
      </p>
    </div>
  );
}
