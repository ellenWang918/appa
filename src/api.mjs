let csrf;
export async function api(path, data) {
  if (data !== undefined && !csrf) await session();
  const response = await fetch("/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers:
      data === undefined
        ? {}
        : { "Content-Type": "application/json", "X-Calendar-CSRF": csrf },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "This action could not be completed.");
  if (result.csrf) csrf = result.csrf;
  return result;
}
export const session = () => api("session");
