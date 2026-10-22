import { useMemo, type ReactNode } from "react";
import type { LineItemFieldDef } from "../../components/InlineLineItems";
import {
  BILL_LINE_CHIP_CLASS,
  formatBillCreateCodingBadgeLabel,
  formatBillCreateProjectBadgeLabel,
  lineShowsProjectSuggestionMarker,
  lineShowsSuggestionBadgeFor,
  suggestionBadgeClassName,
  type LineCodingFields,
} from "./codingSuggestion";
import {
  billEditLine1FilePrefillAdornment,
  filePrefillLabel,
  type HeaderFormSlice,
} from "./filePrefillLabels";
import type { BillIntakePrediction } from "../../types/api";
import type { Line1PrefillMeta } from "./headerPrefill";
import Combobox from "../../components/ui/Combobox";

export { BILL_LINE_CHIP_CLASS };

/** Shared column width contract (U-676k / U-681). Attachment column is Edit-only (7.5rem fits LineItemAttachment + "Save first"). */
export const BILL_LINE_COL = {
  desc: { className: "bill-line-col-desc", contract: "24%" },
  scc: { className: "bill-line-col-scc", contract: "23%" },
  project: { className: "bill-line-col-project", contract: "21%" },
  qty: { className: "bill-line-col-qty", contract: "3.25rem" },
  rate: { className: "bill-line-col-rate", contract: "6.25rem" },
  amount: { className: "bill-line-col-amount", contract: "5.5rem" },
  markup: { className: "bill-line-col-markup", contract: "4.5rem" },
  price: { className: "bill-line-col-price", contract: "5.5rem" },
  billable: { className: "bill-line-col-billable", contract: "4.75rem" },
  attachment: { className: "bill-line-col-attachment", contract: "7.5rem" },
  actions: { className: "bill-line-col-actions", contract: "2rem" },
} as const;

export interface BillLineRow extends LineCodingFields {
  uid: string;
  description: string;
  quantity: string;
  rate: string;
  amount: string;
  markup: string;
  price: string;
  is_billable: boolean;
  public_id?: string;
  /** Edit: project outside UserProject scope */
  unresolved_project_id?: number;
}

