import { test } from "node:test";
import assert from "node:assert/strict";
import { assistantChatHistory } from "../dist/runtime/src/planningChat.js";

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
test("To do chat follow-ups include the reviewed item and unsaved requested action", () => {
  const messages = [
    { role: "user", text: "Rename buy milk" },
    { role: "assistant", text: "Review these changes" },
  ];
  const history = assistantChatHistory(messages, {
    todoRequest: {
      action: "rename",
      terms: ["buy milk"],
      status: "pending",
      title: "Buy oat milk",
      items: [],
      schedule: null,
    },
    todoChanges: [
      {
        id: "one",
        before: { id: "one", title: "Buy milk", minutes: 30, done: false },
        after: { id: "one", title: "Buy oat milk", minutes: 30, done: false },
      },
    ],
  });
  assert.match(history.at(-1).text, /Buy oat milk/);
  assert.match(history.at(-1).text, /not saved/);
  assert.match(history.at(-1).text, /rename/);
});
