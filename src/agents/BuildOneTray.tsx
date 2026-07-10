/**
 * BuildOneTray — the Build.One chat UI rendered as a right-side drawer.
 *
 * Conversation-aware: renders alternating user bubbles and agent response
 * groups (each group holds the Build.One's turns for that message). A "New
 * Conversation" button in the tray header clears the thread.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useAgentRun } from "./useAgentRun";
import RecordCard, { extractRecord } from "./RecordCard";
import ApprovalCard from "./ApprovalCard";
import type {
  ConversationEntry,
  ConversationSummary,
  Turn,
  ToolCall,
} from "./types";


interface BuildOneTrayProps {
  open: boolean;
  onClose: () => void;
}


const PROMPT_MAX_HEIGHT = 200;


export default function BuildOneTray({ open, onClose }: BuildOneTrayProps) {
  const run = useAgentRun("buildone");
  const [prompt, setPrompt] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Autoscroll as new events land.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [run.entries, run.state]);

  // Close on Esc; autofocus input when tray opens.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Auto-resize the textarea.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, PROMPT_MAX_HEIGHT)}px`;
  }, [prompt]);

  const submit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || run.state === "running") return;
    run.start(trimmed);
    setPrompt("");
  }, [prompt, run]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const running = run.state === "running";
  const hasConversation = run.entries.length > 0;

  return (
    <aside
      className={`buildone-tray${open ? " buildone-tray-open" : ""}`}
      aria-hidden={!open}
    >
      <div className="buildone-tray-inner">
        <header className="buildone-tray-header">
          <h2 className="buildone-tray-title">Build.One</h2>
          <div className="buildone-tray-header-actions">
            {!running && (hasConversation || run.recent.length > 0) && (
              <HistoryMenu
                recent={run.recent}
                onNew={run.reset}
                onLoad={run.loadConversation}
                disableNewWhenEmpty={!hasConversation}
              />
            )}
            <button
              type="button"
              className="buildone-tray-close"
              onClick={onClose}
              aria-label="Close Build.One"
            >
              ×
            </button>
          </div>
        </header>

        <div className="buildone-tray-body">
          {!hasConversation && !running && (
            <p className="buildone-empty">
              Ask about your data. Current scope: sub-cost-codes.
            </p>
          )}
          {run.entries.map((entry, i) => (
            <EntryBubble key={i} entry={entry} onApprove={run.approve} />
          ))}
          {running && isAwaitingFirstEvent(run.entries) && (
            <ThinkingIndicator
              label={
                hasSessionId(run.entries) ? "Connecting to Build.One…" : "Starting session…"
              }
            />
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="buildone-tray-form">
          <textarea
            ref={inputRef}
            className="buildone-prompt"
            placeholder={running ? "Build.One is working…" : "Ask Build.One…"}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={running}
            rows={1}
          />
          <div className="buildone-tray-form-actions">
            {running && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={run.cancel}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={running || !prompt.trim()}
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}


function HistoryMenu({
  recent,
  onNew,
  onLoad,
  disableNewWhenEmpty,
}: {
  recent: ConversationSummary[];
  onNew: () => void;
  onLoad: (id: string) => void;
  disableNewWhenEmpty: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="buildone-history" ref={ref}>
      <button
        type="button"
        className="buildone-history-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        History ▾
      </button>
      {open && (
        <div className="buildone-history-panel" role="menu">
          <button
            type="button"
            className="buildone-history-new"
            onClick={() => {
              onNew();
              setOpen(false);
            }}
            disabled={disableNewWhenEmpty}
            role="menuitem"
          >
            + Start new conversation
          </button>
          {recent.length > 0 && (
            <>
              <div className="buildone-history-sep" />
              <div className="buildone-history-label">Recent</div>
              <ul className="buildone-history-list">
                {recent.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="buildone-history-item"
                      onClick={() => {
                        onLoad(c.id);
                        setOpen(false);
                      }}
                      role="menuitem"
                    >
                      <div className="buildone-history-title">{c.title}</div>
                      <div className="buildone-history-meta">
                        {relativeTime(c.archivedAt)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}


function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const s = Math.round(diffMs / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}


function isAwaitingFirstEvent(entries: ConversationEntry[]): boolean {
  if (entries.length === 0) return false;
  const last = entries[entries.length - 1];
  if (last.kind !== "agent") return false;
  // No lanes yet, or every lane is empty → no events have arrived.
  return (
    !Array.isArray(last.lanes) ||
    last.lanes.every((lane) => lane.turns.length === 0)
  );
}


function hasSessionId(entries: ConversationEntry[]): boolean {
  if (entries.length === 0) return false;
  const last = entries[entries.length - 1];
  return last.kind === "agent" && !!last.sessionPublicId;
}


function EntryBubble({
  entry,
  onApprove,
}: {
  entry: ConversationEntry;
  onApprove: (
    requestId: string,
    decision: "approve" | "reject" | "edit",
    editedInput?: Record<string, unknown>,
  ) => Promise<void>;
}) {
  if (entry.kind === "user") {
    return <UserBubble text={entry.text} />;
  }
  if (entry.kind === "approval") {
    return <ApprovalCard entry={entry} onDecide={onApprove} />;
  }
  return <AgentBlock entry={entry} />;
}


function UserBubble({ text }: { text: string }) {
  return (
    <div className="buildone-user-row">
      <div className="buildone-user-bubble">{text}</div>
    </div>
  );
}


function AgentBlock({
  entry,
}: {
  entry: Extract<ConversationEntry, { kind: "agent" }>;
}) {
  return (
    <div className="buildone-agent-block">
      {entry.lanes.map((lane) => {
        const isPrimary = lane.sourceSessionPublicId === null;
        if (lane.turns.length === 0) return null;
        return (
          <div
            key={lane.sourceSessionPublicId ?? "__primary__"}
            className={`buildone-lane${isPrimary ? "" : " buildone-lane-sub"}`}
          >
            {!isPrimary && (
              <div className="buildone-lane-header">
                ↳ delegated to{" "}
                <span className="buildone-lane-agent">
                  {lane.sourceAgentName ?? "sub-agent"}
                </span>
              </div>
            )}
            {lane.turns.map((turn, idx) => (
              <TurnBubble
                key={`${lane.sourceSessionPublicId ?? "p"}-${idx}-${turn.turn}`}
                turn={turn}
              />
            ))}
          </div>
        );
      })}
      {entry.state === "error" && entry.error && (
        <div className="buildone-error">
          <strong>Error:</strong> {entry.error.message}
          {entry.error.code ? ` (${entry.error.code})` : ""}
        </div>
      )}
      {entry.state === "cancelled" && (
        <div className="buildone-cancelled">Run cancelled.</div>
      )}
      {entry.state === "done" && entry.usage && (
        <div className="buildone-usage">
          in {entry.usage.input_tokens} · out {entry.usage.output_tokens}
          {(entry.usage.cache_read_input_tokens ?? 0) > 0 && (
            <> · cached {entry.usage.cache_read_input_tokens}</>
          )}
          {(entry.usage.cache_creation_input_tokens ?? 0) > 0 && (
            <> · wrote {entry.usage.cache_creation_input_tokens}</>
          )}
          {entry.completedAt && entry.startedAt
            ? ` · ${formatDuration(entry.completedAt - entry.startedAt)}`
            : ""}
          {typeof entry.costUsd === "number"
            ? ` · ${formatCost(entry.costUsd)}`
            : ""}
          {entry.sessionPublicId ? ` · ${shortId(entry.sessionPublicId)}` : ""}
        </div>
      )}
    </div>
  );
}


function ThinkingIndicator({ label }: { label: string }) {
  return (
    <div className="buildone-thinking" role="status" aria-live="polite">
      <span className="buildone-thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="buildone-thinking-label">{label}</span>
    </div>
  );
}


function TurnBubble({ turn }: { turn: Turn }) {
  return (
    <div className={`buildone-turn${turn.complete ? "" : " buildone-turn-live"}`}>
      <div className="buildone-turn-header">
        <span className="buildone-turn-number">Turn {turn.turn}</span>
        <span className="buildone-turn-model">{turn.model}</span>
      </div>

      {turn.toolCalls.length > 0 && (
        <ul className="buildone-tool-calls">
          {turn.toolCalls.map((tc) => (
            <li key={tc.id}>
              <ToolCallRow call={tc} />
            </li>
          ))}
        </ul>
      )}

      {turn.text && <TurnText text={turn.text} />}

      {!turn.complete && !turn.text && turn.toolCalls.length === 0 && (
        <div className="buildone-turn-waiting">Thinking…</div>
      )}
    </div>
  );
}


function TurnText({ text }: { text: string }) {
  const { cleanedText, record } = extractRecord(text);
  return (
    <div className="buildone-turn-text">
      {cleanedText && (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanedText}</ReactMarkdown>
      )}
      {record && <RecordCard record={record} />}
    </div>
  );
}


function ToolCallRow({ call }: { call: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = !call.complete ? "⋯" : call.isError ? "✗" : "✓";
  const statusClass = !call.complete
    ? "pending"
    : call.isError
    ? "error"
    : "ok";

  return (
    <div className={`buildone-tool-call buildone-tool-call-${statusClass}`}>
      <button
        type="button"
        className="buildone-tool-call-toggle"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="buildone-tool-call-status">{statusIcon}</span>
        <span className="buildone-tool-call-name">{call.name}</span>
        <span className="buildone-tool-call-chevron">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="buildone-tool-call-detail">
          <div className="buildone-tool-call-section">
            <div className="buildone-tool-call-label">input</div>
            <pre>{JSON.stringify(call.input, null, 2)}</pre>
          </div>
          {call.complete && (
            <div className="buildone-tool-call-section">
              <div className="buildone-tool-call-label">
                {call.isError ? "error" : "output"}
              </div>
              <pre>{renderOutput(call.output)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function renderOutput(output: string | unknown[] | undefined): string {
  if (output === undefined) return "";
  if (typeof output === "string") {
    try {
      return JSON.stringify(JSON.parse(output), null, 2);
    } catch {
      return output;
    }
  }
  return JSON.stringify(output, null, 2);
}


function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}


function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}


function formatCost(usd: number): string {
  if (usd <= 0) return "$0";
  if (usd < 0.001) return "<$0.001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
