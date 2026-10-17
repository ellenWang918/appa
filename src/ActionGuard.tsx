import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Dialog } from "./ui";
import { useInterfaceText } from "./InterfaceLanguage";
import { createDraftProtection } from "./actionPatterns";

type Guard = {
  drafts: Map<object, boolean>;
  request: (action: () => void) => void;
  run: (action: () => void) => void;
  confirming: () => boolean;
};
const Context = createContext<Guard | null>(null);

export function ActionGuard({ children }: { children: ReactNode }) {
  const t = useInterfaceText();
  const [pending, setPending] = useState<{ action: () => void } | null>(null);
  const active = useRef(false);
  const guard = useRef<Guard | null>(null);
  if (!guard.current) {
    guard.current = {
      ...createDraftProtection((action) => {
        active.current = true;
        setPending({ action });
      }),
      confirming: () => active.current,
    };
  }
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if ([...guard.current!.drafts.values()].some(Boolean)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  function keepEditing() {
    active.current = false;
    setPending(null);
  }
  return (
    <Context.Provider value={guard.current}>
      {children}
      {pending && (
        <Dialog title={t("Discard changes?")} onClose={keepEditing}>
          <div className="dialog-body">
            <p>
              {t(
                "Your unsaved changes will be lost. Keep editing to save them.",
              )}
            </p>
            <div className="dialog-actions">
              <button autoFocus className="secondary" onClick={keepEditing}>
                {t("Keep editing")}
              </button>
              <button
                className="primary danger-action"
                data-action="destructive"
                onClick={() => {
                  const action = pending.action;
                  keepEditing();
                  guard.current!.run(action);
                }}
              >
                {t("Discard changes")}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </Context.Provider>
  );
}

export function useActionGuard() {
  const guard = useContext(Context);
  if (!guard) throw new Error("ActionGuard is required.");
  return guard;
}

export function useUnsavedChanges(value: unknown) {
  const guard = useActionGuard();
  const initial = useRef(JSON.stringify(value));
  const key = useRef({});
  const dirty = JSON.stringify(value) !== initial.current;
  useLayoutEffect(() => {
    const token = key.current;
    guard.drafts.set(token, dirty);
    return () => {
      guard.drafts.delete(token);
    };
  }, [guard, dirty]);
  return dirty;
}
