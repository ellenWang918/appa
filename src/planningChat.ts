import type { AssistantResult, ChatMessage, Plan } from "./types.js";

export function assistantChatHistory(
  messages: readonly ChatMessage[],
  result: Pick<AssistantResult, "plan" | "event"> | null,
): ChatMessage[] {
  const recent =
    messages.length > 8 ? [messages[0], ...messages.slice(-7)] : messages;
  return recent.map((message, index) => {
    const draft = result?.plan ?? result?.event;
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

export function planningChatIntention(
  messages: readonly ChatMessage[],
  input: string,
) {
  const latest = `user: ${input.trim()}`;
  let context = latest;
  const original = messages.find((message) => message.role === "user");
  const first = original
    ? `Original goal: ${original.text.slice(0, Math.min(1000, Math.max(0, 3950 - latest.length)))}\n\n`
    : "";
  for (const message of [...messages].reverse()) {
    if (message === original) continue;
    const previous = `${message.role}: ${message.text}\n\n`;
    if (first.length + previous.length + context.length > 4000) break;
    context = previous + context;
  }
  return first + context;
}

export function planningChatReply(plan: Plan) {
  return (
    plan.clarification ||
    [
      plan.goalName,
      ...plan.tasks.map((task) => `${task.title} · ${task.minutes} min`),
    ].join("\n")
  );
}
