import type { EventRepeatChoice, TaskEdit } from "./types.js";

export interface EventInputToken {
  kind: "date" | "time" | "duration" | "repeat" | "allDay";
  start: number;
  end: number;
  text: string;
}

export interface EventInputParse {
  tokens: EventInputToken[];
  event: TaskEdit | null;
  candidate: boolean;
  issue: string | null;
  details: Partial<TaskEdit>;
}

interface Part<T> {
  token: EventInputToken;
  value: T | null;
  issue?: string;
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const MONTH_WORD =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAY_WORD =
  "(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)";
const CLOCK_WORD =
  "(?:\\d{1,2}(?::\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?|noon|midnight)";

function isoDate(year: number, month: number, day: number): string | null {
  if (
    year < 1000 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  )
    return null;
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function shiftDate(today: string, days: number): string {
  const value = new Date(`${today}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function overlaps(a: EventInputToken, b: EventInputToken) {
  return a.start < b.end && a.end > b.start;
}

function token(
  kind: EventInputToken["kind"],
  match: RegExpMatchArray,
): EventInputToken {
  const start = match.index!;
  return { kind, start, end: start + match[0].length, text: match[0] };
}

function clockValue(
  raw: string,
  inheritedMeridiem?: string,
  end = false,
): number | null {
  const value = raw.trim().toLowerCase().replaceAll(".", "");
  if (value === "noon") return 720;
  if (value === "midnight") return 0;
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3] ?? inheritedMeridiem;
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    return ((hour % 12) + (meridiem === "pm" ? 12 : 0)) * 60 + minute;
  }
  if (end && hour === 24 && minute === 0) return 1440;
  if (hour > 23) return null;
  // A bare 1–12 is not enough information to choose morning or afternoon.
  if (!match[2] && hour >= 1 && hour <= 12) return null;
  return hour * 60 + minute;
}

function meridiem(raw: string) {
  return /(am|pm)\s*$/i.exec(raw.replaceAll(".", ""))?.[1].toLowerCase();
}

function eventTitle(text: string, tokens: readonly EventInputToken[]) {
  let title = text;
  for (const item of [...tokens].sort((a, b) => b.start - a.start))
    title = title.slice(0, item.start) + " " + title.slice(item.end);
  title = title
    .replace(
      /^\s*(?:(?:can|could|would)\s+you\s+|(?:i(?:'d| would)\s+like\s+to\s+)|please\s+)*/i,
      "",
    )
    .replace(/^(?:add|create|schedule|book|arrange|set up|put)\s+/i, "")
    .replace(
      /^(?:(?:an?|the)\s+)?(?:event|appointment)\b\s*(?:(?:called|named|for)\s+|[:–-]\s*)?/i,
      "",
    )
    .replace(/\b(?:on|at|from|until|for)\s*(?=[,;:.!?]|$)/gi, "")
    .replace(/\s+([,;:.!?])/g, "$1")
    .replace(/([,;])(?:\s*[,;])+/g, "$1")
    .replace(/^[\s,;:–—-]+|[\s,;:–—.!?\-]+$/g, "")
    .replace(/\s+/g, " ");
  return title || "New event";
}

/** Recognise a single event locally. Parsing never changes the supplied text or calendar. */
export function parseEventInput(text: string, today: string): EventInputParse {
  const empty = (): EventInputParse => ({
    tokens: [],
    event: null,
    candidate: false,
    issue: null,
    details: {},
  });
  if (!text.trim()) return empty();
  const body = text
    .trim()
    .replace(/^(?:(?:can|could|would)\s+you\s+|please\s+)*/i, "");
  const create = /^(?:add|create|schedule|book|arrange|set up|put)\b/i.test(
    body,
  );
  if (
    /^(?:show|list|find|search|when|what|where|why|how|is|are|do|does|did|have|has|count|move|reschedule|delete|remove|cancel|complete|mark|rename|reopen|shift|change|update)\b/i.test(
      body,
    ) ||
    /^(?:help\b|plan\b)/i.test(body) ||
    /\b(?:to[ -]?do(?:s| list)?|from (?:my|the) list)\b/i.test(body) ||
    /\b(?:existing|this|that)\s+(?:task|item|event|appointment)\b/i.test(
      body,
    ) ||
    /^(?:schedule|book|add|put|make)\s+(?:it|this|that|them)\b/i.test(body) ||
    /^(?:add|create)\s+(?:a |an |the )?goal\b/i.test(body) ||
    (!create && /[?？]/.test(text))
  )
    return empty();

  const issues: string[] = [];
  const allParts: Part<unknown>[] = [];
  const dates: Part<string>[] = [];
  const repeats: Part<EventRepeatChoice>[] = [];
  const times: Part<{ start: number; minutes?: number }>[] = [];
  const durations: Part<number>[] = [];
  const allDays: Part<boolean>[] = [];
  const details: Partial<TaskEdit> = {};
  const free = (part: EventInputToken) =>
    !allParts.some((existing) => overlaps(existing.token, part));
  function collect<T>(
    kind: EventInputToken["kind"],
    pattern: RegExp,
    target: Part<T>[],
    parse: (match: RegExpMatchArray) => Omit<Part<T>, "token">,
  ) {
    for (const match of text.matchAll(pattern)) {
      const span = token(kind, match);
      if (!free(span)) continue;
      const part = { token: span, ...parse(match) };
      target.push(part);
      allParts.push(part);
      if (part.issue) issues.push(part.issue);
    }
  }

  const currentYear = Number(today.slice(0, 4));
  const validToday =
    /^\d{4}-\d{2}-\d{2}$/.test(today) &&
    isoDate(currentYear, Number(today.slice(5, 7)), Number(today.slice(8))) ===
      today;
  if (!validToday)
    return {
      ...empty(),
      candidate: true,
      issue: "Choose a valid calendar date.",
    };
  function calendarDate(
    year: number,
    month: number,
    day: number,
    suppliedYear: boolean,
  ) {
    let value = isoDate(year, month, day);
    if (!suppliedYear && value && value < today)
      value = isoDate(year + 1, month, day);
    return { value, ...(value ? {} : { issue: "Choose a valid date." }) };
  }
  collect("date", /\b(?:on\s+)?(\d{4})-(\d{1,2})-(\d{1,2})\b/gi, dates, (m) =>
    calendarDate(Number(m[1]), Number(m[2]), Number(m[3]), true),
  );
  collect(
    "date",
    new RegExp(
      `\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_WORD})\\.?(?:\\s*,?\\s+(\\d{4}))?\\b`,
      "gi",
    ),
    dates,
    (m) =>
      calendarDate(
        Number(m[3] ?? currentYear),
        MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)) + 1,
        Number(m[1]),
        !!m[3],
      ),
  );
  collect(
    "date",
    new RegExp(
      `\\b(?:on\\s+)?(${MONTH_WORD})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s+(\\d{4}))?\\b`,
      "gi",
    ),
    dates,
    (m) =>
      calendarDate(
        Number(m[3] ?? currentYear),
        MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)) + 1,
        Number(m[2]),
        !!m[3],
      ),
  );
  collect(
    "date",
    /\b(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/gi,
    dates,
    (m) => {
      const day = Number(m[1]),
        month = Number(m[2]);
      if (day <= 12 && month <= 12 && day !== month)
        return {
          value: null,
          issue: "Use a month name or YYYY-MM-DD so the date is clear.",
        };
      const year = m[3]
        ? Number(m[3]) + (m[3].length === 2 ? 2000 : 0)
        : currentYear;
      return calendarDate(year, month, day, !!m[3]);
    },
  );
  collect(
    "date",
    /\b(?:on\s+)?(day after tomorrow|today|tomorrow)\b/gi,
    dates,
    (m) => ({
      value: shiftDate(
        today,
        m[1].toLowerCase() === "today"
          ? 0
          : m[1].toLowerCase() === "tomorrow"
            ? 1
            : 2,
      ),
    }),
  );
  collect(
    "date",
    new RegExp(
      `\\b(?:on\\s+)?(?:(this|next|every)\\s+)?(${WEEKDAY_WORD})\\b`,
      "gi",
    ),
    dates,
    (m) => {
      const weekday = WEEKDAYS.indexOf(m[2].toLowerCase().slice(0, 3));
      let days = (weekday - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7;
      if (!days && m[1]?.toLowerCase() !== "this") days = 7;
      if (m[1]?.toLowerCase() === "every") details.repeat = "weekly";
      return { value: shiftDate(today, days) };
    },
  );

  collect("allDay", /\ball[ -]day\b/gi, allDays, () => ({ value: true }));
  for (const [pattern, value] of [
    [/\b(?:every day|daily)\b/gi, "daily"],
    [/\b(?:every week|weekly)\b/gi, "weekly"],
    [
      /\b(?:every (?:fortnight|two weeks|2 weeks|other week)|fortnightly)\b/gi,
      "fortnightly",
    ],
    [/\b(?:every month|monthly)\b/gi, "monthly"],
    [/\b(?:every year|yearly|annually)\b/gi, "yearly"],
    [/\b(?:does not repeat|no repeat|once only)\b/gi, "none"],
  ] as const)
    collect("repeat", pattern, repeats, () => ({ value }));

  collect(
    "duration",
    /\b(?:for\s+|lasting\s+)?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)(?![a-z])(?:\s*(?:and\s+)?(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)(?![a-z]))?|\b(?:for\s+|lasting\s+)?(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)(?![a-z])/gi,
    durations,
    (m) => {
      if (/\bin\s*$/i.test(text.slice(0, m.index)))
        return {
          value: null,
          issue: "Use a date and clock time, such as tomorrow at 09:00.",
        };
      if (/-\s*$/.test(text.slice(0, m.index)))
        return {
          value: null,
          issue: "Choose one positive duration, such as for 45 min.",
        };
      const value = m[1] ? Number(m[1]) * 60 + Number(m[2] ?? 0) : Number(m[3]);
      return Number.isInteger(value) && value >= 5 && value <= 1440
        ? { value }
        : {
            value: null,
            issue: "Choose a duration of at least 5 minutes, within one day.",
          };
    },
  );

  // Ranges are collected first so a single time token owns both endpoints.
  const rangePattern = new RegExp(
    `(?<!:)\\b(?:(at|from)\\s+)?(${CLOCK_WORD})\\s*(?:[-–—]|to|until)\\s*(${CLOCK_WORD})(?![\\w:])`,
    "gi",
  );
  for (const match of text.matchAll(rangePattern)) {
    const span = token("time", match);
    if (!free(span) || (!match[1] && !/[:a-z]/i.test(match[2] + match[3])))
      continue;
    const from = clockValue(match[2], meridiem(match[3]));
    const to = clockValue(match[3], meridiem(match[2]), true);
    const end = to === 0 && from !== null && from > 0 ? 1440 : to;
    const minutes = from !== null && end !== null ? end - from : null;
    const part: Part<{ start: number; minutes?: number }> = {
      token: span,
      value:
        from !== null && minutes !== null && minutes >= 5
          ? { start: from, minutes }
          : null,
      ...(from === null || to === null
        ? { issue: "Use an exact time, such as 09:00 or 2 pm." }
        : minutes === null || minutes < 5
          ? {
              issue:
                "Choose an end time at least 5 minutes after the start, within the same day.",
            }
          : {}),
    };
    times.push(part);
    allParts.push(part);
    if (part.issue) issues.push(part.issue);
  }
  collect(
    "time",
    /(?<!:)\b(?:(?:at|from)\s+)?(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b|\d{1,2}:\d{2}(?![\w:])|noon\b|midnight\b)/gi,
    times,
    (m) => {
      const raw = m[0].replace(/^(?:at|from)\s+/i, "");
      const start = clockValue(raw);
      return start === null
        ? { value: null, issue: "Use a valid time, such as 09:00 or 2 pm." }
        : { value: { start } };
    },
  );
  collect("time", /\b(?:at|from)\s+(\d{1,2})(?![\w:])/gi, times, (m) => {
    const start = clockValue(m[1]);
    return start === null
      ? {
          value: null,
          issue: "Add am or pm, or use a 24-hour time such as 14:00.",
        }
      : { value: { start } };
  });

  const candidate =
    allParts.length > 0 ||
    (create && /\b(event|appointment)\b/i.test(body)) ||
    /\b\d{4}-\d{1,2}-|\b(?:at|from)\s+\d{1,2}:|\b(?:for|lasting)\s+\d+\s*$/i.test(
      text,
    );
  if (!candidate) return empty();
  if (/\b(?:for|lasting)\s+\d+(?:\.\d+)?\s*$/i.test(text))
    issues.push("Finish the duration, such as for 45 min.");
  if (
    /\b(?:for|lasting)\s+-\s*\d|\b(?:for|lasting)\s+\d+\s*[-–—]\s*\d+\s*(?:minutes?|mins?|m|hours?|hrs?|h)\b/i.test(
      text,
    )
  )
    issues.push("Choose one positive duration, such as for 45 min.");
  if (
    /\b(?:every\s+(?:weekdays?|weekends?|business days?|\d+\s+days?)|biweekly)\b/i.test(
      text,
    )
  )
    issues.push("Choose daily, weekly, fortnightly, monthly or yearly repeat.");
  if (
    times.some((part) =>
      /^\s*(?:(?:UTC|GMT)(?:[+-]\d{1,2}(?::?\d{2})?)?|AEST|AEDT|ACST|ACDT|AWST|PST|PDT|EST|EDT|CST|CDT|MST|MDT|BST|CET|CEST)\b/i.test(
        text.slice(part.token.end),
      ),
    )
  )
    issues.push(
      "Enter the time in your calendar's timezone, without a timezone abbreviation.",
    );
  const uniqueDates = [
    ...new Set(dates.flatMap((part) => (part.value ? [part.value] : []))),
  ];
  if (uniqueDates.length > 1) issues.push("Choose one date for this event.");
  if (times.length > 1)
    issues.push("Choose one start time, or a single start–end range.");
  if (durations.length > 1) issues.push("Choose one duration for this event.");
  const repeatValues = new Set<EventRepeatChoice>([
    ...(details.repeat ? [details.repeat] : []),
    ...repeats.flatMap((part) => (part.value ? [part.value] : [])),
  ]);
  if (repeatValues.size > 1)
    issues.push("Choose one repeat interval for this event.");
  details.repeat = repeatValues.values().next().value ?? "none";
  if (uniqueDates.length === 1) details.date = uniqueDates[0];
  if (times.length === 1 && times[0].value)
    details.start = times[0].value.start;
  const rangeMinutes = times.length === 1 ? times[0].value?.minutes : undefined;
  const durationMinutes = durations.length === 1 ? durations[0].value : null;
  if (
    rangeMinutes !== undefined &&
    durationMinutes !== null &&
    rangeMinutes !== durationMinutes
  )
    issues.push(
      "The time range and duration disagree. Keep one or make them match.",
    );
  details.allDay = allDays.length > 0;
  if (details.allDay && (times.length || durations.length))
    issues.push("Choose all day or a start time and duration for this event.");
  details.minutes = details.allDay
    ? 1440
    : (durationMinutes ?? rangeMinutes ?? 30);
  if (details.allDay) details.start = 0;
  if (details.start !== undefined && details.start + details.minutes > 1440)
    issues.push(
      "The event would run past midnight. Choose an earlier time or shorter duration.",
    );
  const tokens = allParts
    .filter((part) => part.value !== null)
    .map((part) => part.token)
    .sort((a, b) => a.start - b.start);
  details.title = eventTitle(text, tokens);
  if (details.title.length > 180)
    issues.push("Use an event name of no more than 180 characters.");
  const issue =
    issues[0] ??
    (!details.date
      ? "Add a date, such as tomorrow or Friday."
      : details.start === undefined
        ? "Add a time, such as 2 pm, or say all day."
        : null);
  return {
    tokens,
    candidate: true,
    issue,
    details,
    event: issue
      ? null
      : {
          title: details.title,
          date: details.date!,
          start: details.start!,
          minutes: details.minutes,
          allDay: details.allDay,
          repeat: details.repeat,
        },
  };
}
