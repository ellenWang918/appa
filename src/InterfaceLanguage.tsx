import { createContext, useCallback, useContext } from "react";
import type { ReactNode } from "react";
import { interfaceText } from "./i18n";

const Language = createContext("en-AU");
export function InterfaceLanguage({
  language,
  children,
}: {
  language: string;
  children: ReactNode;
}) {
  return <Language.Provider value={language}>{children}</Language.Provider>;
}
export function useInterfaceText(language?: string) {
  const inherited = useContext(Language);
  const current = language ?? inherited;
  return useCallback(
    (message: string, values?: Readonly<Record<string, string | number>>) =>
      interfaceText(current, message, values),
    [current],
  );
}
