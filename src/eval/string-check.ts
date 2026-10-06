import { createHash } from "node:crypto";
import type { StringCheckResult } from "@/db/schema";
import { buildAnalysisContext } from "@/engine/contexts";
import { planTurn } from "@/engine/plan-turn";
import { initialState, type EngineState } from "@/engine/types";
import { callModel, type CallModelDeps, type CallScope } from "@/llm/call-model";
import { buildAnalysisMessages } from "@/llm/prompts/analysis";
import { buildStringCheckMessages, stringCheckSchema } from "@/llm/prompts/eval-string-check";
import { analysisSchema } from "@/llm/schemas";
import type { Scenario } from "@/scenario/schema";
import { normalizeText } from "@/scenario/text-normalize";

/** A fixed string: text a learner sees exactly as written, so it is checked and approved once, by hand. */
export type FixedString = {
  key: string;
  text: string;
  /** What the string is, as told to the checking model. */
  origin: string;
  /** Set for a sample question: the item it belongs to. */
  sampleOfItemId?: string;
};

/** The fixed strings of a persona (FR-36): opening line, hook lines, sample questions, habit card label. */
export function personaStrings(scenario: Scenario): FixedString[] {
  return [
    { key: "opening_line", text: scenario.opening_line, origin: "lời mở đầu của nhân vật hư cấu" },
    { key: "habit_card_label", text: scenario.habit_card_label, origin: "nhãn mô tả một thói quen hỏi của người học" },
    ...scenario.items.flatMap((item): FixedString[] => [
      { key: `items.${item.id}.hook_line`, text: item.hook_line, origin: "một câu nhân vật hư cấu nói về chính mình" },
      {
        key: `items.${item.id}.sample_question`,
        text: item.sample_question,
        origin: "một câu hỏi mẫu của người phỏng vấn",
        sampleOfItemId: item.id,
      },
    ]),
  ];
}

/** The hash an approval is tied to: any edit of the text gives another hash. */
export function textHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// Matched on text without diacritics and in lower case.
const CLAIM_PATTERNS: { pattern: RegExp; problem: string }[] = [
  {
    pattern: /\d+\s*(%|phan tram)[^.?!]*\b(nguoi dung|khach hang|nguoi hoc|nguoi tre|nguoi viet)\b|\b(nguoi dung|khach hang|nguoi hoc|nguoi tre|nguoi viet)\b[^.?!]*\d+\s*(%|phan tram)/u,
    problem: "Nêu một con số phần trăm về người dùng thật.",
  },
  {
    pattern: /\b(nghien cuu|khao sat|thong ke|so lieu)\b[^.?!]*\b(cho thay|chi ra|chung minh)\b/u,
    problem: "Dẫn một nghiên cứu, khảo sát hay số liệu như sự thật.",
  },
  {
    pattern: /\b(da so|hau het|phan lon)\s+(nguoi dung|khach hang|nguoi tre|nguoi viet|moi nguoi)\b/u,
    problem: "Khẳng định điều gì đó về đa số người dùng thật.",
  },
];

/** The checks that need no model. A string that fails one is not sent to a model at all. */
export function preCheck(text: string): string[] {
  const plain = normalizeText(text);
  return CLAIM_PATTERNS.filter(({ pattern }) => pattern.test(plain)).map(({ problem }) => problem);
}

export type StringCheckOptions = {
  scope: CallScope;
  meta: Record<string, string | number>;
  llmDeps?: Partial<CallModelDeps>;
};

/**
 * The label the production classifier (Call 1) gives a sample question, asked right after the
 * persona said the item's hook line. A sample question shows the learner what a good follow-up
 * looks like, so it is judged where it belongs: after the words it follows up on.
 */
async function sampleQuestionLabel(scenario: Scenario, entry: FixedString, options: StringCheckOptions) {
  const item = scenario.items.find((candidate) => candidate.id === entry.sampleOfItemId)!;
  const transcript = [
    { index: 0, learnerText: null, personaText: scenario.opening_line },
    { index: 1, learnerText: "Chuyện đó thế nào, kể thêm giúp em với ạ?", personaText: item.hook_line },
  ];
  const state: EngineState = {
    ...initialState(scenario.openness_start),
    turnIndex: 1,
    ledger: [{ itemId: item.id, droppedAt: 1, pickedAt: null, ignoredAt: null, closedAt: null }],
  };
  const reply = await callModel(
    "ANALYSIS",
    buildAnalysisMessages(buildAnalysisContext(scenario, state, transcript, entry.text)),
    { schema: analysisSchema, meta: options.meta, scope: options.scope },
    options.llmDeps,
  );
  // The label a learner would be shown: after code checked the evidence the model gave for it.
  return planTurn({ scenario, state, analysis: reply.output, transcript, question: entry.text }).analysis.label;
}

/**
 * FR-36 for one fixed string: no claim about real users, and a sample question is not `leading`.
 * `scenario` is the persona the string belongs to, or null for a product string.
 */
export async function checkString(
  entry: FixedString,
  scenario: Scenario | null,
  options: StringCheckOptions,
): Promise<StringCheckResult> {
  const problems = preCheck(entry.text);
  if (problems.length > 0) return { ok: false, problems };

  const claim = await callModel(
    "STRING_CHECK",
    buildStringCheckMessages({ origin: entry.origin, text: entry.text }),
    { schema: stringCheckSchema, meta: options.meta, scope: options.scope },
    options.llmDeps,
  );
  if (claim.output.real_user_claim) problems.push(`Khẳng định về người dùng thật: ${claim.output.reason}`);

  if (scenario && entry.sampleOfItemId !== undefined) {
    const label = await sampleQuestionLabel(scenario, entry, options);
    if (label === "leading") problems.push("Câu hỏi mẫu bị bộ phân loại gắn nhãn leading.");
  }
  return { ok: problems.length === 0, problems };
}

/** Where one fixed string stands, as it reads now. */
export type StringState = FixedString & {
  /** The automatic check ran on this exact text. */
  checked: boolean;
  checkOk: boolean;
  problems: string[];
  decision: "approved" | "returned" | null;
  approved: boolean;
  note: string | null;
};

/**
 * Joins the fixed strings with what is stored about them. A stored row counts only when it was
 * made for the text as it reads now: an edited string is unchecked and unapproved again.
 */
export function stringStates(
  strings: FixedString[],
  rows: { stringKey: string; textHash: string; fr36Result: StringCheckResult; decision: "approved" | "returned" | null; note: string | null }[],
): StringState[] {
  return strings.map((entry) => {
    const row = rows.find((candidate) => candidate.stringKey === entry.key && candidate.textHash === textHash(entry.text));
    return {
      ...entry,
      checked: row !== undefined,
      checkOk: row?.fr36Result.ok ?? false,
      problems: row?.fr36Result.problems ?? [],
      decision: row?.decision ?? null,
      approved: row?.decision === "approved",
      note: row?.note ?? null,
    };
  });
}
