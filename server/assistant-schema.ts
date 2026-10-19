export function assistantSchema(plan: object) {
  const window = {
    type: "object",
    additionalProperties: false,
    properties: {
      from: { type: "string" },
      to: { type: "string" },
      start: { type: "integer" },
      end: { type: "integer" },
    },
    required: ["from", "to", "start", "end"],
  };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      kind: {
        type: "string",
        enum: ["clarify", "goal", "event", "search", "reschedule", "todo"],
      },
      message: { type: "string" },
      query: {
        ...window,
        properties: {
          ...window.properties,
          terms: { type: "array", items: { type: "string" } },
          operation: {
            type: "string",
            enum: ["agenda", "last", "count", "availability"],
          },
          completedOnly: { type: "boolean" },
        },
        required: [...window.required, "terms", "operation", "completedOnly"],
      },
      destination: window,
      todo: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              action: {
                type: "string",
                enum: [
                  "list",
                  "add",
                  "rename",
                  "complete",
                  "reopen",
                  "delete",
                  "schedule",
                ],
              },
              terms: { type: "array", items: { type: "string" } },
              status: { type: "string", enum: ["pending", "completed", "all"] },
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    minutes: { type: "integer" },
                  },
                  required: ["title", "minutes"],
                },
              },
              title: { type: ["string", "null"] },
              schedule: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      date: { type: "string" },
                      start: { type: "integer" },
                      minutes: { type: ["integer", "null"] },
                      allDay: { type: "boolean" },
                    },
                    required: ["date", "start", "minutes", "allDay"],
                  },
                ],
              },
            },
            required: [
              "action",
              "terms",
              "status",
              "items",
              "title",
              "schedule",
            ],
          },
        ],
      },
      plan: { anyOf: [plan, { type: "null" }] },
      event: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              date: { type: "string" },
              start: { type: "integer" },
              minutes: { type: "integer" },
              allDay: { type: "boolean" },
              repeat: {
                type: "string",
                enum: [
                  "none",
                  "daily",
                  "weekly",
                  "fortnightly",
                  "monthly",
                  "yearly",
                ],
              },
            },
            required: ["title", "date", "start", "minutes", "allDay", "repeat"],
          },
        ],
      },
    },
    required: [
      "kind",
      "message",
      "query",
      "destination",
      "plan",
      "event",
      "todo",
    ],
  };
}
