import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ClipboardEvent, Ref } from "react";
import { X } from "@phosphor-icons/react";
import type { EventInputParse, EventInputToken } from "./eventComposer";
import { addDays, clockTime, dateLabel } from "./calendar";
import { EVENT_REPEATS, eventRepeatLabel, isEventRepeat } from "./eventRepeat";
import { useInterfaceText } from "./InterfaceLanguage";
import type { EventRepeatChoice } from "./types";

export interface ComposerInputHandle {
  focus: () => void;
}
type ChipKind = EventInputToken["kind"];
type Chip = { kind: ChipKind; start: number; end: number; label: string };
type TextSpan = { start: number; end: number };

// Deletion keeps an unwrapped tag as text, even if a shorter value still parses.
// Typing into that span resumes recognition; edits elsewhere leave it unwrapped.
function movedSpans(
  before: string,
  after: string,
  spans: TextSpan[],
  recognizeInsertion = false,
): TextSpan[] {
  if (before === after) return spans;
  let from = 0;
  while (
    from < before.length &&
    from < after.length &&
    before[from] === after[from]
  )
    from++;
  let suffix = 0;
  while (
    suffix < before.length - from &&
    suffix < after.length - from &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix++;
  const until = before.length - suffix;
  const insertedEnd = after.length - suffix;
  const delta = after.length - before.length;
  return spans
    .filter(
      (span) =>
        !(
          recognizeInsertion &&
          insertedEnd > from &&
          from <= span.end &&
          until >= span.start
        ),
    )
    .map((span) => {
      if (span.end < from) return span;
      if (span.start > until)
        return { start: span.start + delta, end: span.end + delta };
      return {
        start: Math.min(span.start, from),
        end: span.end >= until ? span.end + delta : insertedEnd,
      };
    })
    .filter((span) => span.end > span.start);
}

// Chips retain their original text independently of the shorter display label.
// Browser editing, paste and selection all round-trip through this plain text.
function plainText(node: Node): string {
  if (node instanceof HTMLElement && node.dataset.eventToken)
    return node.dataset.raw ?? "";
  if (node.nodeType === Node.TEXT_NODE)
    return (node.textContent ?? "").replaceAll("\u00a0", " ");
  if (node.nodeName === "BR") return "\n";
  return Array.from(node.childNodes)
    .map(
      (child, index) =>
        (index && (child.nodeName === "DIV" || child.nodeName === "P")
          ? "\n"
          : "") + plainText(child),
    )
    .join("");
}
function selectionOffset(root: Node, target: Node, offset: number): number {
  if (root.nodeType === Node.TEXT_NODE) return offset;
  if (root instanceof HTMLElement && root.dataset.eventToken)
    return offset === 0 && root === target ? 0 : plainText(root).length;
  let total = 0;
  for (const [index, child] of Array.from(root.childNodes).entries()) {
    if (root === target && index === offset) return total;
    if (index && (child.nodeName === "DIV" || child.nodeName === "P")) total++;
    if (child === target || child.contains(target))
      return total + selectionOffset(child, target, offset);
    total += plainText(child).length;
  }
  return total;
}
function selectionPoint(root: HTMLElement, offset: number): [Node, number] {
  let remaining = Math.max(0, offset);
  for (const [index, child] of Array.from(root.childNodes).entries()) {
    const length = plainText(child).length;
    if (remaining <= length) {
      if (child.nodeType === Node.TEXT_NODE) return [child, remaining];
      return [root, index + (remaining > 0 ? 1 : 0)];
    }
    remaining -= length;
  }
  return [root, root.childNodes.length];
}
function chipIcon(kind: ChipKind) {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(icon.namespaceURI, "path");
  path.setAttribute(
    "d",
    kind === "duration"
      ? "M6 3h12M6 21h12M7 3v4l5 5-5 5v4M17 3v4l-5 5 5 5v4"
      : kind === "repeat"
        ? "M4 8a8 8 0 0 1 14-2l3 3M21 3v6h-6M20 16a8 8 0 0 1-14 2l-3-3M3 21v-6h6"
        : kind === "time"
          ? "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2"
          : "M5 5h14v15H5zM8 3v4M16 3v4M5 10h14",
  );
  icon.append(path);
  return icon;
}
function replaceParts(
  value: string,
  tokens: EventInputToken[],
  changes: Partial<Record<EventInputToken["kind"], string>>,
) {
  let cursor = 0;
  let next = "";
  const used = new Set<EventInputToken["kind"]>();
  for (const token of tokens) {
    if (changes[token.kind] === undefined) continue;
    next +=
      value.slice(cursor, token.start) +
      (used.has(token.kind) ? "" : changes[token.kind]);
    used.add(token.kind);
    cursor = token.end;
  }
  next += value.slice(cursor);
  for (const kind of Object.keys(changes) as EventInputToken["kind"][])
    if (!used.has(kind) && changes[kind]) next += ` ${changes[kind]}`;
  return next.replace(/\s+/g, " ").trim();
}

export function InlineEventInput({
  ref,
  value,
  parsed,
  language,
  disabled,
  describedBy,
  controls,
  onChange,
  onSubmit,
}: {
  ref: Ref<ComposerInputHandle>;
  value: string;
  parsed: EventInputParse;
  language: string;
  disabled: boolean;
  describedBy?: string;
  controls?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const t = useInterfaceText();
  const editor = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const rendered = useRef("");
  const pendingFocus = useRef<ChipKind | null>(null);
  const pendingSelection = useRef<[number, number] | null>(null);
  const [editing, setEditing] = useState<{ value: string; spans: TextSpan[] }>({
    value: "",
    spans: [],
  });
  const editingSpans = movedSpans(editing.value, value, editing.spans);
  const [picker, setPicker] = useState<ChipKind | null>(null);
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [minutes, setMinutes] = useState("30");
  const [repeat, setRepeat] = useState<EventRepeatChoice>("none");
  const [pickerError, setPickerError] = useState("");
  useImperativeHandle(
    ref,
    () => ({ focus: () => editor.current?.focus() }),
    [],
  );

  const chips: Chip[] = [];
  const details = parsed.details;
  for (const token of parsed.tokens) {
    if (
      editingSpans.some(
        (span) => token.start < span.end && token.end > span.start,
      )
    )
      continue;
    const dateText = details.date
      ? dateLabel(
          details.date,
          { weekday: "short", day: "numeric", month: "short" },
          language,
        )
      : token.text;
    const timeText =
      details.start !== undefined ? clockTime(details.start) : token.text;
    const label =
      token.kind === "date"
        ? dateText
        : token.kind === "time"
          ? timeText
          : token.kind === "duration" && details.minutes !== undefined
            ? t("{minutes} min", { minutes: details.minutes })
            : token.kind === "repeat" && details.repeat
              ? t(eventRepeatLabel(details.repeat))
              : token.kind === "allDay"
                ? t("All day")
                : token.text;
    chips.push({ ...token, label });
  }
  const markupKey = JSON.stringify([value, chips, disabled]);
  useLayoutEffect(() => {
    const root = editor.current;
    if (
      !root ||
      composing.current ||
      (rendered.current === markupKey && plainText(root) === value)
    )
      return;
    const selection = window.getSelection();
    const selected =
      pendingSelection.current ??
      ((document.activeElement === root ||
        root.contains(document.activeElement)) &&
      selection?.anchorNode &&
      selection.focusNode &&
      root.contains(selection.anchorNode) &&
      root.contains(selection.focusNode)
        ? [
            selectionOffset(root, selection.anchorNode, selection.anchorOffset),
            selectionOffset(root, selection.focusNode, selection.focusOffset),
          ]
        : null);
    pendingSelection.current = null;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const chip of chips) {
      fragment.append(document.createTextNode(value.slice(cursor, chip.start)));
      const element = document.createElement("span");
      element.className = "composer-token";
      element.contentEditable = "false";
      element.dataset.eventToken = chip.kind;
      element.dataset.raw = value.slice(chip.start, chip.end);
      element.dataset.start = String(chip.start);
      element.dataset.end = String(chip.end);
      element.setAttribute("role", "button");
      element.setAttribute(
        "aria-label",
        t("Edit {detail}", { detail: chip.label }),
      );
      element.tabIndex = disabled ? -1 : 0;
      element.title = t(
        chip.kind === "date"
          ? "↑/↓: adjust by one day. Backspace/Delete: edit as text."
          : chip.kind === "time"
            ? "↑/↓: adjust by five minutes. Backspace/Delete: edit as text."
            : "Backspace/Delete: edit as text.",
      );
      element.append(chipIcon(chip.kind), document.createTextNode(chip.label));
      fragment.append(element);
      cursor = chip.end;
    }
    fragment.append(document.createTextNode(value.slice(cursor)));
    root.replaceChildren(fragment);
    rendered.current = markupKey;
    if (selection && selected)
      selection.setBaseAndExtent(
        ...selectionPoint(root, selected[0]),
        ...selectionPoint(root, selected[1]),
      );
    if (pendingFocus.current) {
      root
        .querySelector<HTMLElement>(
          `[data-event-token="${pendingFocus.current}"]`,
        )
        ?.focus();
      pendingFocus.current = null;
    }
  });
  useEffect(() => {
    if (!picker) return;
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !shell.current?.contains(event.target)
      )
        setPicker(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [picker]);

  useEffect(() => {
    const root = editor.current;
    if (!root) return;
    const beforeInput = (event: InputEvent) => {
      const targets = event.getTargetRanges().flatMap((range) =>
        root.contains(range.startContainer) && root.contains(range.endContainer)
          ? [
              {
                start: selectionOffset(
                  root,
                  range.startContainer,
                  range.startOffset,
                ),
                end: selectionOffset(root, range.endContainer, range.endOffset),
              },
            ]
          : [],
      );
      if (
        disabled ||
        event.isComposing ||
        composing.current ||
        !event.cancelable
      )
        return;
      if (
        /^delete(?:Content|Word|SoftLine|HardLine)(?:Backward|Forward)$/.test(
          event.inputType,
        ) &&
        unwrapForDeletion(
          event.inputType.endsWith("Backward") ? "backward" : "forward",
          targets,
        )
      )
        event.preventDefault();
    };
    root.addEventListener("beforeinput", beforeInput);
    return () => root.removeEventListener("beforeinput", beforeInput);
  });

  function emitValue(next: string, recognizeInsertion = false) {
    setEditing({
      value: next,
      spans: movedSpans(value, next, editingSpans, recognizeInsertion),
    });
    onChange(next);
  }

  function textSelection(): [number, number] | null {
    const root = editor.current;
    const selection = window.getSelection();
    if (
      !root ||
      !selection?.anchorNode ||
      !selection.focusNode ||
      !root.contains(selection.anchorNode) ||
      !root.contains(selection.focusNode)
    )
      return null;
    return [
      selectionOffset(root, selection.anchorNode, selection.anchorOffset),
      selectionOffset(root, selection.focusNode, selection.focusOffset),
    ];
  }

  function focusedTag(): HTMLElement | null {
    const focused = document.activeElement;
    return focused instanceof HTMLElement &&
      focused.dataset.eventToken &&
      editor.current?.contains(focused)
      ? focused
      : null;
  }

  function unwrapForDeletion(
    direction: "backward" | "forward",
    targets: TextSpan[] = [],
  ) {
    if (disabled || composing.current) return false;
    const root = editor.current;
    if (!root) return false;
    const focused = focusedTag();
    let selection = textSelection();
    let affected: TextSpan[];
    if (focused) {
      const span = {
        start: Number(focused.dataset.start),
        end: Number(focused.dataset.end),
      };
      affected = [span];
      const caret = direction === "backward" ? span.end : span.start;
      selection = [caret, caret];
    } else {
      if (!selection) return false;
      const from = Math.min(...selection),
        until = Math.max(...selection);
      affected = chips.filter(
        (chip) =>
          targets.some(
            (target) => chip.start < target.end && chip.end > target.start,
          ) ||
          (from === until
            ? direction === "backward"
              ? chip.end === from
              : chip.start === from
            : chip.start < until && chip.end > from),
      );
    }
    if (!affected.length || !selection) return false;
    pendingSelection.current = selection;
    root.focus({ preventScroll: true });
    setPicker(null);
    setEditing({ value, spans: [...editingSpans, ...affected] });
    return true;
  }

  function adjustmentTag(): Chip | undefined {
    const focused = focusedTag();
    if (focused)
      return chips.find((chip) => chip.start === Number(focused.dataset.start));
    const selection = textSelection();
    if (!selection || selection[0] !== selection[1]) return;
    const caret = selection[0];
    return (
      chips.find((chip) => chip.end === caret) ??
      chips.find((chip) => chip.start === caret) ??
      [...chips]
        .reverse()
        .find(
          (chip) =>
            chip.end < caret && /^\s*$/.test(value.slice(chip.end, caret)),
        ) ??
      chips.find(
        (chip) =>
          chip.start > caret && /^\s*$/.test(value.slice(caret, chip.start)),
      )
    );
  }

  function adjustTag(direction: number) {
    if (disabled) return false;
    const chip = adjustmentTag();
    if (!chip || (chip.kind !== "date" && chip.kind !== "time")) return false;
    const changes: Partial<Record<ChipKind, string>> = {};
    if (chip.kind === "date") {
      if (!details.date) return false;
      const nextDate = addDays(details.date, direction);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return true;
      changes.date = nextDate;
      if (
        /\bevery\b/i.test(value.slice(chip.start, chip.end)) &&
        details.repeat &&
        details.repeat !== "none"
      )
        changes.repeat = eventRepeatLabel(details.repeat).toLowerCase();
    } else {
      if (details.start === undefined) return false;
      changes.time = clockTime(
        Math.max(
          0,
          Math.min(
            1440 - (details.minutes ?? 30),
            details.start + direction * 5,
          ),
        ),
      );
      if (/[-–—]|\b(?:to|until)\b/i.test(value.slice(chip.start, chip.end)))
        changes.duration = `${details.minutes ?? 30} min`;
    }
    const next = replaceParts(value, parsed.tokens, changes);
    setPicker(null);
    if (next !== value) {
      pendingFocus.current = chip.kind;
      emitValue(next);
    } else
      editor.current
        ?.querySelector<HTMLElement>(`[data-event-token="${chip.kind}"]`)
        ?.focus();
    return true;
  }

  function changed() {
    if (disabled || composing.current || !editor.current) return;
    emitValue(plainText(editor.current).slice(0, 3600), true);
  }
  function copySelection(event: ClipboardEvent, cut = false) {
    if (cut && disabled) {
      event.preventDefault();
      return;
    }
    const selection = window.getSelection(),
      root = editor.current;
    if (
      !root ||
      !selection?.anchorNode ||
      !selection.focusNode ||
      !root.contains(selection.anchorNode) ||
      !root.contains(selection.focusNode)
    )
      return;
    const offsets = [
      selectionOffset(root, selection.anchorNode, selection.anchorOffset),
      selectionOffset(root, selection.focusNode, selection.focusOffset),
    ].sort((a, b) => a - b);
    event.preventDefault();
    event.clipboardData.setData(
      "text/plain",
      plainText(root).slice(offsets[0], offsets[1]),
    );
    if (cut && selection.rangeCount) {
      selection.getRangeAt(0).deleteContents();
      changed();
    }
  }
  function openPicker(kind: ChipKind) {
    if (disabled) return;
    setDate(details.date ?? "");
    setStart(details.start !== undefined ? clockTime(details.start) : "");
    setAllDay(!!details.allDay);
    setMinutes(String(details.minutes ?? 30));
    setRepeat(details.repeat ?? "none");
    setPickerError("");
    setPicker(kind);
  }
  function closePicker() {
    setPicker(null);
    editor.current?.focus();
  }
  function applyPicker() {
    if (disabled) return;
    const range = parsed.tokens.some(
      (token) =>
        token.kind === "time" && /[-–—]|\b(?:to|until)\b/i.test(token.text),
    );
    const recurringDate = parsed.tokens.some(
      (token) => token.kind === "date" && /\bevery\b/i.test(token.text),
    );
    let changes: Partial<Record<EventInputToken["kind"], string>>;
    if (picker === "duration") {
      const duration = Number(minutes);
      if (!Number.isInteger(duration) || duration < 5 || duration > 1440) {
        setPickerError(t("Choose a duration of 5–1440 minutes."));
        return;
      }
      changes = { duration: `${duration} min` };
      // A range owns both endpoints. Replace it with its start when changing
      // duration, so the old end cannot contradict the new duration.
      if (range && details.start !== undefined)
        changes.time = clockTime(details.start);
    } else if (picker === "repeat")
      changes = {
        repeat: repeat === "none" ? "" : eventRepeatLabel(repeat).toLowerCase(),
        ...(recurringDate && details.date ? { date: details.date } : {}),
      };
    else {
      if (!date || (!allDay && !/^\d{2}:\d{2}$/.test(start))) {
        setPickerError(t("Choose a date and time, or select All day."));
        return;
      }
      changes = {
        date,
        time: allDay ? "" : start,
        allDay: allDay ? "all day" : "",
      };
      if (allDay) changes.duration = "";
      else if (range && details.minutes !== undefined)
        changes.duration = `${details.minutes} min`;
      // "Every Friday" combines the date and weekly repeat in one token.
      // Keep its repeat when the date picker replaces that token.
      if (recurringDate && details.repeat && details.repeat !== "none")
        changes.repeat = eventRepeatLabel(details.repeat).toLowerCase();
    }
    emitValue(replaceParts(value, parsed.tokens, changes));
    closePicker();
  }
  return (
    <div className="inline-event-input" ref={shell}>
      <div
        ref={editor}
        className="composer-text"
        role="textbox"
        aria-label={t("Message Appa")}
        aria-multiline="true"
        aria-readonly={disabled}
        aria-describedby={describedBy}
        aria-controls={controls}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-empty={!value}
        data-placeholder={t("Add an event, e.g. Lunch tomorrow at 1pm…")}
        spellCheck={false}
        onInput={changed}
        onBlur={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            shell.current?.contains(event.relatedTarget)
          )
            return;
          if (editingSpans.length) setEditing({ value, spans: [] });
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          changed();
        }}
        onClick={(event) => {
          const token =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>("[data-event-token]")
              : null;
          if (token?.dataset.eventToken)
            openPicker(token.dataset.eventToken as ChipKind);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || composing.current) return;
          if (
            (event.key === "Backspace" || event.key === "Delete") &&
            unwrapForDeletion(
              event.key === "Backspace" ? "backward" : "forward",
            )
          ) {
            event.preventDefault();
            return;
          }
          if (
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.shiftKey &&
            (event.key === "ArrowUp" || event.key === "ArrowDown") &&
            adjustTag(event.key === "ArrowUp" ? 1 : -1)
          ) {
            event.preventDefault();
            return;
          }
          const token =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>("[data-event-token]")
              : null;
          if (
            token &&
            !event.shiftKey &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey &&
            (event.key === "ArrowLeft" || event.key === "ArrowRight")
          ) {
            event.preventDefault();
            const root = editor.current!;
            const offset = Number(
              event.key === "ArrowLeft"
                ? token.dataset.start
                : token.dataset.end,
            );
            root.focus({ preventScroll: true });
            window.getSelection()?.setPosition(...selectionPoint(root, offset));
            return;
          }
          if (token && event.key === " ") {
            event.preventDefault();
            openPicker(token.dataset.eventToken as ChipKind);
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!disabled) onSubmit();
          }
        }}
        onPaste={(event) => {
          event.preventDefault();
          if (disabled) return;
          const selection = window.getSelection();
          if (
            !selection?.rangeCount ||
            !editor.current?.contains(selection.anchorNode)
          )
            return;
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const text = document.createTextNode(
            event.clipboardData.getData("text/plain"),
          );
          range.insertNode(text);
          range.setStartAfter(text);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          changed();
        }}
        onCopy={(event) => copySelection(event)}
        onCut={(event) => copySelection(event, true)}
      />
      {picker && (
        <div
          className="composer-token-picker"
          role="dialog"
          aria-label={t(
            picker === "duration"
              ? "Duration"
              : picker === "repeat"
                ? "Repeat"
                : "Date and time",
          )}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closePicker();
            } else if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              applyPicker();
            }
          }}
        >
          <header>
            <strong>
              {t(
                picker === "duration"
                  ? "Duration"
                  : picker === "repeat"
                    ? "Repeat"
                    : "Date and time",
              )}
            </strong>
            <button
              type="button"
              className="icon-button"
              aria-label={t("Close")}
              onClick={closePicker}
            >
              <X size={14} />
            </button>
          </header>
          {picker === "duration" ? (
            <label className="field">
              {t("Minutes")}
              <input
                autoFocus
                type="number"
                min="5"
                max="1440"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
              />
            </label>
          ) : picker === "repeat" ? (
            <label className="field">
              {t("Repeat")}
              <select
                autoFocus
                value={repeat}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === "none" || isEventRepeat(next)) setRepeat(next);
                }}
              >
                {["none" as const, ...EVENT_REPEATS].map((value) => (
                  <option key={value} value={value}>
                    {t(eventRepeatLabel(value))}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="field">
                {t("Date")}
                <input
                  autoFocus
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label className="composer-all-day">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(event) => setAllDay(event.target.checked)}
                />
                {t("All day")}
              </label>
              {!allDay && (
                <label className="field">
                  {t("Start time")}
                  <input
                    type="time"
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                  />
                </label>
              )}
            </>
          )}
          {pickerError && (
            <p className="inline-error" role="alert">
              {pickerError}
            </p>
          )}
          <button
            type="button"
            className="secondary composer-token-done"
            onClick={applyPicker}
          >
            {t("Done")}
          </button>
        </div>
      )}
    </div>
  );
}
