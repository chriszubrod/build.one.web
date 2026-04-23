/**
 * ApprovalCard — renders a pending approval request in the conversation
 * tray. The user sees the tool name, a one-line summary, and the
 * proposed input fields. Three actions: Reject, Edit, Approve.
 *
 * Edit mode auto-generates a form from the tool's JSON Schema. The form
 * handles primitive types (string, number, integer, boolean) natively;
 * nested objects and arrays fall back to a JSON textarea as an escape
 * hatch. This is deliberately minimal — a fancier renderer can come
 * later if tools demand it.
 */
import { useState, type ChangeEvent } from "react";

import type { ApprovalEntry } from "./types";


interface Props {
  entry: ApprovalEntry;
  onDecide: (
    requestId: string,
    decision: "approve" | "reject" | "edit",
    editedInput?: Record<string, unknown>,
  ) => Promise<void>;
}


export default function ApprovalCard({ entry, onDecide }: Props) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<null | "approve" | "edit" | "reject">(null);
  const [error, setError] = useState<string | null>(null);
  const [editedInput, setEditedInput] = useState<Record<string, unknown>>(
    () => ({ ...entry.proposedInput }),
  );

  const pending = entry.status === "pending";
  const statusLabel =
    entry.status === "pending"
      ? "Pending approval"
      : entry.status === "approved"
      ? "Approved"
      : entry.status === "rejected"
      ? "Rejected"
      : "Timed out";

  const handle = async (
    decision: "approve" | "reject" | "edit",
  ) => {
    if (busy) return;
    setError(null);
    setBusy(decision);
    try {
      await onDecide(
        entry.requestId,
        decision,
        decision === "edit" ? editedInput : undefined,
      );
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit decision");
    } finally {
      setBusy(null);
    }
  };

  const currentDisplay = entry.finalInput ?? entry.proposedInput;
  const editedDiffers =
    JSON.stringify(editedInput) !== JSON.stringify(entry.proposedInput);

  return (
    <div
      className={`scout-approval scout-approval-${entry.status}`}
      role="region"
      aria-label="Approval request"
    >
      <header className="scout-approval-header">
        <span className="scout-approval-status">{statusLabel}</span>
        <span className="scout-approval-tool">{entry.toolName}</span>
      </header>

      <div className="scout-approval-summary">{entry.summary}</div>

      {!editing ? (
        <FieldTable values={currentDisplay} />
      ) : (
        <EditForm
          schema={entry.inputSchema}
          values={editedInput}
          onChange={setEditedInput}
          baseline={entry.proposedInput}
        />
      )}

      {error && <div className="scout-approval-error">{error}</div>}

      {pending && (
        <div className="scout-approval-actions">
          {editing ? (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setEditing(false);
                  setEditedInput({ ...entry.proposedInput });
                }}
                disabled={busy !== null}
              >
                Cancel edit
              </button>
              <div className="scout-approval-actions-spacer" />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handle(editedDiffers ? "edit" : "approve")}
                disabled={busy !== null}
              >
                {busy === "edit" || busy === "approve"
                  ? "Submitting…"
                  : editedDiffers
                  ? "Approve with edits"
                  : "Approve as-is"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handle("reject")}
                disabled={busy !== null}
              >
                {busy === "reject" ? "Rejecting…" : "Reject"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setEditing(true)}
                disabled={busy !== null}
              >
                Edit
              </button>
              <div className="scout-approval-actions-spacer" />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handle("approve")}
                disabled={busy !== null}
              >
                {busy === "approve" ? "Approving…" : "Approve"}
              </button>
            </>
          )}
        </div>
      )}

      {!pending && entry.finalInput && editedDiffers && (
        <div className="scout-approval-diff-note">
          Values differ from the original proposal.
        </div>
      )}
    </div>
  );
}


/**
 * Read-only table rendering of a flat (or simple nested) object.
 */
function FieldTable({ values }: { values: Record<string, unknown> }) {
  const keys = Object.keys(values);
  if (keys.length === 0) {
    return <div className="scout-approval-empty">(no fields)</div>;
  }
  return (
    <dl className="scout-approval-fields">
      {keys.map((k) => (
        <div key={k} className="scout-approval-field">
          <dt>{k}</dt>
          <dd>{renderValue(values[k])}</dd>
        </div>
      ))}
    </dl>
  );
}


