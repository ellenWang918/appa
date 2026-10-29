import { useEffect, useId, useRef, useState } from "react";
import { ArrowUp, Sparkle } from "@phosphor-icons/react";
import type {
  ChatMessage,
  Plan,
  CalendarState,
  AssistantResult,
  CalendarReference,
  TaskEdit,
} from "./types";
import { api } from "./api";
import { useChatgptConnection, ChatgptSignIn } from "./ChatgptAccount";
import { useInterfaceText } from "./InterfaceLanguage";
import { useActionGuard } from "./ActionGuard";
import { IconButton } from "./ui";
import { errorMessage } from "./errors";
import { flushCalendar, storageScope } from "./calendarStorage";
import { assistantChatHistory } from "./planningChat";
import { parseEventInput } from "./eventComposer";
import { InlineEventInput } from "./InlineEventInput";
import type { ComposerInputHandle } from "./InlineEventInput";
import { localDate, clockTime } from "./calendar";
import { eventRepeatLabel } from "./eventRepeat";

export function FloatingChat({
  onActivate,
  onReview,
  state,
  onReference,
  onCreateEvent,
  onApply,
}: {
  onActivate: (open: () => void) => void;
  onReview: (plan: Plan | null, intention: string) => void;
  state: CalendarState;
  onReference: (reference: CalendarReference) => void;
  onCreateEvent: (event: TaskEdit) => void;
  onApply: (proposalId: string, kind: "calendar" | "todos") => Promise<void>;
}) {
  const t = useInterfaceText();
  const guard = useActionGuard();
  const [active, setActive] = useState(false);
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [intention, setIntention] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const auth = useChatgptConnection(true);
  const root = useRef<HTMLElement>(null);
  const inputRef = useRef<ComposerInputHandle>(null);
  const log = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const conversationId = useId();
  const errorId = useId();
  const composerErrorId = useId();
  const composerHintId = useId();
  const [composerError, setComposerError] = useState("");
  const inputEvent = parseEventInput(input, localDate(state.settings.timezone));
  useEffect(() => {
    if (!active) return;
    const outside = (event: PointerEvent) => {
      if (
        !guard.confirming() &&
        event.target instanceof Node &&
        !root.current?.contains(event.target)
      )
        setActive(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !guard.confirming() &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        setActive(false);
        inputRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [active, guard]);
  useEffect(() => {
    if (!active || !log.current) return;
    log.current.scrollTop = log.current.scrollHeight;
  }, [active, messages, busy, error]);
  async function send() {
    const text = input.trim();
    const model = auth.connection?.models[0]?.id;
    if (!text || lock.current || !model || !auth.connection?.connected) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const conversation = [...messages, { role: "user" as const, text }];
    setMessages(conversation);
    setInput("");
    try {
      await flushCalendar(state);
      const response = await api("assistant", {
        scope: storageScope(),
        messages: assistantChatHistory(messages, result),
        message: text,
        model,
      });
      setResult(response.event ? null : response);
      if (response.event) {
        const event = response.event;
        setInput(
          `${event.title} on ${event.date} ${event.allDay ? "all day" : `at ${clockTime(event.start)} for ${event.minutes} min`}${event.repeat && event.repeat !== "none" ? ` ${eventRepeatLabel(event.repeat).toLowerCase()}` : ""}`,
        );
        setActive(false);
        inputRef.current?.focus();
      }
      setSelection(
        response.kind === "todo_selection" && response.todos?.length === 1
          ? [response.todos[0].id]
          : [],
      );
      setIntention(text);
      setMessages([
        ...conversation,
        { role: "assistant", text: response.message },
      ]);
    } catch (caught) {
      setMessages(conversation.slice(0, -1));
      setInput(text);
      setError(errorMessage(caught));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function preview() {
    if (!result?.selectionId || lock.current || !selection.length) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await flushCalendar(state);
      const response = await api(
        result.kind === "todo_selection" ? "todos/preview" : "calendar/preview",
        {
          scope: storageScope(),
          selectionId: result.selectionId,
          ids: selection,
        },
      );
      setResult(response);
      setMessages((previous) => [
        ...previous,
        { role: "assistant", text: response.message },
      ]);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function apply() {
    if (!result?.proposalId || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const todo = result.kind === "todo_proposal";
      await onApply(result.proposalId, todo ? "todos" : "calendar");
      setResult(null);
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text: todo
            ? "Your approved to do changes were applied together. Use Undo to restore them.\n" +
              (result.todoChanges ?? [])
                .map((change) =>
                  change.event
                    ? `${change.before?.title}: scheduled ${change.event.date} at ${change.event.allDay ? "All day" : time(change.event.start)}`
                    : !change.after
                      ? `${change.before?.title}: removed`
                      : `${change.after.title}: ${change.after.done ? "completed" : "pending"}`,
                )
                .join("\n")
            : "Your approved changes were applied together. Use Undo to restore the previous schedule.",
        },
      ]);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function submit() {
    if (lock.current || busy) return;
    if (inputEvent.candidate) {
      setActive(false);
      const event = inputEvent.event;
      if (!event) {
        setComposerError(
          inputEvent.issue ?? t("Add a date and time for this event."),
        );
        return;
      }
      onActivate(() => {
        if (lock.current) return;
        lock.current = true;
        try {
          onCreateEvent(event);
          setInput("");
          setComposerError("");
          inputRef.current?.focus();
        } catch (caught) {
          setComposerError(errorMessage(caught));
        } finally {
          lock.current = false;
        }
      });
      return;
    }
    if (auth.connection?.connected && !input.trim()) return;
    if (active) void send();
    else
      onActivate(() => {
        setStarted(true);
        setActive(true);
        void send();
      });
  }
  const time = (start: number) =>
    `${Math.floor(start / 60)
      .toString()
      .padStart(2, "0")}:${(start % 60).toString().padStart(2, "0")}`;
  return (
    <section
      ref={root}
      className={`floating-chat ${active ? "active" : ""}`}
      aria-label={t("Appa chat")}
    >
      {started && (
        <div
          hidden={!active}
          className="floating-chat-body"
          id={conversationId}
        >
          <header className="floating-chat-header">
            <Sparkle size={15} weight="fill" aria-hidden="true" />
            <h2>{t("Appa")}</h2>
          </header>
          <div
            ref={log}
            className="floating-chat-conversation"
            role="log"
            aria-label={t("Conversation")}
            aria-relevant="additions text"
          >
            {!auth.connection?.connected && <ChatgptSignIn auth={auth} />}
            {!messages.length && auth.connection?.connected && (
              <p className="small muted">
                {t(
                  "Plan a goal, manage your To do list, or ask about your calendar. To add an event directly, type its name, date and time in the composer and press Enter.",
                )}
              </p>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
                className={`floating-chat-message ${message.role}`}
              >
                {message.role === "assistant" && (
                  <span className="floating-chat-avatar" aria-hidden="true">
                    <Sparkle size={17} weight="fill" />
                  </span>
                )}
                <div>{message.text}</div>
              </div>
            ))}
            {busy && (
              <p className="small muted" role="status">
                {t("Working on your request…")}
              </p>
            )}
            {result?.plan && !result.plan.clarification && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setActive(false);
                  onReview(result.plan!, intention);
                }}
              >
                {t("Review plan")}
              </button>
            )}
            {result?.kind === "selection" && (
              <fieldset className="chat-calendar-selection">
                <legend>{t("Entries to move")}</legend>
                {result.references.map((ref) => (
                  <label key={ref.id}>
                    <input
                      type="checkbox"
                      checked={selection.includes(ref.id)}
                      disabled={busy}
                      onChange={(event) =>
                        setSelection((ids) =>
                          event.target.checked
                            ? [...ids, ref.id]
                            : ids.filter((id) => id !== ref.id),
                        )
                      }
                    />
                    <span>
                      {ref.title}
                      <small>
                        {ref.date} ·{" "}
                        {ref.allDay ? t("All day") : time(ref.start)}
                        {ref.goalName ? ` · ${ref.goalName}` : ""}
                        {ref.recurring ? " · " + t("This occurrence only") : ""}
                      </small>
                    </span>
                  </label>
                ))}
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || !selection.length}
                  onClick={() => void preview()}
                >
                  {t("Preview new times")}
                </button>
              </fieldset>
            )}
            {result?.kind === "todo_answer" && !!result.todos?.length && (
              <ul className="chat-todo-results">
                {result.todos.map((todo) => (
                  <li key={todo.id}>
                    <strong>{todo.title}</strong>
                    <small>{todo.done ? t("Completed") : t("Pending")}</small>
                  </li>
                ))}
              </ul>
            )}
            {result?.kind === "todo_selection" && (
              <fieldset className="chat-calendar-selection">
                <legend>{t("To dos to change")}</legend>
                {result.todos?.map((todo) => (
                  <label key={todo.id}>
                    <input
                      type="checkbox"
                      checked={selection.includes(todo.id)}
                      disabled={busy}
                      onChange={(event) =>
                        setSelection((ids) =>
                          event.target.checked
                            ? [...ids, todo.id]
                            : ids.filter((id) => id !== todo.id),
                        )
                      }
                    />
                    <span>
                      {todo.title}
                      <small>{todo.done ? t("Completed") : t("Pending")}</small>
                    </span>
                  </label>
                ))}
                <button
                  type="button"
                  className="secondary"
                  disabled={
                    busy ||
                    !selection.length ||
                    (["rename", "schedule"].includes(
                      result.todoRequest?.action ?? "",
                    ) &&
                      selection.length !== 1)
                  }
                  onClick={() => void preview()}
                >
                  {t("Review to do changes")}
                </button>
                {["rename", "schedule"].includes(
                  result.todoRequest?.action ?? "",
                ) && (
                  <p className="small muted">
                    {t("Choose one item for this change.")}
                  </p>
                )}
              </fieldset>
            )}
            {result?.kind === "todo_proposal" && (
              <div className="chat-move-proposal">
                <ul>
                  {result.todoChanges?.map((change) => (
                    <li key={change.id}>
                      <strong>
                        {change.after?.title ?? change.before?.title}
                      </strong>
                      <span>
                        {change.event
                          ? `${t("Schedule")}: ${change.event.date} · ${change.event.allDay ? t("All day") : `${time(change.event.start)}–${time(change.event.start + change.event.minutes)}`}`
                          : !change.before
                            ? t("Add to To do list")
                            : !change.after
                              ? t("Remove from To do list")
                              : change.before.title !== change.after.title
                                ? `${change.before.title} → ${change.after.title}`
                                : change.after.done
                                  ? t("Mark as complete")
                                  : t("Mark as incomplete")}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => void apply()}
                >
                  {t("Apply to do changes")}
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => setResult(null)}
                >
                  {t("Cancel changes")}
                </button>
              </div>
            )}
            {result?.kind === "answer" && result.references.length > 0 && (
              <div className="chat-event-references">
                {result.references.map((ref) => (
                  <button
                    type="button"
                    className="text-button"
                    key={ref.id}
                    onClick={() => {
                      setActive(false);
                      onReference(ref);
                    }}
                  >
                    {ref.title} · {ref.date} ·{" "}
                    {ref.allDay ? t("All day") : time(ref.start)}
                  </button>
                ))}
              </div>
            )}
            {result?.kind === "proposal" && (
              <div className="chat-move-proposal">
                <ul>
                  {result.moves?.map((move) => (
                    <li key={move.id}>
                      <strong>{move.title}</strong>
                      <span>
                        {move.fromDate} ·{" "}
                        {move.allDay ? t("All day") : time(move.fromStart)}
                      </span>
                      <span>
                        → {move.toDate} ·{" "}
                        {move.allDay ? t("All day") : time(move.toStart)}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => void apply()}
                >
                  {t("Apply changes")}
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => setResult(null)}
                >
                  {t("Cancel changes")}
                </button>
              </div>
            )}
            {(error || auth.error) && (
              <p className="inline-error" role="alert" id={errorId}>
                {t(error || auth.error)}
              </p>
            )}
            {auth.error && (
              <button
                type="button"
                className="text-button"
                onClick={auth.check}
                disabled={!!auth.busy}
              >
                {t("Check connection")}
              </button>
            )}
            <button
              type="button"
              className="text-button floating-chat-manual"
              disabled={busy}
              onClick={() => {
                setActive(false);
                onReview(null, input);
              }}
            >
              {t("Write a plan myself")}
            </button>
          </div>
        </div>
      )}
      <form
        className="planning-composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <InlineEventInput
          ref={inputRef}
          value={input}
          parsed={inputEvent}
          language={state.settings.language}
          disabled={busy}
          controls={started ? conversationId : undefined}
          describedBy={
            composerError
              ? composerErrorId
              : inputEvent.candidate
                ? composerHintId
                : active && (error || auth.error)
                  ? errorId
                  : undefined
          }
          onChange={(text) => {
            setInput(text);
            setComposerError("");
            if (
              parseEventInput(text, localDate(state.settings.timezone))
                .candidate
            )
              setActive(false);
          }}
          onSubmit={submit}
        />
        <IconButton
          showTooltip={true}
          type="submit"
          aria-expanded={inputEvent.candidate ? undefined : active}
          aria-controls={
            started && !inputEvent.candidate ? conversationId : undefined
          }
          aria-label={t(
            inputEvent.candidate
              ? "Add event"
              : auth.connection?.connected
                ? "Send message"
                : "Sign in to ChatGPT first",
          )}
          disabled={
            busy ||
            (!inputEvent.candidate &&
              !!auth.connection?.connected &&
              (!input.trim() || !auth.connection.models.length))
          }
        >
          <ArrowUp size={19} weight="bold" />
        </IconButton>
      </form>
      {composerError ? (
        <p
          className="composer-feedback error"
          role="alert"
          id={composerErrorId}
        >
          {t(composerError)}
        </p>
      ) : (
        inputEvent.candidate && (
          <p className="composer-feedback" id={composerHintId}>
            {inputEvent.event
              ? `${t("Enter to add event")} · ${inputEvent.event.allDay ? t("All day") : t("{minutes} min", { minutes: inputEvent.event.minutes })}`
              : t(inputEvent.issue ?? "Add a date and time for this event.")}
          </p>
        )
      )}
    </section>
  );
}
