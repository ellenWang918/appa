export const desktop = Boolean(
  globalThis.window?.goalCalendarDesktop?.isDesktop,
);
export const localPlace = desktop ? "on this computer" : "in this browser";
