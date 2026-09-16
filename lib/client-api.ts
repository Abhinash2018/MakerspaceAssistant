export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T = any>(path: string, body?: unknown, csrf?: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const res = await fetch(path, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal, headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await res.json() as any;
    if (!res.ok) throw new ApiError(res.status, data.error || "Request failed.");
    return data as T;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
