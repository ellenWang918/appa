import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowSquareOut, CheckCircle, Sparkle } from "@phosphor-icons/react";
import { api, session } from "./api";
import { desktop, localPlace } from "./environment";
import { errorMessage } from "./errors";
import { useInterfaceText } from "./InterfaceLanguage";
import type { SessionResponse } from "./types";

export function useChatgptConnection(loadModels = false) {
  const [connection, setConnection] = useState<SessionResponse | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [accountId, setAccountId] = useState("");
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++requestId.current;
    try {
      const result = await session();
      if (request !== requestId.current) return null;
      setConnection(result);
      if (result.connected) setLink("");
      if (result.connected && loadModels && !result.models.length) {
        let data;
        try {
          data = await api("models");
        } catch (caught) {
          const current = await session();
          if (request === requestId.current) setConnection(current);
          throw caught;
        }
        if (request !== requestId.current) return null;
        setConnection({ ...result, models: data.models });
      }
      setError("");
      return result;
    } catch (caught) {
      if (request === requestId.current) setError(errorMessage(caught));
      return null;
    }
  }, [loadModels]);

  useEffect(() => {
    void refresh();
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      requestId.current++;
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  useEffect(() => {
    if (!link || connection?.connected) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [link, connection?.connected, refresh]);

  async function perform(action: string, work: () => Promise<void>) {
    setBusy(action);
    setError("");
    try {
      await work();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }
  return {
    connection,
    busy,
    error,
    link,
    accountId,
    setAccountId,
    connect: () =>
      perform("connect", async () => {
        const result = await api("auth/start", {
          accountId: accountId || null,
        });
        setLink(result.url);
      }),
    check: () =>
      perform("check", async () => {
        const result = await refresh();
        if (result && !result.connected)
          throw new Error(
            "Finish signing in in the ChatGPT tab, then check again.",
          );
      }),
    disconnect: () =>
      perform("disconnect", async () => {
        requestId.current++;
        const result = await api("auth/disconnect", {});
        setLink("");
        await refresh();
        if (!result.revoked)
          throw new Error(
            "Disconnected here. Open ChatGPT Settings to revoke the connection; remote revocation could not be confirmed.",
          );
      }),
  };
}

type ChatgptConnection = ReturnType<typeof useChatgptConnection>;

export function ChatgptSignIn({
  auth,
  disabled = false,
  variant = "supporting",
}: {
  auth: ChatgptConnection;
  disabled?: boolean;
  variant?: "primary" | "supporting";
}) {
  const t = useInterfaceText();
  return (
    <>
      <p className="small muted">
        {t(
          "Connect your own eligible Plus or Pro account. Your calendar stays",
        )}{" "}
        {localPlace}
        {t(
          ". Your messages and the calendar context needed for your request go to OpenAI.",
        )}
      </p>
      {!!auth.connection?.accounts.length && (
        <label className="field small">
          {t("Account")}
          <select
            value={auth.accountId}
            disabled={!!auth.busy || disabled}
            onChange={(event) => auth.setAccountId(event.target.value)}
          >
            <option value="">{t("Connect another account")}</option>
            {auth.connection.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="connect-actions">
        {auth.link ? (
          <>
            <a
              className="primary"
              href={auth.link}
              target="_blank"
              rel="noreferrer"
            >
              {t("Continue to ChatGPT")}
              <ArrowSquareOut size={16} aria-hidden="true" />
              <span className="sr-only">{t("(opens in a new tab)")}</span>
            </a>
            <button
              type="button"
              className="supporting"
              disabled={!!auth.busy || disabled}
              onClick={auth.check}
            >
              {auth.busy === "check" ? t("Checking…") : t("Check connection")}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={variant}
            disabled={!!auth.busy || disabled || !auth.connection}
            onClick={auth.connect}
          >
            {auth.busy === "connect"
              ? t("Preparing sign-in…")
              : t("Sign in with ChatGPT")}
          </button>
        )}
      </div>
      <p className="fine-print">
        {desktop
          ? t(
              "Sign in once. Appa securely remembers your account on this computer.",
            )
          : t("Sign-in is remembered in the desktop app.")}{" "}
        <a
          href="https://developers.openai.com/siwc/token-sharing-open-source"
          target="_blank"
          rel="noreferrer"
        >
          {t("How it works")}
          <ArrowSquareOut size={12} aria-hidden="true" />
          <span className="sr-only">{t("(opens in a new tab)")}</span>
        </a>
      </p>
    </>
  );
}

export function UserSettings() {
  const t = useInterfaceText();
  const auth = useChatgptConnection();
  return (
    <fieldset className="settings-section user-settings">
      <legend>{t("User")}</legend>
      {auth.connection?.connected ? (
        <>
          <div className="user-account">
            <CheckCircle size={24} className="teal-text" aria-hidden="true" />
            <div>
              <strong>{auth.connection.account?.label}</strong>
              <p className="small muted">{t("ChatGPT connected")}</p>
            </div>
            <button
              type="button"
              className="supporting"
              disabled={!!auth.busy}
              onClick={auth.disconnect}
            >
              {auth.busy === "disconnect" ? t("Signing out…") : t("Sign out")}
            </button>
          </div>
          <p className="small muted">
            {auth.connection.remembered
              ? t("You’ll stay signed in when you reopen Appa.")
              : t("Signed in for this session.")}
          </p>
        </>
      ) : auth.connection ? (
        <>
          <div className="connection-title">
            <Sparkle size={20} aria-hidden="true" />
            <strong>{t("Sign in with ChatGPT")}</strong>
          </div>
          <ChatgptSignIn auth={auth} variant="primary" />
        </>
      ) : (
        <p className="small muted" role="status">
          {t("Checking your account…")}
        </p>
      )}
      {(auth.error || auth.connection?.notice) && (
        <p className="inline-error" role="alert">
          {t(auth.error || auth.connection?.notice || "")}
        </p>
      )}
      {auth.connection?.signOutPending && (
        <button
          type="button"
          className="supporting"
          disabled={!!auth.busy}
          onClick={auth.disconnect}
        >
          {t("Try signing out again")}
        </button>
      )}
    </fieldset>
  );
}
