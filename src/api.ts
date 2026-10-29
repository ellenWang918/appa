import type { ApiRequests, ApiResponses } from "./types.js";

let csrf: string | undefined;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<K extends keyof ApiResponses>(
  path: K,
  data?: ApiRequests[K],
): Promise<ApiResponses[K]> {
  if (data !== undefined && !csrf) await session();
  const response = await fetch("/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers:
      data === undefined
        ? {}
        : { "Content-Type": "application/json", "X-Calendar-CSRF": csrf || "" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const body = await response.json().catch(() => {
    throw new ApiError(
      "Appa received an unreadable response. Try again; if it continues, reopen Appa.",
      response.status,
    );
  });
  const result = body as ApiResponses[K] & {
    error?: string;
    csrf?: string;
  };
  if (!response.ok)
    throw new ApiError(
      result.error ||
        "This request could not be completed. Try again; if it continues, check your connection in Settings.",
      response.status,
    );
  if (result.csrf) csrf = result.csrf;
  return result;
}
export const session = () => api("session");
