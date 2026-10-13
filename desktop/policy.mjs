export function isAllowedExternal(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return false;
    return (
      ["auth.openai.com", "developers.openai.com"].includes(url.hostname) ||
      (url.hostname === "github.com" &&
        (url.pathname === "/ellenWang918/ai-goal-calendar" ||
          url.pathname.startsWith("/ellenWang918/ai-goal-calendar/")))
    );
  } catch {
    return false;
  }
}
