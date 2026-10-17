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
        enum: ["clarify", "goal", "event", "search", "reschedule"],
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
    required: ["kind", "message", "query", "destination", "plan", "event"],
  };
}
