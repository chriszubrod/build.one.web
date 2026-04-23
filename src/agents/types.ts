/**
 * Types for interacting with the intelligence layer's SSE API.
 *
 * LoopEvent mirrors the shapes emitted by the server (intelligence/loop/events.py).
 * Turn / ToolCall / Usage are the accumulated view the hook exposes to React.
 * ConversationEntry groups user messages and agent responses into a
 * renderable chat thread.
 */

// ─── Raw server events (matches LoopEvent variants) ──────────────────────

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface ToolResultPayload {
  content: string | unknown[];
  is_error: boolean;
}

export type LoopEvent =
  | { type: "turn_start"; turn: number; model: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_call_start"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_call_end"; id: string; name: string; result: ToolResultPayload }
  | { type: "turn_end"; turn: number; usage: Usage; stop_reason: string | null }
  | {
      type: "approval_request";
      request_id: string;
      tool_name: string;
      summary: string;
      proposed_input: Record<string, unknown>;
      input_schema: Record<string, unknown>;
    }
  | {
      type: "approval_decision";
      request_id: string;
      decision: "approved" | "rejected" | "timed_out";
      final_input: Record<string, unknown> | null;
      decided_by: string | null;
    }
  | { type: "done"; reason: string; usage: Usage; cost_usd?: number | null }
  | { type: "error"; message: string; code: string | null };

// ─── Accumulated state exposed by the hook ───────────────────────────────

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string | unknown[];
  isError: boolean;
  complete: boolean;
}

export interface Turn {
  turn: number;
  model: string;
  text: string;
  toolCalls: ToolCall[];
  stopReason: string | null;
  complete: boolean;
}

export type RunState =
  | "idle"
  | "running"
  | "done"
  | "error"
  | "cancelled";

export interface RunError {
  message: string;
  code: string | null;
}

/**
 * A single entry in the conversation. Each user message is followed by
 * an agent entry holding the scout's turns for that message.
 */
/**
 * Approval state — mirrors server-side status literals except that we
 * also carry "pending" for the in-flight client-side state before the
 * server responds.
 */
export type ApprovalStatus = "pending" | "approved" | "rejected" | "timed_out";


export interface ApprovalEntry {
  kind: "approval";
  requestId: string;
  sessionPublicId: string;     // the agent run this approval belongs to (for POST /approve)
  toolName: string;
  summary: string;
  proposedInput: Record<string, unknown>;
  inputSchema: Record<string, unknown>;
  status: ApprovalStatus;
  finalInput: Record<string, unknown> | null;
}


export type ConversationEntry =
  | { kind: "user"; text: string }
  | {
      kind: "agent";
      sessionPublicId: string | null;
      turns: Turn[];
      state: RunState;          // per-entry state (running while this is the live one)
      usage: Usage | null;
      costUsd: number | null;   // server-computed; null when pricing unknown for the model
      error: RunError | null;
      startedAt: number;        // ms since epoch when start() fired
      completedAt: number | null; // ms when done/error/cancelled landed
    }
  | ApprovalEntry;

export interface ConversationSummary {
  /** Stable client-side id — equal to the conversation's last known head, or a generated UUID for very short threads. */
  id: string;
  /** Derived from the first user message. Truncated. */
  title: string;
  /** ISO timestamp of when this conversation was archived. */
  archivedAt: string;
  /** Full entries array — we store the whole thing in localStorage. */
  entries: ConversationEntry[];
}


export interface AgentRunHandle {
  /** Run state of the most recent message (idle if no messages yet). */
  state: RunState;
  /** Full conversation — user messages alternating with agent responses. */
  entries: ConversationEntry[];
  /** Head of the conversation chain (most recent completed session_public_id), if any. */
  currentHead: string | null;
  /** Past conversations, newest first. Populated from localStorage. */
  recent: ConversationSummary[];
  /** Start a new message. Routes to /continue if there's a head, /runs otherwise. */
  start: (userMessage: string) => void;
  /** Cancel the in-flight message. */
  cancel: () => void;
  /** Archive the current conversation (if non-empty) and clear. */
  reset: () => void;
  /** Load a past conversation as the current one. Archives the currently-open conversation first. */
  loadConversation: (id: string) => void;
  /**
   * Respond to an approval request. `decision` is the user's intent:
   *   - "approve" → run with the proposed input
   *   - "edit"    → run with `editedInput` (must be provided)
   *   - "reject"  → skip the action
   */
  approve: (
    requestId: string,
    decision: "approve" | "reject" | "edit",
    editedInput?: Record<string, unknown>,
  ) => Promise<void>;
}
