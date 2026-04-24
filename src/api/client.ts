const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

// Cookie names — must match server (entities/auth/business/service.py).
const CSRF_COOKIE = "token.csrf";
const CSRF_HEADER = "X-CSRF-Token";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function readCookie(name: string): string | null {
  // Escape any regex metacharacters in the cookie name.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp("(^|; )" + escaped + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

// Coalesces concurrent 401s into a single refresh. The promise is
// cleared on the next microtask so later 401s (after a fresh refresh)
// trigger a new refresh instead of reusing a stale success.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const csrf = readCookie(CSRF_COOKIE);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (csrf) headers[CSRF_HEADER] = csrf;
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: "POST",
        headers,
        credentials: "include",
      });
      if (!res.ok) return null;
      const body = await res.json().catch(() => null);
      const newToken = body?.data?.token?.access_token;
      if (typeof newToken === "string" && newToken.length > 0) {
        localStorage.setItem("access_token", newToken);
        return newToken;
      }
      return null;
    } catch {
      return null;
    } finally {
      // Clear on the next tick so a burst of 401s coalesces into one
      // refresh, but subsequent 401s (later access-token expirations)
      // trigger a fresh refresh instead of reusing this promise.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

/** Redirect to /login, wiping local auth state. The one place this happens. */
function redirectToLogin(): never {
  localStorage.removeItem("access_token");
  localStorage.removeItem("username");
  window.location.href = "/login";
  throw new ApiError(401, "Unauthorized");
}

/**
 * Fetch that retries once on 401 after a successful refresh. Callers
 * that need auth just pass `buildInit()` for their current token; if a
 * retry is needed, we rebuild with the refreshed token from localStorage.
 */
async function fetchWithRefresh(
  url: string,
  buildInit: () => RequestInit,
): Promise<Response> {
  let res = await fetch(url, buildInit());
  if (res.status !== 401) return res;

  const newToken = await refreshAccessToken();
  if (newToken === null) return res; // caller handles 401 → redirect

  res = await fetch(url, buildInit());
  return res;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const buildInit = (): RequestInit => {
    const token = localStorage.getItem("access_token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return { ...options, headers, credentials: "include" };
  };

  const res = await fetchWithRefresh(`${API_BASE}${path}`, buildInit);

  if (res.status === 401) redirectToLogin();

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;

  return res.json();
}

/** Unwrap standard {"data": T} envelope */
function unwrap<T>(envelope: { data: T }): T {
  return envelope.data;
}

/** GET a single item — unwraps {"data": {...}} */
export async function getOne<T>(path: string): Promise<T> {
  const res = await request<{ data: T }>(path);
  return unwrap(res);
}

/** GET a list — unwraps {"data": [...], "count": N} */
export async function getList<T>(path: string): Promise<{ data: T[]; count: number }> {
  return request<{ data: T[]; count: number }>(path);
}

/** POST — unwraps {"data": {...}} */
export async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await request<{ data: T }>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

/** PUT — unwraps {"data": {...}} */
export async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await request<{ data: T }>(path, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

/** DELETE — unwraps {"data": {...}} */
export async function del<T>(path: string): Promise<T> {
  const res = await request<{ data: T }>(path, {
    method: "DELETE",
  });
  return unwrap(res);
}

/** Upload a file via multipart form data — unwraps {"data": {...}} */
export async function uploadFile<T>(
  path: string,
  file: File,
  extraFields?: Record<string, string>,
): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      formData.append(key, value);
    }
  }

  const buildInit = (): RequestInit => {
    const token = localStorage.getItem("access_token");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    // Do NOT set Content-Type — browser sets it with boundary for multipart.
    return {
      method: "POST",
      headers,
      body: formData,
      credentials: "include",
    };
  };

  const res = await fetchWithRefresh(`${API_BASE}${path}`, buildInit);

  if (res.status === 401) redirectToLogin();

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? "Upload failed");
  }

  const envelope = await res.json();
  return envelope.data;
}

/**
 * GET attachment bytes from the view endpoint (streaming/binary — not JSON).
 * Sends Bearer token so iframe/navigation-style URLs are not required.
 */
export async function fetchViewAttachmentBlob(publicId: string): Promise<Blob> {
  const buildInit = (): RequestInit => {
    const token = localStorage.getItem("access_token");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return {
      method: "GET",
      headers,
      credentials: "include",
    };
  };

  const res = await fetchWithRefresh(
    `${API_BASE}/api/v1/view/attachment/${publicId}`,
    buildInit,
  );

  if (res.status === 401) redirectToLogin();

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(
      res.status,
      typeof body.detail === "string" ? body.detail : "Request failed",
    );
  }

  return res.blob();
}

/** Raw request without envelope unwrapping (for auth, lookups, etc.) */
export { request as rawRequest };