/** Read-only money on bill lines — empty displays as $0.00 (Create + Edit footer/table). */
export function fmtBillLineMoney(v: string): string {
  if (!v) return "$0.00";
  const n = Number(v);
  if (isNaN(n)) return v;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export {
  vendorComboboxOptions,
  sccComboboxOptions,
  projectComboboxOptions,
  projectOptionLabel,
} from "../../components/ui/pickerOptions";

export const UNRESOLVED_PROJECT_VALUE = "__unresolved_project__";

export type BillLineFieldsMode = "create" | "edit";

export interface BuildBillLineFieldsOptions {
  mode: BillLineFieldsMode;
  sccOptions: { value: string; label: string }[];
  projectOptions: { value: string; label: string }[];
  /** Edit: gate suggestion chips to draft bills */
  showDraftBadges?: boolean;
  /** Create: uid of row that owns line-1 file prefill badges */
  line1PrefillUid?: string | null;
  line1Prefill?: Line1PrefillMeta;
  /** Edit line-1 file prefill adornments */
  intakePrediction?: BillIntakePrediction | null;
  formForPrefill?: HeaderFormSlice | null;
  onProjectHintChange?: (projectPublicId: string | undefined) => void;
}

function sccBadge(li: BillLineRow, show: boolean): ReactNode {
  if (!show || !lineShowsSuggestionBadgeFor(li)) return null;
  return (
    <div className="coding-suggestion-actions coding-suggestion-actions-compact">
      <span
        className={`${suggestionBadgeClassName(li.coding_suggestion_confidence ?? null)} ${BILL_LINE_CHIP_CLASS}`}
        title={li.coding_suggestion_reason ?? undefined}
      >
        {formatBillCreateCodingBadgeLabel(
          li.coding_suggestion_confidence ?? null,
          li.coding_suggestion_source,
          li.coding_prefill_origin,
        )}
      </span>
    </div>
  );
}

function projectBadge(li: BillLineRow, show: boolean): ReactNode {
  if (!show || !lineShowsProjectSuggestionMarker(li)) return null;
  return (
    <div className="coding-suggestion-actions coding-suggestion-actions-compact">
      <span
        className={`status-badge coding-suggested ${BILL_LINE_CHIP_CLASS}`}
        title="Project predicted from the bill's attachment text"
      >
        {formatBillCreateProjectBadgeLabel(li.coding_project_prefill_origin)}
      </span>
    </div>
  );
}

function BillLineProjectCombobox({
  li,
  opts,
  update,
}: {
  li: BillLineRow;
  opts: BuildBillLineFieldsOptions;
  update: (value: string) => void;
}) {
  const projectValue =
    opts.mode === "edit"
      ? li.project_public_id ||
        (li.unresolved_project_id != null ? UNRESOLVED_PROJECT_VALUE : "")
      : li.project_public_id;

  const projectOptions = useMemo(() => {
    if (opts.mode === "edit" && li.unresolved_project_id != null) {
      return [
        {
          value: UNRESOLVED_PROJECT_VALUE,
          label: `Project #${li.unresolved_project_id} (not in your projects)`,
          disabled: true as const,
        },
        ...opts.projectOptions,
      ];
    }
    return opts.projectOptions;
  }, [li.unresolved_project_id, opts.mode, opts.projectOptions]);

  return (
    <Combobox
      variant="inline"
      ariaLabel="Project"
      options={projectOptions}
      maxResults={Infinity}
      value={projectValue ?? ""}
      placeholder="—"
      onChange={(value) => {
        if (value === UNRESOLVED_PROJECT_VALUE) return;
        opts.onProjectHintChange?.(value || undefined);
        update(value);
      }}
    />
  );
}

function line1Adornment(
  opts: BuildBillLineFieldsOptions,
  li: BillLineRow,
  index: number,
  field: "description" | "rate" | "amount",
): ReactNode {
  if (opts.mode === "create") {
    return li.uid === opts.line1PrefillUid
      ? filePrefillLabel(opts.line1Prefill ?? {}, field, true)
      : null;
  }
  if (index !== 0) return null;
  return billEditLine1FilePrefillAdornment(
    opts.intakePrediction ?? null,
    opts.formForPrefill ?? null,
    li,
    field,
  );
}

export function buildBillLineFields(
  opts: BuildBillLineFieldsOptions,
): LineItemFieldDef<BillLineRow>[] {
  const showBadges = opts.mode === "create" || !!opts.showDraftBadges;

  return [
    {
      key: "description",
      label: "Description",
      col: BILL_LINE_COL.desc,
      adornment: (li, index) => line1Adornment(opts, li, index, "description"),
    },
    {
      key: "sub_cost_code_id",
      label: "Sub Cost Code",
      col: BILL_LINE_COL.scc,
      adornment: (li) => sccBadge(li, showBadges),
      render: (li, _index, update) => (
        <Combobox
          variant="inline"
          ariaLabel="Sub Cost Code"
          options={opts.sccOptions}
          maxResults={Infinity}
          value={li.sub_cost_code_id ?? ""}
          onChange={(v) => update(v)}
          placeholder="—"
        />
      ),
    },
    {
      key: "project_public_id",
      label: "Project",
      col: BILL_LINE_COL.project,
      render: (li, _index, update) => (
        <BillLineProjectCombobox li={li} opts={opts} update={update} />
      ),
      adornment: (li) => projectBadge(li, showBadges),
    },
    {
      key: "quantity",
      label: "Qty",
      type: "number",
      align: "right",
      col: BILL_LINE_COL.qty,
    },
    {
      key: "rate",
      label: "Rate",
      type: "number",
      align: "right",
      col: BILL_LINE_COL.rate,
      adornment: (li, index) => line1Adornment(opts, li, index, "rate"),
    },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      readOnly: true,
      col: BILL_LINE_COL.amount,
      format: (v) => fmtBillLineMoney(String(v ?? "")),
      adornment: (li, index) =>
        opts.mode === "edit" ? line1Adornment(opts, li, index, "amount") : null,
    },
    {
      key: "markup",
      label: "Markup",
      type: "number",
      align: "right",
      placeholder: "0.10",
      col: BILL_LINE_COL.markup,
    },
    {
      key: "price",
      label: "Price",
      align: "right",
      readOnly: true,
      col: BILL_LINE_COL.price,
      format: (v) => fmtBillLineMoney(String(v ?? "")),
    },
    {
      key: "is_billable",
      label: "Billable",
      type: "checkbox",
      align: "center",
      col: BILL_LINE_COL.billable,
    },
  ];
}
