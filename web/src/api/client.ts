const API_BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

let accessToken: string | null = localStorage.getItem("sitara.accessToken");

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) localStorage.setItem("sitara.accessToken", token);
  else localStorage.removeItem("sitara.accessToken");
}

export function getAccessToken(): string | null {
  return accessToken;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(API_BASE + path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const envelope = (await res.json().catch(() => null)) as
    | ApiEnvelope<T>
    | { error?: { code?: string; message?: string; details?: unknown } }
    | null;

  if (!res.ok) {
    const err = envelope as
      | { error?: { code?: string; message?: string; details?: unknown } }
      | null;
    throw new ApiError(
      res.status,
      err?.error?.code ?? "UNKNOWN",
      err?.error?.message ?? "Request failed",
      err?.error?.details
    );
  }

  const body = envelope as ApiEnvelope<T>;
  if (!body || !body.success) {
    throw new ApiError(res.status, "BAD_ENVELOPE", "Unexpected response shape");
  }
  return body.data;
}