function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}


/**
 * EditForm — auto-generated form from a tool's JSON Schema.
 * Handles primitive types inline; falls back to a JSON textarea for
 * anything unsupported (nested objects, arrays).
 */
function EditForm({
  schema,
  values,
  onChange,
  baseline,
}: {
  schema: Record<string, unknown>;
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  baseline: Record<string, unknown>;
}) {
  const properties =
    (schema?.properties as Record<string, unknown>) ?? {};
  // Merge schema-known fields with any extra keys present in values
  // (defensive — schema may lag or omit a field scout is passing).
  const keys = Array.from(
    new Set([...Object.keys(properties), ...Object.keys(values)]),
  );

  const setField = (key: string, value: unknown) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <div className="scout-approval-form">
      {keys.map((key) => {
        const fieldSchema = (properties[key] as Record<string, unknown>) ?? {};
        const value = values[key];
        const changed =
          JSON.stringify(value) !== JSON.stringify(baseline[key]);
        return (
          <FieldRow
            key={key}
            name={key}
            schema={fieldSchema}
            value={value}
            changed={changed}
            onChange={(v) => setField(key, v)}
          />
        );
      })}
    </div>
  );
}


function FieldRow({
  name,
  schema,
  value,
  changed,
  onChange,
}: {
  name: string;
  schema: Record<string, unknown>;
  value: unknown;
  changed: boolean;
  onChange: (v: unknown) => void;
}) {
  const type = schema.type as string | undefined;
  const description = (schema.description as string | undefined) ?? "";

  const labelClass = `scout-approval-form-label${changed ? " scout-approval-form-label-changed" : ""}`;

  // Boolean → checkbox
  if (type === "boolean") {
    const checked = Boolean(value);
    return (
      <label className="scout-approval-form-row">
        <span className={labelClass}>{name}</span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onChange(e.target.checked)
          }
        />
        {description && <span className="scout-approval-form-help">{description}</span>}
      </label>
    );
  }

  // Number / integer → number input
  if (type === "number" || type === "integer") {
    const num =
      typeof value === "number"
        ? String(value)
        : value == null
        ? ""
        : String(value);
    return (
      <label className="scout-approval-form-row">
        <span className={labelClass}>{name}</span>
        <input
          type="number"
          value={num}
          step={type === "integer" ? 1 : "any"}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const t = e.target.value;
            if (t === "") {
              onChange(null);
              return;
            }
            const n = type === "integer" ? parseInt(t, 10) : parseFloat(t);
            onChange(Number.isNaN(n) ? t : n);
          }}
        />
        {description && <span className="scout-approval-form-help">{description}</span>}
      </label>
    );
  }

  // String (default) → text input (textarea if the value is multiline-ish)
  if (type === "string" || type === undefined) {
    const str = value == null ? "" : String(value);
    const looksMultiline = str.length > 60 || str.includes("\n");
    return (
      <label className="scout-approval-form-row">
        <span className={labelClass}>{name}</span>
        {looksMultiline ? (
          <textarea
            className="scout-approval-form-textarea"
            value={str}
            rows={Math.min(6, Math.max(2, str.split("\n").length))}
            onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
          />
        ) : (
          <input
            type="text"
            value={str}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange(e.target.value === "" ? null : e.target.value)
            }
          />
        )}
        {description && <span className="scout-approval-form-help">{description}</span>}
      </label>
    );
  }

  // Fallback: JSON textarea for arrays, objects, unknown.
  const jsonStr = (() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value ?? "");
    }
  })();
  return (
    <label className="scout-approval-form-row">
      <span className={labelClass}>{name}</span>
      <textarea
        className="scout-approval-form-textarea"
        value={jsonStr}
        rows={4}
        onChange={(e) => {
          const t = e.target.value;
          try {
            onChange(JSON.parse(t));
          } catch {
            // Keep raw text so the user can finish typing; we re-parse
            // on next keystroke. Store as string in the meantime.
            onChange(t);
          }
        }}
      />
      {description && <span className="scout-approval-form-help">{description}</span>}
    </label>
  );
}
