import type { AssistantResult, ChatMessage } from "./types.js";

export function assistantChatHistory(
  messages: readonly ChatMessage[],
  result: Pick<
    AssistantResult,
    "plan" | "event" | "todoRequest" | "todoChanges"
  > | null,
): ChatMessage[] {
  const recent =
    messages.length > 8 ? [messages[0], ...messages.slice(-7)] : messages;
  return recent.map((message, index) => {
    const draft =
      result?.plan ??
      result?.event ??
      (result?.todoRequest
        ? { request: result.todoRequest, changes: result.todoChanges }
        : null);
    if (index === recent.length - 1 && message.role === "assistant" && draft) {
      const proposal = JSON.stringify(draft).slice(0, 3000);
      return {
        role: message.role,
        text: `${message.text.slice(0, 950)}\nCurrent editable proposal (not saved): ${proposal}`,
      };
    }
    return { ...message, text: message.text.slice(0, 4000) };
  });
}
