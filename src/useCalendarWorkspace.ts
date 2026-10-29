import { useCallback, useEffect, useRef, useState } from "react";
import type { SetStateAction } from "react";
import type { CalendarState } from "./types";
import { api } from "./api";
import {
  acceptStoredCalendar,
  flushCalendar,
  retryCalendar,
  saveCalendar,
  storageScope,
} from "./calendarStorage";
import { errorMessage } from "./errors";

export function useCalendarWorkspace(initial: {
  state: CalendarState;
  error: string;
}) {
  const [state, renderState] = useState(initial.state);
  const latestState = useRef(state);
  const [saveError, setSaveError] = useState(initial.error);
  const [persistBlocked, setPersistBlocked] = useState(!!initial.error);
  const [retryingSave, setRetryingSave] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const applyingRef = useRef(false);
  const [calendarApplying, setCalendarApplying] = useState(false);
  // Every edit updates the authoritative value before the next command can run.
  const setState = useCallback((update: SetStateAction<CalendarState>) => {
    const next =
      typeof update === "function" ? update(latestState.current) : update;
    latestState.current = next;
    renderState(next);
  }, []);
  useEffect(() => {
    if (persistBlocked) return;
    let cancelled = false;
    void saveCalendar(state)
      .then(() => {
        if (!cancelled) setSaveError("");
      })
      .catch((caught: unknown) => {
        if (!cancelled) setSaveError(errorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [state, persistBlocked]);
  function change(
    command: (current: CalendarState) => CalendarState,
    message = "",
  ) {
    try {
      setState(command);
      setError("");
      setNotice(message);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }
  async function retrySave() {
    if (retryingSave) return;
    setRetryingSave(true);
    try {
      await retryCalendar(latestState.current);
      setSaveError("");
    } catch (caught) {
      setSaveError(errorMessage(caught));
    } finally {
      setRetryingSave(false);
    }
  }
  async function applyProposal(proposalId: string, kind: "calendar" | "todos") {
    if (applyingRef.current)
      throw new Error("One calendar change is already being applied.");
    applyingRef.current = true;
    setCalendarApplying(true);
    try {
      await flushCalendar(latestState.current);
      const saved = await api(
        kind === "todos" ? "todos/apply" : "calendar/apply",
        { scope: storageScope(), proposalId },
      );
      if (!saved.state)
        throw new Error(
          "The calendar changes could not be loaded. Reopen Appa.",
        );
      acceptStoredCalendar(saved);
      setState(saved.state);
      setNotice(
        kind === "todos" ? "To do list updated." : "Calendar replanned.",
      );
    } finally {
      applyingRef.current = false;
      setCalendarApplying(false);
    }
  }
  return {
    state,
    setState,
    latestState,
    saveError,
    persistBlocked,
    setPersistBlocked,
    error,
    setError,
    notice,
    setNotice,
    change,
    retrySave,
    retryingSave,
    applyProposal,
    applyingRef,
    calendarApplying,
  };
}
