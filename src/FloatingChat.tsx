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

export function FloatingChat({
  onActivate,
  onReview,
  state,
  onReference,
  onReviewEvent,
  onApply,
}: {
  onActivate: (open: () => void) => void;
  onReview: (plan: Plan | null, intention: string) => void;
  state: CalendarState;
  onReference: (reference: CalendarReference) => void;
  onReviewEvent: (event: TaskEdit) => void;
  onApply: (proposalId: string) => Promise<void>;
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
  const inputRef = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const conversationId = useId();
  const errorId = useId();
  function open() {
    if (!active)
      onActivate(() => {
        setStarted(true);
        setActive(true);
      });
  }
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
    if (active && log.current) log.current.scrollTop = log.current.scrollHeight;
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
      setResult(response);
      setSelection([]);
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
      const response = await api("calendar/preview", {
        scope: storageScope(),
        selectionId: result.selectionId,
        ids: selection,
      });
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
      await onApply(result.proposalId);
      setResult(null);
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text: "Your approved changes were applied together. Use Undo to restore the previous schedule.",
        },
      ]);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
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
                  "Plan a goal, ask about your calendar, or rearrange upcoming tasks. Review changes before applying them.",
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
            {result?.event && (
              <div className="chat-event-proposal">
                <strong>{result.event.title || t("New event")}</strong>
                <span>
                  {result.event.date} ·{" "}
                  {result.event.allDay
                    ? t("All day")
                    : `${time(result.event.start)}–${time(result.event.start + result.event.minutes)}`}
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setActive(false);
                    onReviewEvent(result.event!);
                  }}
                >
                  {t("Review event")}
                </button>
              </div>
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
          if (!active) open();
          else void send();
        }}
      >
        <input
          ref={inputRef}
          aria-label={t("Message Appa")}
          aria-controls={started ? conversationId : undefined}
          aria-describedby={
            active && (error || auth.error) ? errorId : undefined
          }
          value={input}
          readOnly={busy}
          maxLength={3600}
          placeholder={t("Tell Appa what you want to do…")}
          onClick={open}
          onChange={(event) => setInput(event.target.value)}
        />
        <IconButton
          showTooltip={false}
          type="submit"
          aria-expanded={active}
          aria-controls={started ? conversationId : undefined}
          aria-label={active ? t("Send message") : t("Open chat")}
          disabled={
            active &&
            (busy ||
              !input.trim() ||
              !auth.connection?.connected ||
              !auth.connection.models.length)
          }
        >
          <ArrowUp size={19} weight="bold" />
        </IconButton>
      </form>
    </section>
  );
}
