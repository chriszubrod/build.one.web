/**
 * ScoutTray — the Scout chat UI rendered as a right-side drawer.
 *
 * Conversation-aware: renders alternating user bubbles and agent response
 * groups (each group holds the scout's turns for that message). A "New
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


interface ScoutTrayProps {
  open: boolean;
  onClose: () => void;
}


const PROMPT_MAX_HEIGHT = 200;


export default function ScoutTray({ open, onClose }: ScoutTrayProps) {
  const run = useAgentRun("scout");
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
      className={`scout-tray${open ? " scout-tray-open" : ""}`}
      aria-hidden={!open}
    >
      <div className="scout-tray-inner">
        <header className="scout-tray-header">
          <h2 className="scout-tray-title">Scout</h2>
          <div className="scout-tray-header-actions">
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
              className="scout-tray-close"
              onClick={onClose}
              aria-label="Close Scout"
            >
              ×
            </button>
          </div>
        </header>

        <div className="scout-tray-body">
          {!hasConversation && !running && (
            <p className="scout-empty">
              Ask about your data. Current scope: sub-cost-codes.
            </p>
          )}
          {run.entries.map((entry, i) => (
            <EntryBubble key={i} entry={entry} onApprove={run.approve} />
          ))}
          {running && isAwaitingFirstEvent(run.entries) && (
            <ThinkingIndicator
              label={
                hasSessionId(run.entries) ? "Connecting to scout…" : "Starting session…"
              }
            />
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="scout-tray-form">
          <textarea
            ref={inputRef}
            className="scout-prompt"
            placeholder={running ? "Scout is working…" : "Ask scout…"}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={running}
            rows={1}
          />
          <div className="scout-tray-form-actions">
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
    <div className="scout-history" ref={ref}>
      <button
        type="button"
        className="scout-history-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        History ▾
      </button>
      {open && (
        <div className="scout-history-panel" role="menu">
          <button
            type="button"
            className="scout-history-new"
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
              <div className="scout-history-sep" />
              <div className="scout-history-label">Recent</div>
              <ul className="scout-history-list">
                {recent.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="scout-history-item"
                      onClick={() => {
                        onLoad(c.id);
                        setOpen(false);
                      }}
                      role="menuitem"
                    >
                      <div className="scout-history-title">{c.title}</div>
                      <div className="scout-history-meta">
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
  return last.kind === "agent" && last.turns.length === 0;
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
    <div className="scout-user-row">
      <div className="scout-user-bubble">{text}</div>
    </div>
  );
}


function AgentBlock({
  entry,
}: {
  entry: Extract<ConversationEntry, { kind: "agent" }>;
}) {
  return (
    <div className="scout-agent-block">
      {entry.turns.map((turn) => (
        <TurnBubble key={turn.turn} turn={turn} />
      ))}
      {entry.state === "error" && entry.error && (
        <div className="scout-error">
          <strong>Error:</strong> {entry.error.message}
          {entry.error.code ? ` (${entry.error.code})` : ""}
        </div>
      )}
      {entry.state === "cancelled" && (
        <div className="scout-cancelled">Run cancelled.</div>
      )}
      {entry.state === "done" && entry.usage && (
        <div className="scout-usage">
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
    <div className="scout-thinking" role="status" aria-live="polite">
      <span className="scout-thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="scout-thinking-label">{label}</span>
    </div>
  );
}


function TurnBubble({ turn }: { turn: Turn }) {
  return (
    <div className={`scout-turn${turn.complete ? "" : " scout-turn-live"}`}>
      <div className="scout-turn-header">
        <span className="scout-turn-number">Turn {turn.turn}</span>
        <span className="scout-turn-model">{turn.model}</span>
      </div>

      {turn.toolCalls.length > 0 && (
        <ul className="scout-tool-calls">
          {turn.toolCalls.map((tc) => (
            <li key={tc.id}>
              <ToolCallRow call={tc} />
            </li>
          ))}
        </ul>
      )}

      {turn.text && <TurnText text={turn.text} />}

      {!turn.complete && !turn.text && turn.toolCalls.length === 0 && (
        <div className="scout-turn-waiting">Thinking…</div>
      )}
    </div>
  );
}


function TurnText({ text }: { text: string }) {
  const { cleanedText, record } = extractRecord(text);
  return (
    <div className="scout-turn-text">
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
    <div className={`scout-tool-call scout-tool-call-${statusClass}`}>
      <button
        type="button"
        className="scout-tool-call-toggle"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="scout-tool-call-status">{statusIcon}</span>
        <span className="scout-tool-call-name">{call.name}</span>
        <span className="scout-tool-call-chevron">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="scout-tool-call-detail">
          <div className="scout-tool-call-section">
            <div className="scout-tool-call-label">input</div>
            <pre>{JSON.stringify(call.input, null, 2)}</pre>
          </div>
          {call.complete && (
            <div className="scout-tool-call-section">
              <div className="scout-tool-call-label">
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
