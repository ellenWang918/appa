export function errorMessage(
  error: unknown,
  fallback = "This action could not be completed.",
): string {
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
