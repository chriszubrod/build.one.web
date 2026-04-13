const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

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

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem("access_token");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401) {
    localStorage.removeItem("access_token");
    window.location.href = "/login";
    throw new ApiError(401, "Unauthorized");
  }

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
export async function uploadFile<T>(path: string, file: File, extraFields?: Record<string, string>): Promise<T> {
  const token = localStorage.getItem("access_token");
  const formData = new FormData();
  formData.append("file", file);
  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      formData.append(key, value);
    }
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  // Do NOT set Content-Type — browser sets it with boundary for multipart

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: formData,
    credentials: "include",
  });

  if (res.status === 401) {
    localStorage.removeItem("access_token");
    window.location.href = "/login";
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? "Upload failed");
  }

  const envelope = await res.json();
  return envelope.data;
}

/** Raw request without envelope unwrapping (for auth, lookups, etc.) */
export { request as rawRequest };
