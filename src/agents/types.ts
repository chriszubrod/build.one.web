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
  | { type: "done"; reason: string; usage: Usage }
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
export type ConversationEntry =
  | { kind: "user"; text: string }
  | {
      kind: "agent";
      sessionPublicId: string | null;
      turns: Turn[];
      state: RunState;          // per-entry state (running while this is the live one)
      usage: Usage | null;
      error: RunError | null;
    };

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
}
