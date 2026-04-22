/**
 * Low-level SSE client using fetch + ReadableStream.
 *
 * Browsers' native EventSource can't send Authorization headers, which our
 * bearer-token auth requires. This module replaces it with a minimal hand-
 * parsed stream that:
 *   - Sends Authorization: Bearer <token> from localStorage
 *   - Yields parsed {event, data} records as an async generator
 *   - Propagates AbortSignal cleanly (for cancel / unmount)
 *
 * SSE wire format (matches what intelligence/api/router.py emits):
 *   event: <type>\n
 *   data: <json>\n
 *   \n
 */
import type { LoopEvent } from "./types";


// Match the rest of the app: hit VITE_API_BASE_URL when set (prod from
// local dev, or prod itself); fall back to the Vite proxy via relative
// paths when unset.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";


export interface SSEEnvelope<T> {
  event: string;
  data: T;
}


/**
 * Parse an SSE response body into a stream of {event, data} pairs.
 */
async function* parseSSE<T>(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<SSEEnvelope<T>> {
  if (!response.body) {
    throw new Error("SSE response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal.aborted) {
        await reader.cancel();
        return;
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line (\n\n).
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const parsed = parseRecord<T>(raw);
        if (parsed) yield parsed;
      }
    }

    // Flush any trailing record if the stream ended without a final blank line.
    if (buffer.trim()) {
      const parsed = parseRecord<T>(buffer);
      if (parsed) yield parsed;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}


function parseRecord<T>(raw: string): SSEEnvelope<T> | null {
  let event = "";
  let dataStr = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      // Strip exactly one leading space per SSE spec.
      dataStr += line.slice(5).replace(/^ /, "");
    }
    // Comments (":") and other fields ignored.
  }
  if (!event || !dataStr) return null;
  try {
    return { event, data: JSON.parse(dataStr) as T };
  } catch {
    return null;
  }
}


/**
 * Open the SSE stream for an active (or completed) agent session and yield
 * each LoopEvent as it arrives.
 */
export async function* streamAgentEvents(
  publicId: string,
  signal: AbortSignal,
): AsyncGenerator<LoopEvent> {
  const token = localStorage.getItem("access_token");
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/v1/agents/runs/${publicId}/events`, {
    method: "GET",
    headers,
    signal,
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Event stream failed: HTTP ${res.status}`);
  }

  for await (const envelope of parseSSE<LoopEvent>(res, signal)) {
    yield envelope.data;
  }
}


/**
 * Start a new agent run. Returns the session public_id.
 */
export async function startAgentRun(
  agentName: string,
  userMessage: string,
  signal: AbortSignal,
): Promise<string> {
  const token = localStorage.getItem("access_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/v1/agents/${agentName}/runs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ user_message: userMessage }),
    signal,
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to start run: HTTP ${res.status}${text ? `: ${text}` : ""}`);
  }
  const body = (await res.json()) as { data: { session_public_id: string } };
  return body.data.session_public_id;
}


/**
 * Continue an existing conversation by posting a follow-up user_message.
 * Returns the NEW session's public_id (the new head of the thread).
 */
export async function continueAgentRun(
  previousPublicId: string,
  userMessage: string,
  signal: AbortSignal,
): Promise<string> {
  const token = localStorage.getItem("access_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(
    `${API_BASE}/api/v1/agents/runs/${previousPublicId}/continue`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ user_message: userMessage }),
      signal,
      credentials: "include",
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to continue run: HTTP ${res.status}${text ? `: ${text}` : ""}`,
    );
  }
  const body = (await res.json()) as { data: { session_public_id: string } };
  return body.data.session_public_id;
}


/**
 * Request cancellation of an in-flight run. Server returns 403 if the caller
 * is not the run's requesting user.
 */
export async function cancelAgentRun(publicId: string): Promise<void> {
  const token = localStorage.getItem("access_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  await fetch(`${API_BASE}/api/v1/agents/runs/${publicId}/cancel`, {
    method: "POST",
    headers,
    credentials: "include",
  });
  // Fire-and-forget — the stream will end when the server publishes the error.
}
