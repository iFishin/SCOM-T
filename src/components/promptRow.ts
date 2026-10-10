import type { MatchMode } from "../serial/responseMatcher.ts";

export type PromptRowStatus = "idle" | "pending" | "success" | "error";

/**
 * One row of the command grid, as held in UI state.
 * `status` is UI-only and is dropped on serialization.
 */
export type PromptRow = {
  id: number;
  selected: boolean;
  command: string;
  isHex: boolean;
  ender: string;
  interval: string;
  device?: string;
  note?: string;
  expectedResponses?: string[];
  expectedResponseRegex?: boolean[];
  matchMode?: MatchMode;
  status?: PromptRowStatus;
};
