/**
 * React hook for driving a threaded agent conversation over SSE.
 *
 *   const { state, entries, start, cancel, reset, currentHead } = useAgentRun("scout");
 *
 * Each call to start(message) appends a user entry + a new agent entry
 * to the conversation. Routing:
 *   - No prior head → POST /runs (fresh conversation)
 *   - Prior head   → POST /runs/{head}/continue (follow-up)
 *
 * Call reset() to clear the conversation and forget the head.
 */
import { useCallback, useRef, useState } from "react";

import {
  cancelAgentRun,
  continueAgentRun,
  startAgentRun,
  streamAgentEvents,
} from "./sseClient";
import type {
  AgentRunHandle,
  ConversationEntry,
  LoopEvent,
  RunError,
  RunState,
  Turn,
  Usage,
} from "./types";


export function useAgentRun(agentName: string): AgentRunHandle {
  const [state, setState] = useState<RunState>("idle");
  const [entries, setEntries] = useState<ConversationEntry[]>([]);

  // AbortController owns the in-flight fetch/stream lifecycle.
  const abortRef = useRef<AbortController | null>(null);
  // The session_public_id currently being streamed (live). Distinct from
  // currentHead which is the last COMPLETED session's id.
  const activePublicIdRef = useRef<string | null>(null);

  const currentHead = computeHead(entries);

  const start = useCallback(
    (userMessage: string) => {
      const trimmed = userMessage.trim();
      if (!trimmed) return;

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
          error: null,
        },
      ]);

      const abort = new AbortController();
      abortRef.current = abort;
      activePublicIdRef.current = null;

      // Snapshot the head before we mutate entries — computeHead sees prior
      // state, so a continuation against the head is stable.
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
          if (name === "AbortError") {
            setEntries((prev) =>
              updateLastAgent(prev, (a) => ({ ...a, state: "cancelled" })),
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
    abortRef.current?.abort();
    abortRef.current = null;
    activePublicIdRef.current = null;
    setState("idle");
    setEntries([]);
  }, []);

  return {
    state,
    entries,
    currentHead,
    start,
    cancel,
    reset,
  };
}


/**
 * Compute the head of the conversation chain — the session_public_id of
 * the most recent COMPLETED agent entry. Used to route subsequent messages
 * through /continue. Returns null if no agent entry has completed yet.
 */
function computeHead(entries: ConversationEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.kind !== "agent") continue;
    if (e.state === "done" && e.sessionPublicId) return e.sessionPublicId;
  }
  return null;
}


/**
 * Update the last agent entry in the conversation. No-op if the last
 * entry is not an agent entry.
 */
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


/**
 * Apply a single LoopEvent to the conversation entries. Reducer-style.
 * All updates target the last agent entry.
 */
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
      };
      setEntries((prev) =>
        updateLastAgent(prev, (a) => ({
          ...a,
          state: "done",
          usage,
        })),
      );
      setState("done");
      return;
    }
    case "error": {
      const error: RunError = { message: event.message, code: event.code };
      setEntries((prev) =>
        updateLastAgent(prev, (a) => ({
          ...a,
          state: "error",
          error,
        })),
      );
      setState("error");
      return;
    }
  }
}
