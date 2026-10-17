export function errorMessage(
  error: unknown,
  fallback = "This action could not be completed. Your changes were not applied. Try again.",
): string {
  if (error instanceof SyntaxError)
    return "This file could not be read. Choose an Appa JSON backup and try again.";
  if (
    error instanceof TypeError &&
    /fetch|network|load failed/i.test(error.message)
  )
    return "Could not reach Appa’s local service. Check that Appa is running, then try again.";
  return error instanceof Error && error.message ? error.message : fallback;
}
export function errorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}
