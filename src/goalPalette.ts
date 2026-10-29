import type { GoalColor } from "./types.js";

export const GOAL_PALETTE = [
  { value: "indigo", label: "Sage" },
  { value: "slate", label: "Slate blue" },
  { value: "amber", label: "Ochre" },
  { value: "rose", label: "Dusty plum" },
  { value: "clay", label: "Clay" },
  { value: "teal", label: "Muted teal" },
] as const satisfies readonly { value: GoalColor; label: string }[];
export const COLORS: GoalColor[] = GOAL_PALETTE.map(({ value }) => value);
