/**
 * SSE client for /api/v1/auth/me/changes.
 *
 * Browsers' native EventSource can't attach Authorization headers, so we
 * hand-roll the stream with fetch. Mirrors the pattern in
 * src/agents/sseClient.ts but tailored to profile events.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export interface ProfileEvent {
  event: string;
  data: unknown;
}

/**
 * Subscribe to profile-change events. Calls onEvent for each envelope.
 * Returns an unsubscribe function that aborts the underlying stream.
 */
export function subscribeToProfileEvents(
  onEvent: (event: ProfileEvent) => void,
  onError?: (err: unknown) => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    const headers: Record<string, string> = {
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
    };

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/me/changes`, {
        method: "GET",
        headers,
        signal: controller.signal,
        credentials: "include",
      });
      if (!res.ok || !res.body) {
        onError?.(new Error(`profile SSE failed: HTTP ${res.status}`));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        if (controller.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const parsed = parseRecord(raw);
          if (parsed) onEvent(parsed);
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") onError?.(err);
    }
  })();

  return () => controller.abort();
}

function parseRecord(raw: string): ProfileEvent | null {
  let event = "";
  let dataStr = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataStr += line.slice(5).replace(/^ /, "");
    }
  }
  if (!event || !dataStr) return null;
  try {
    return { event, data: JSON.parse(dataStr) };
  } catch {
    return null;
  }
}
