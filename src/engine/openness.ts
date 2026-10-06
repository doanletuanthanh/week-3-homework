import { OPENNESS_MAX } from "@/scenario/schema";
import { isGoodLabel, type Label, type QuestionType } from "./types";

/** Change for one turn, from the label after the code check (addendum §3.1). */
export function opennessDelta(label: Label, questionType: QuestionType): number {
  if (label === "leading") return -2;
  const pastBonus = questionType === "past_specific" ? 1 : 0;
  return (isGoodLabel(label) ? 1 : 0) + pastBonus;
}

export function nextOpenness(current: number, label: Label, questionType: QuestionType): number {
  return Math.min(OPENNESS_MAX, Math.max(0, current + opennessDelta(label, questionType)));
}

export const OPENNESS_LEVELS = ["guarded", "neutral", "warm"] as const;
export type OpennessLevel = (typeof OPENNESS_LEVELS)[number];

/** The persona never sees the number, only one of three levels. */
export function opennessLevel(openness: number): OpennessLevel {
  if (openness <= 3) return "guarded";
  return openness <= 6 ? "neutral" : "warm";
}
