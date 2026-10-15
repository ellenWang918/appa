import { ENGLISH_MESSAGES } from "./locales/en-AU.js";

export const INTERFACE_LANGUAGES = [
  { value: "en-AU", label: "English" },
] as const;
type MessageValues = Readonly<Record<string, string | number>>;
type MessageCatalog = Readonly<Record<string, string>>;
// Register a complete translated catalog before enabling its language above.
const catalogs: Readonly<Record<string, MessageCatalog>> = {
  "en-AU": ENGLISH_MESSAGES,
};

export function interfaceText(
  language: string,
  message: string,
  values: MessageValues = {},
): string {
  const catalog = Object.hasOwn(catalogs, language)
    ? catalogs[language]
    : ENGLISH_MESSAGES;
  const template = Object.hasOwn(catalog, message)
    ? catalog[message]
    : Object.hasOwn(ENGLISH_MESSAGES, message)
      ? ENGLISH_MESSAGES[message]
      : message;
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder,
  );
}
