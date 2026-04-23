/**
 * React hook for driving a threaded agent conversation over SSE.
 *
 *   const { state, entries, start, cancel, reset, loadConversation, recent }
 *     = useAgentRun("scout");
 *
 * Each call to start(message) appends a user entry + a new agent entry
 * to the conversation. Routing:
 *   - No prior head → POST /runs (fresh conversation)
 *   - Prior head   → POST /runs/{head}/continue (follow-up)
 *
 * Call reset() to archive the current conversation (if non-empty) and
 * start fresh. Call loadConversation(id) to restore a past one.
 *
 * Storage model (keyed by agent name):
 *   intelligence.conversation.<agent>.v1  — the in-progress / most recent
 *   intelligence.conversations.<agent>.v1 — archived list, newest first, max MAX_RECENT
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  approveAgentRun,
  cancelAgentRun,
  continueAgentRun,
  startAgentRun,
  streamAgentEvents,
} from "./sseClient";
import type {
  AgentRunHandle,
  ApprovalEntry,
  ConversationEntry,
  ConversationSummary,
  LoopEvent,
  RunError,
  RunState,
  Turn,
  Usage,
} from "./types";


const STORAGE_VERSION = 1;
const MAX_RECENT = 10;


function currentKey(agentName: string): string {
  return `intelligence.conversation.${agentName}.v${STORAGE_VERSION}`;
}

function recentKey(agentName: string): string {
  return `intelligence.conversations.${agentName}.v${STORAGE_VERSION}`;
}


interface StoredConversation {
  version: number;
  entries: ConversationEntry[];
}

interface StoredRecent {
  version: number;
  items: ConversationSummary[];
}


function loadCurrent(agentName: string): ConversationEntry[] {
  try {
    const raw = localStorage.getItem(currentKey(agentName));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredConversation;
    if (parsed.version !== STORAGE_VERSION) return [];
    if (!Array.isArray(parsed.entries)) return [];
    // Any running entry left over from a prior session is stale.
    return parsed.entries.map((e) =>
      e.kind === "agent" && e.state === "running"
        ? { ...e, state: "cancelled" as const }
        : e,
    );
  } catch {
    return [];
  }
}

function saveCurrent(agentName: string, entries: ConversationEntry[]): void {
  try {
    const payload: StoredConversation = { version: STORAGE_VERSION, entries };
    localStorage.setItem(currentKey(agentName), JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function clearCurrent(agentName: string): void {
  try {
    localStorage.removeItem(currentKey(agentName));
  } catch {
    // ignore
  }
}

function loadRecent(agentName: string): ConversationSummary[] {
  try {
    const raw = localStorage.getItem(recentKey(agentName));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredRecent;
    if (parsed.version !== STORAGE_VERSION) return [];
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items;
  } catch {
    return [];
  }
}

function saveRecent(agentName: string, items: ConversationSummary[]): void {
  try {
    const payload: StoredRecent = { version: STORAGE_VERSION, items };
    localStorage.setItem(recentKey(agentName), JSON.stringify(payload));
  } catch {
    // ignore
  }
}


function summarize(
  entries: ConversationEntry[],
  fallbackId: string,
): ConversationSummary {
  const firstUser = entries.find((e) => e.kind === "user");
  const rawTitle =
    firstUser && firstUser.kind === "user" ? firstUser.text : "Untitled";
  const title =
    rawTitle.length > 80 ? `${rawTitle.slice(0, 80)}…` : rawTitle;
  const head = computeHead(entries);
  return {
    id: head ?? fallbackId,
    title,
    archivedAt: new Date().toISOString(),
    entries,
  };
}


export function useAgentRun(agentName: string): AgentRunHandle {
  const [state, setState] = useState<RunState>("idle");
  const [entries, setEntries] = useState<ConversationEntry[]>(() =>
    loadCurrent(agentName),
  );
  const [recent, setRecent] = useState<ConversationSummary[]>(() =>
    loadRecent(agentName),
  );

  // Persist current conversation on every change.
  useEffect(() => {
    saveCurrent(agentName, entries);
  }, [agentName, entries]);

  // Persist the recent list on every change.
  useEffect(() => {
    saveRecent(agentName, recent);
  }, [agentName, recent]);

  // AbortController owns the in-flight fetch/stream lifecycle.
  const abortRef = useRef<AbortController | null>(null);
  // The session_public_id currently being streamed (live). Distinct from
  // currentHead which is the last COMPLETED session's id.
  const activePublicIdRef = useRef<string | null>(null);

  const currentHead = computeHead(entries);

  const archiveEntries = useCallback(
    (toArchive: ConversationEntry[]) => {
      if (toArchive.length === 0) return;
      const summary = summarize(toArchive, randomId());
      setRecent((prev) => {
        const deduped = prev.filter((c) => c.id !== summary.id);
        return [summary, ...deduped].slice(0, MAX_RECENT);
      });
    },
    [],
  );

  const start = useCallback(
    (userMessage: string) => {
      const trimmed = userMessage.trim();
      if (!trimmed) return;

      const now = Date.now();
      setState("running");
      setEntries((prev) => [
        ...prev,
        { kind: "user", text: trimmed },
        {
          kind: "agent",
          sessionPublicId: null,
          turns: [],
          state: "running",
          usage: null,
          costUsd: null,
          error: null,
          startedAt: now,
          completedAt: null,
        },
      ]);

      const abort = new AbortController();
      abortRef.current = abort;
      activePublicIdRef.current = null;

      const priorHead = currentHead;

      void (async () => {
        try {
          const publicId = priorHead
            ? await continueAgentRun(priorHead, trimmed, abort.signal)
            : await startAgentRun(agentName, trimmed, abort.signal);
          activePublicIdRef.current = publicId;
          setEntries((prev) =>
            updateLastAgent(prev, (agent) => ({
              ...agent,
              sessionPublicId: publicId,
            })),
          );

          for await (const event of streamAgentEvents(publicId, abort.signal)) {
            applyEvent(event, setEntries, setState);
            if (event.type === "done" || event.type === "error") {
              return;
            }
          }
        } catch (err: unknown) {
          const name = (err as { name?: string })?.name;
          const completedAt = Date.now();
          if (name === "AbortError") {
            setEntries((prev) =>
              updateLastAgent(prev, (a) => ({
                ...a,
                state: "cancelled",
                completedAt,
              })),
            );
            setState((prev) => (prev === "done" ? prev : "cancelled"));
            return;
          }
          const message = err instanceof Error ? err.message : "Unknown error";
          const runError: RunError = { message, code: null };
          setEntries((prev) =>
            updateLastAgent(prev, (a) => ({
              ...a,
              state: "error",
              error: runError,
              completedAt,
            })),
          );
          setState("error");
        } finally {
          abortRef.current = null;
        }
      })();
    },
    [agentName, currentHead],
  );

  const cancel = useCallback(() => {
    const publicId = activePublicIdRef.current;
    if (publicId) {
      void cancelAgentRun(publicId);
    }
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    // Archive whatever's currently loaded before dropping it.
    archiveEntries(entries);
    abortRef.current?.abort();
    abortRef.current = null;
    activePublicIdRef.current = null;
    setState("idle");
    setEntries([]);
    clearCurrent(agentName);
  }, [agentName, archiveEntries, entries]);

  const loadConversation = useCallback(
    (id: string) => {
      const target = recent.find((c) => c.id === id);
      if (!target) return;
      // Archive whatever's open first (unless it's the same one we're loading).
      if (entries.length > 0 && computeHead(entries) !== id) {
        archiveEntries(entries);
      }
      abortRef.current?.abort();
      abortRef.current = null;
      activePublicIdRef.current = null;
      setRecent((prev) => prev.filter((c) => c.id !== id));
      setEntries(target.entries);
      setState("idle");
    },
    [archiveEntries, entries, recent],
  );

  const approve = useCallback(
    async (
      requestId: string,
      decision: "approve" | "reject" | "edit",
      editedInput?: Record<string, unknown>,
    ): Promise<void> => {
      // Find the approval entry to learn which session it belongs to.
      const target = entries.find(
        (e) => e.kind === "approval" && e.requestId === requestId,
      );
      if (!target || target.kind !== "approval") {
        throw new Error(`No pending approval with request_id ${requestId}`);
      }
      await approveAgentRun(
        target.sessionPublicId,
        requestId,
        decision,
        editedInput,
      );
      // Optimistically mark the local entry as decided so the UI
      // reflects the click immediately. The server's approval_decision
      // event will arrive shortly and confirm the same state.
      setEntries((prev) =>
        prev.map((e) =>
          e.kind === "approval" && e.requestId === requestId
            ? {
                ...e,
                status: decision === "reject" ? "rejected" : "approved",
                finalInput:
                  decision === "edit" ? (editedInput ?? {}) : e.proposedInput,
              }
            : e,
        ),
      );
    },
    [entries],
  );

  return {
    state,
    entries,
    currentHead,
    recent,
    start,
    cancel,
    reset,
    loadConversation,
    approve,
  };
}


function randomId(): string {
  // crypto.randomUUID is available in all supported browsers.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}


function computeHead(entries: ConversationEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.kind !== "agent") continue;
    if (e.state === "done" && e.sessionPublicId) return e.sessionPublicId;
  }
  return null;
}


function updateLastAgent(
  entries: ConversationEntry[],
  update: (
    agent: Extract<ConversationEntry, { kind: "agent" }>,
  ) => Extract<ConversationEntry, { kind: "agent" }>,
): ConversationEntry[] {
  if (entries.length === 0) return entries;
  const last = entries[entries.length - 1];
  if (last.kind !== "agent") return entries;
  return [...entries.slice(0, -1), update(last)];
}


function applyEvent(
  event: LoopEvent,
  setEntries: React.Dispatch<React.SetStateAction<ConversationEntry[]>>,
  setState: React.Dispatch<React.SetStateAction<RunState>>,
): void {
  switch (event.type) {
    case "turn_start": {
      const newTurn: Turn = {
        turn: event.turn,
        model: event.model,
        text: "",
        toolCalls: [],
        stopReason: null,
        complete: false,
      };
      setEntries((prev) =>
        updateLastAgent(prev, (a) => ({
          ...a,
          turns: [...a.turns, newTurn],
        })),
      );
      return;
    }
    case "text_delta": {
      setEntries((prev) =>
        updateLastAgent(prev, (a) => {
          if (a.turns.length === 0) return a;
          const lastTurn = a.turns[a.turns.length - 1];
          const updated: Turn = {
            ...lastTurn,
            text: lastTurn.text + event.text,
          };
          return { ...a, turns: [...a.turns.slice(0, -1), updated] };
        }),
      );
      return;
    }
    case "tool_call_start": {
      setEntries((prev) =>
        updateLastAgent(prev, (a) => {
          if (a.turns.length === 0) return a;
          const lastTurn = a.turns[a.turns.length - 1];
          const updated: Turn = {
            ...lastTurn,
            toolCalls: [
              ...lastTurn.toolCalls,
              {
                id: event.id,
                name: event.name,
                input: event.input,
                isError: false,
                complete: false,
              },
            ],
          };
          return { ...a, turns: [...a.turns.slice(0, -1), updated] };
        }),
      );
      return;
    }
    case "tool_call_end": {
      setEntries((prev) =>
        updateLastAgent(prev, (a) => ({
          ...a,
          turns: a.turns.map((turn) => ({
            ...turn,
            toolCalls: turn.toolCalls.map((tc) =>
              tc.id === event.id
                ? {
                    ...tc,
                    output: event.result.content,
                    isError: event.result.is_error,
                    complete: true,
                  }
                : tc,
            ),
          })),
        })),
      );
      return;
    }
    case "turn_end": {
      setEntries((prev) =>
        updateLastAgent(prev, (a) => {
          if (a.turns.length === 0) return a;
          const lastTurn = a.turns[a.turns.length - 1];
          const updated: Turn = {
            ...lastTurn,
            stopReason: event.stop_reason,
            complete: true,
          };
          return { ...a, turns: [...a.turns.slice(0, -1), updated] };
        }),
      );
      return;
    }
    case "done": {
      const usage: Usage = {
        input_tokens: event.usage.input_tokens,
        output_tokens: event.usage.output_tokens,
        cache_creation_input_tokens: event.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: event.usage.cache_read_input_tokens ?? 0,
      };
      const completedAt = Date.now();
      const costUsd = event.cost_usd ?? null;
      setEntries((prev) =>
        updateLastAgent(prev, (a) => ({
          ...a,
          state: "done",
          usage,
          costUsd,
          completedAt,
        })),
      );
      setState("done");
      return;
    }
    case "error": {
      const error: RunError = { message: event.message, code: event.code };
      const completedAt = Date.now();
      setEntries((prev) =>
        updateLastAgent(prev, (a) => ({
          ...a,
          state: "error",
          error,
          completedAt,
        })),
      );
      setState("error");
      return;
    }
    case "approval_request": {
      // Append an approval entry just after the current agent entry.
      // It inherits the agent entry's sessionPublicId so the approve
      // action can POST to the right URL.
      setEntries((prev) => {
        // Find the most recent agent entry to get its sessionPublicId.
        let sessionPublicId: string | null = null;
        for (let i = prev.length - 1; i >= 0; i--) {
          const e = prev[i];
          if (e.kind === "agent" && e.sessionPublicId) {
            sessionPublicId = e.sessionPublicId;
            break;
          }
        }
        if (!sessionPublicId) {
          // Shouldn't happen — the server always sets session_public_id
          // on the session row before emitting any events — but defend
          // gracefully.
          return prev;
        }
        const approval: ApprovalEntry = {
          kind: "approval",
          requestId: event.request_id,
          sessionPublicId,
          toolName: event.tool_name,
          summary: event.summary,
          proposedInput: event.proposed_input,
          inputSchema: event.input_schema,
          status: "pending",
          finalInput: null,
        };
        return [...prev, approval];
      });
      return;
    }
    case "approval_decision": {
      setEntries((prev) =>
        prev.map((e) =>
          e.kind === "approval" && e.requestId === event.request_id
            ? {
                ...e,
                status: event.decision,
                finalInput: event.final_input,
              }
            : e,
        ),
      );
      return;
    }
  }
}
