import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planningChatIntention,
  planningChatReply,
  assistantChatHistory,
} from "../dist/runtime/src/planningChat.js";

test("Planning chat retains the original goal and recent clarification without changing messages", () => {
  const messages = [
    { role: "user", text: "Launch my portfolio" },
    { role: "assistant", text: "How much time do you have?" },
  ];
  const original = structuredClone(messages);
  const intention = planningChatIntention(
    messages,
    "  Three evenings per week  ",
  );
  assert.match(intention, /Original goal: Launch my portfolio/);
  assert.match(intention, /assistant: How much time do you have/);
  assert.ok(intention.endsWith("user: Three evenings per week"));
  assert.deepEqual(messages, original);
});

test("Calendar chat retains the first request, recent clarification and the actual editable proposal for follow-ups", () => {
  const messages = [{ role: "user", text: "Run five kilometres" }];
  for (let index = 0; index < 12; index++)
    messages.push({ role: "assistant", text: `Clarification ${index}` });
  const original = structuredClone(messages);
  const draft = {
    goalName: "Run 5k",
    tasks: [{ title: "Walk for ten minutes", minutes: 10, dependsOn: [] }],
    kind: "project",
    perWeek: null,
    clarification: null,
  };
  const history = assistantChatHistory(messages, { plan: draft });
  assert.equal(history.length, 8);
  assert.equal(history[0].text, "Run five kilometres");
  assert.match(history.at(-1).text, /Walk for ten minutes/);
  assert.match(history.at(-1).text, /not saved/);
  assert.ok(history.every((message) => message.text.length <= 4000));
  assert.deepEqual(messages, original);
});

test("Long chats stay within the planning API limit while retaining the latest instruction and goal", () => {
  const messages = [{ role: "user", text: "Build my portfolio" }];
  for (let index = 0; index < 20; index++)
    messages.push({ role: "assistant", text: "Earlier context ".repeat(100) });
  const latest = "Make the next step smaller. ".repeat(100);
  const intention = planningChatIntention(messages, latest);
  assert.ok(intention.length <= 4000);
  assert.match(intention, /Build my portfolio/);
  assert.ok(intention.endsWith(latest.trim()));
});

test("Assistant replies display actual clarification or plan contents rather than sample chat", () => {
  const plan = {
    goalName: "Portfolio",
    kind: "project",
    perWeek: null,
    clarification: "Which project should we start with?",
    tasks: [],
  };
  assert.equal(planningChatReply(plan), plan.clarification);
  plan.clarification = null;
  plan.tasks = [{ title: "Choose projects", minutes: 15, dependsOn: [] }];
  assert.equal(planningChatReply(plan), "Portfolio\nChoose projects · 15 min");
});
