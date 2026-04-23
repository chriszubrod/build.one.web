/**
 * RecordCard — structured rendering of a single entity record that scout
 * emits as a fenced `record` JSON block at the end of its answer.
 *
 * The tray's parser strips the block from the markdown text and hands the
 * parsed object here. Unknown entity types fall through silently — we
 * never render partial or malformed cards.
 */
import { useState } from "react";
import { Link } from "react-router-dom";


interface SubCostCodeRecord {
  entity: "sub_cost_code";
  number?: string | null;
  name?: string | null;
  public_id?: string | null;
  description?: string | null;
  aliases?: string | null;
  parent?: {
    entity?: "cost_code";
    number?: string | null;
    name?: string | null;
  } | null;
}

interface CostCodeRecord {
  entity: "cost_code";
  number?: string | null;
  name?: string | null;
  public_id?: string | null;
  description?: string | null;
}

export type AgentRecord = SubCostCodeRecord | CostCodeRecord;


export default function RecordCard({ record }: { record: AgentRecord }) {
  if (record.entity === "sub_cost_code") {
    return <SubCostCodeCard record={record} />;
  }
  if (record.entity === "cost_code") {
    return <CostCodeCard record={record} />;
  }
  // Unknown entity — ignore.
  return null;
}


function SubCostCodeCard({ record }: { record: SubCostCodeRecord }) {
  const headerInner = (
    <>
      <span className="scout-record-entity">sub-cost-code</span>
      <span className="scout-record-number">{record.number ?? "—"}</span>
      <span className="scout-record-name">{record.name ?? "—"}</span>
    </>
  );
  return (
    <div className="scout-record scout-record-sub-cost-code">
      {record.public_id ? (
        <Link
          to={entityRoute("sub_cost_code", record.public_id)}
          className="scout-record-header scout-record-header-link"
          title="Open sub-cost-code page"
        >
          {headerInner}
        </Link>
      ) : (
        <div className="scout-record-header">{headerInner}</div>
      )}
      <dl className="scout-record-fields">
        {record.description ? (
          <>
            <dt>Description</dt>
            <dd>{record.description}</dd>
          </>
        ) : null}
        {record.aliases ? (
          <>
            <dt>Aliases</dt>
            <dd><code>{record.aliases}</code></dd>
          </>
        ) : null}
        {record.parent ? (
          <>
            <dt>Parent</dt>
            <dd>
              <ParentPill parent={record.parent} />
            </dd>
          </>
        ) : null}
        {record.public_id ? (
          <>
            <dt>Public ID</dt>
            <dd><CopyableCode value={record.public_id} /></dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}


function CostCodeCard({ record }: { record: CostCodeRecord }) {
  const headerInner = (
    <>
      <span className="scout-record-entity">cost code</span>
      <span className="scout-record-number">{record.number ?? "—"}</span>
      <span className="scout-record-name">{record.name ?? "—"}</span>
    </>
  );
  return (
    <div className="scout-record scout-record-cost-code">
      {record.public_id ? (
        <Link
          to={entityRoute("cost_code", record.public_id)}
          className="scout-record-header scout-record-header-link"
          title="Open cost code page"
        >
          {headerInner}
        </Link>
      ) : (
        <div className="scout-record-header">{headerInner}</div>
      )}
      <dl className="scout-record-fields">
        {record.description ? (
          <>
            <dt>Description</dt>
            <dd>{record.description}</dd>
          </>
        ) : null}
        {record.public_id ? (
          <>
            <dt>Public ID</dt>
            <dd><CopyableCode value={record.public_id} /></dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}


function ParentPill({
  parent,
}: {
  parent: NonNullable<SubCostCodeRecord["parent"]>;
}) {
  // Parent has no public_id in the record block (we don't surface it),
  // so this stays non-clickable for now. Could be linkified once we
  // include parent.public_id in the record schema.
  return (
    <span className="scout-record-pill">
      <span className="scout-record-pill-entity">cost code</span>
      <span className="scout-record-pill-number">
        {parent.number ?? "—"}
      </span>
      <span className="scout-record-pill-name">{parent.name ?? "—"}</span>
    </span>
  );
}


/**
 * Map a record's entity name to the React route for that entity. Mirrors
 * the route patterns in App.tsx — entity names use hyphens, not underscores.
 */
function entityRoute(entity: string, publicId: string): string {
  const slug = entity.replace(/_/g, "-");
  return `/${slug}/${publicId}`;
}


function CopyableCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access blocked (e.g., non-HTTPS). Silently ignore.
    }
  };

  return (
    <code
      className="scout-record-copyable"
      onClick={onClick}
      title="Click to copy"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void onClick();
        }
      }}
    >
      {value}
      <span className="scout-record-copied" aria-hidden={!copied}>
        {copied ? "copied" : "copy"}
      </span>
    </code>
  );
}


/**
 * Extract the first ```record ... ``` block from a text response and
 * return the parsed record plus the text with the block stripped.
 *
 * If no block is present, the text is returned unchanged. If a block is
 * present but the JSON is malformed, we treat it as absent rather than
 * show a garbled card.
 */
export function extractRecord(
  text: string,
): { cleanedText: string; record: AgentRecord | null } {
  // Accept ```record (any whitespace after) ... ``` with newlines. The
  // closing fence may or may not be preceded by a newline.
  const re = /```record\s*\n([\s\S]*?)\n?```/;
  const match = text.match(re);
  if (!match) return { cleanedText: text, record: null };
  let record: AgentRecord | null = null;
  try {
    record = JSON.parse(match[1]) as AgentRecord;
  } catch {
    return { cleanedText: text, record: null };
  }
  const cleanedText = text.replace(re, "").replace(/\n{3,}/g, "\n\n").trim();
  return { cleanedText, record };
}
