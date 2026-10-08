import { z } from "zod";
import { applyVerdict } from "@/engine/apply-verdict";
import { buildAnalysisContext } from "@/engine/contexts";
import { planTurn } from "@/engine/plan-turn";
import { resolveVerdicts } from "@/engine/reveal-claims";
import { resolveCanvasMatches } from "@/engine/reveal-compute";
import { buildEndJudgeContext, buildVerifierContext } from "@/engine/reveal-contexts";
import { CANVAS_MATCH_KINDS, type CanvasMatch, type RevealBasis, type VerifierCheck } from "@/engine/reveal-types";
import { tokenize, type TokenRange } from "@/engine/tokens";
import { LABELS, initialState, type EngineState, type Label } from "@/engine/types";
import { judgeTurn } from "@/graphs/turn-graph";
import { callModel, type CallModelDeps, type CallScope } from "@/llm/call-model";
import { buildAnalysisMessages } from "@/llm/prompts/analysis";
import { buildEndJudgeMessages } from "@/llm/prompts/end-judge";
import { buildVerifierMessages } from "@/llm/prompts/verifier";
import { analysisSchema, endJudgeSchema, verifierSchema } from "@/llm/schemas";
import type { Scenario } from "@/scenario/schema";

/**
 * Hand-labelled test sets for NFR-7. One JSON object per line. Every case is played against a
 * scenario file; `transcript` holds the turns after the opening line, which is added from the
 * scenario.
 */
const exchange = z.strictObject({ learner: z.string().min(1), persona: z.string().min(1) });

/** `label-classifier`: the label the production classifier must give a new question. */
export const labelCaseSchema = z.strictObject({
  id: z.string().min(1),
  transcript: z.array(exchange),
  question: z.string().min(1),
  expected: z.enum(LABELS),
  note: z.string().optional(),
});
export type LabelCase = z.infer<typeof labelCaseSchema>;

/**
 * `turn-verdict`: the verdict the turn judge must give the last persona turn. `unlocked` are the
 * items open at that turn, `told` the ones already told before it, `selected_hook` the item whose
 * hook the persona was asked to drop in it.
 */
export const verdictCaseSchema = z.strictObject({
  id: z.string().min(1),
  unlocked: z.array(z.string()),
  told: z.array(z.string()).default([]),
  selected_hook: z.string().nullable(),
  transcript: z.array(exchange).min(1),
  expected: z.strictObject({ told: z.array(z.string()), hook_dropped: z.boolean() }),
  note: z.string().optional(),
});
export type VerdictCase = z.infer<typeof verdictCaseSchema>;

/**
 * `canvas-judge`: what the end judge must find in a learner's notes. `unlocked`, `told` and
 * `dropped` (items whose hook the persona dropped) set the scene; each entry of `expected` is a
 * stretch of the notes, word for word, with what it must be judged as. `none` is a stretch that
 * must stay unmarked: a surface fact, a topic touched without the content, a negation.
 */
export const canvasCaseSchema = z.strictObject({
  id: z.string().min(1),
  unlocked: z.array(z.string()).default([]),
  told: z.array(z.string()).default([]),
  dropped: z.array(z.string()).default([]),
  transcript: z.array(exchange).min(1),
  notes: z.string().min(1),
  expected: z.array(z.strictObject({ phrase: z.string().min(1), kind: z.enum([...CANVAS_MATCH_KINDS, "none"]), item: z.string().optional() })).min(1),
  note: z.string().optional(),
});
export type CanvasCase = z.infer<typeof canvasCaseSchema>;

/**
 * `leading-novelty`: whether the words a learner added in their last question were new. `span` is
 * those words as written in that question; `said` means the persona had already said the idea.
 */
export const noveltyCaseSchema = z.strictObject({
  id: z.string().min(1),
  transcript: z.array(exchange),
  question: z.string().min(1),
  span: z.string().min(1),
  expected: z.enum(["novel", "said"]),
  note: z.string().optional(),
});
export type NoveltyCase = z.infer<typeof noveltyCaseSchema>;

export const SET_KINDS = ["label-classifier", "turn-verdict", "canvas-judge", "leading-novelty"] as const;
export type SetKind = (typeof SET_KINDS)[number];

/** NFR-7: a set proves a gate only from this size up. */
export const MIN_SET_SIZE = 100;
/** NFR-7 asks for fewer cases of leading novelty. */
export const MIN_NOVELTY_SET_SIZE = 50;
const MAX_BLAME_RATE = 0.05;
const MIN_LABEL_AGREEMENT = 0.85;

export class TestSetError extends Error {}

/** Parses a JSONL test set; a line that does not fit the format is reported with its number. */
export function parseTestSet<T>(raw: string, schema: z.ZodType<T>): T[] {
  const cases: T[] = [];
  const ids = new Set<string>();
  raw.split(/\r?\n/u).forEach((line, index) => {
    if (line.trim() === "") return;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new TestSetError(`Dòng ${index + 1}: không phải JSON hợp lệ.`);
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new TestSetError(`Dòng ${index + 1}: ${issue.path.join(".") || "(gốc)"}: ${issue.message}`);
    }
    const id = (parsed.data as { id: string }).id;
    if (ids.has(id)) throw new TestSetError(`Dòng ${index + 1}: id "${id}" bị trùng.`);
    ids.add(id);
    cases.push(parsed.data);
  });
  return cases;
}

/** One NFR-7 rate against its hard gate. `value` is null when the set has no case that measures it. */
export type Rate = { key: string; label: string; value: number | null; limit: number; atLeast: boolean; met: boolean; count: string };

function rate(key: string, label: string, hits: number, total: number, limit: number, atLeast = false): Rate {
  const value = total === 0 ? null : hits / total;
  // A rate nothing measured cannot be called met.
  const met = value !== null && (atLeast ? value >= limit : value <= limit);
  return { key, label, value, limit, atLeast, met, count: `${hits}/${total}` };
}

export type SetScore = {
  size: number;
  rates: Rate[];
  mismatches: string[];
  /** Cases the set needs to prove its gate; `MIN_SET_SIZE` when not given. */
  minSize?: number;
};

/** NFR-7, label classifier: good questions wrongly called `leading`, and overall agreement. */
export function scoreLabelSet(rows: { id: string; expected: Label; predicted: Label }[]): SetScore {
  const good = rows.filter((row) => row.expected !== "leading");
  return {
    size: rows.length,
    rates: [
      rate("good_as_leading", "Câu tốt bị gắn nhầm leading", good.filter((row) => row.predicted === "leading").length, good.length, MAX_BLAME_RATE),
      rate("agreement", "Đồng thuận với nhãn gán tay", rows.filter((row) => row.predicted === row.expected).length, rows.length, MIN_LABEL_AGREEMENT, true),
    ],
    mismatches: rows.filter((row) => row.predicted !== row.expected).map((row) => `${row.id}: gán tay ${row.expected}, máy ${row.predicted}`),
  };
}

export type VerdictRow = {
  id: string;
  hookSelected: boolean;
  expected: { told: string[]; hook_dropped: boolean };
  predicted: { told: string[]; hook_dropped: boolean };
};

/** NFR-7, judge verdict: the three directions in which a wrong verdict blames the learner. */
export function scoreVerdictSet(rows: VerdictRow[]): SetScore {
  const expectedTold = rows.flatMap((row) => row.expected.told.map((itemId) => ({ row, itemId })));
  const toldMissed = expectedTold.filter(({ row, itemId }) => !row.predicted.told.includes(itemId));
  const withHook = rows.filter((row) => row.hookSelected);
  const dropped = withHook.filter((row) => row.expected.hook_dropped);
  const notDropped = withHook.filter((row) => !row.expected.hook_dropped);
  const sameTold = (row: VerdictRow) => [...row.expected.told].sort().join() === [...row.predicted.told].sort().join();

  return {
    size: rows.length,
    rates: [
      rate("told_missed", "Điều đã kể bị chấm \"chưa kể\"", toldMissed.length, expectedTold.length, MAX_BLAME_RATE),
      rate("drop_missed", "Hook đã thả bị chấm \"chưa thả\"", dropped.filter((row) => !row.predicted.hook_dropped).length, dropped.length, MAX_BLAME_RATE),
      rate("drop_invented", "Hook chưa thả bị chấm \"đã thả\"", notDropped.filter((row) => row.predicted.hook_dropped).length, notDropped.length, MAX_BLAME_RATE),
    ],
    mismatches: rows
      .filter((row) => !sameTold(row) || row.expected.hook_dropped !== row.predicted.hook_dropped)
      .map(
        (row) =>
          `${row.id}: gán tay kể=[${row.expected.told.join(", ")}] thả=${row.expected.hook_dropped}, máy kể=[${row.predicted.told.join(", ")}] thả=${row.predicted.hook_dropped}`,
      ),
  };
}

/**
 * Exit code of `judgement-eval`: 1 when a hard gate is missed, 2 when every rate passes but the
 * set is too small to prove the gate (a starter set), 0 only when both hold.
 */
export function judgementExitCode(score: SetScore): 0 | 1 | 2 {
  if (score.rates.some((entry) => !entry.met)) return 1;
  return score.size < (score.minSize ?? MIN_SET_SIZE) ? 2 : 0;
}

export type CanvasRow = {
  id: string;
  phrase: string;
  expected: { kind: CanvasCase["expected"][number]["kind"]; item: string | null };
  /** What the judge's match over that stretch was, after the code checks; `none` when there was none. */
  predicted: { kind: CanvasCase["expected"][number]["kind"]; item: string | null };
};

/**
 * NFR-7, canvas judge: a correct paraphrase of an item that was missed or called "never said"
 * blames the learner for a note they got right. A stretch that should stay unmarked but was
 * marked is reported as a mismatch and is not part of the gate.
 */
export function scoreCanvasSet(rows: CanvasRow[]): SetScore {
  const items = rows.filter((row) => row.expected.item !== null);
  const blamed = items.filter((row) => row.predicted.item !== row.expected.item);
  const wrong = rows.filter((row) => row.predicted.kind !== row.expected.kind || row.predicted.item !== row.expected.item);
  const show = (side: CanvasRow["expected"]) => (side.item === null ? side.kind : `${side.kind} ${side.item}`);
  return {
    size: rows.length,
    rates: [rate("paraphrase_missed", "Đoạn diễn đạt đúng bị bỏ lỡ hoặc gắn nhầm \"chưa từng được nói\"", blamed.length, items.length, MAX_BLAME_RATE)],
    mismatches: wrong.map((row) => `${row.id} "${row.phrase}": gán tay ${show(row.expected)}, máy ${show(row.predicted)}`),
  };
}

/** NFR-7, leading novelty: words the persona had already said, taken for words the learner added. */
export function scoreNoveltySet(rows: { id: string; expected: "novel" | "said"; predicted: "novel" | "said" }[]): SetScore {
  const said = rows.filter((row) => row.expected === "said");
  return {
    size: rows.length,
    minSize: MIN_NOVELTY_SET_SIZE,
    rates: [rate("said_as_novel", "Cụm persona đã nói bị coi là tự thêm", said.filter((row) => row.predicted === "novel").length, said.length, MAX_BLAME_RATE)],
    mismatches: rows.filter((row) => row.predicted !== row.expected).map((row) => `${row.id}: gán tay ${row.expected}, máy ${row.predicted}`),
  };
}

export type JudgementOptions = { scope: CallScope; llmDeps?: Partial<CallModelDeps> };

const toTranscript = (scenario: Scenario, exchanges: { learner: string; persona: string }[]) => [
  { index: 0, learnerText: null as string | null, personaText: scenario.opening_line },
  ...exchanges.map((turn, position) => ({ index: position + 1, learnerText: turn.learner as string | null, personaText: turn.persona })),
];

function itemIds(scenario: Scenario, caseId: string, ids: string[]): string[] {
  for (const id of ids) {
    if (!scenario.items.some((item) => item.id === id)) throw new TestSetError(`${caseId}: kịch bản không có item "${id}".`);
  }
  return ids;
}

/** Runs the production Call 1 on each case and keeps the label a learner would be shown for it. */
export async function runLabelSet(scenario: Scenario, cases: LabelCase[], options: JudgementOptions): Promise<SetScore> {
  const rows = [];
  for (const entry of cases) {
    const transcript = toTranscript(scenario, entry.transcript);
    const state: EngineState = { ...initialState(scenario.openness_start), turnIndex: entry.transcript.length };
    const reply = await callModel(
      "ANALYSIS",
      buildAnalysisMessages(buildAnalysisContext(scenario, state, transcript, entry.question)),
      { schema: analysisSchema, meta: { judgement_case: entry.id }, scope: options.scope },
      options.llmDeps,
    );
    const { analysis } = planTurn({ scenario, state, analysis: reply.output, transcript, question: entry.question });
    rows.push({ id: entry.id, expected: entry.expected, predicted: analysis.label });
  }
  return scoreLabelSet(rows);
}

/** Runs the production turn judge on each case and keeps the verdict code accepted. */
export async function runVerdictSet(scenario: Scenario, cases: VerdictCase[], options: JudgementOptions): Promise<SetScore> {
  const rows: VerdictRow[] = [];
  for (const entry of cases) {
    const turnIndex = entry.transcript.length;
    const at = (itemId: string) => ({ itemId, turn: turnIndex });
    const hook = entry.selected_hook === null ? null : itemIds(scenario, entry.id, [entry.selected_hook])[0];
    const state: EngineState = {
      ...initialState(scenario.openness_start),
      turnIndex,
      unlocked: itemIds(scenario, entry.id, entry.unlocked).map(at),
      disclosed: itemIds(scenario, entry.id, entry.told).map(at),
      selectedHook: hook,
    };
    itemIds(scenario, entry.id, entry.expected.told);
    const verdict = await judgeTurn(
      { scenario, state, transcript: toTranscript(scenario, entry.transcript) },
      { scope: options.scope, meta: { judgement_case: entry.id }, llmDeps: options.llmDeps },
    );
    const { applied } = applyVerdict(scenario, state, verdict);
    rows.push({
      id: entry.id,
      hookSelected: hook !== null,
      expected: entry.expected,
      predicted: { told: applied.disclosed_item_ids, hook_dropped: applied.hook_dropped },
    });
  }
  return scoreVerdictSet(rows);
}

/** Where `phrase` sits in the tokens of `text`. */
function phraseRange(caseId: string, text: string, phrase: string): TokenRange {
  const tokens = tokenize(text);
  const words = tokenize(phrase);
  const start = tokens.findIndex((_, index) => words.every((word, offset) => tokens[index + offset] === word));
  if (start < 0) throw new TestSetError(`${caseId}: không tìm thấy "${phrase}" trong văn bản của ca này.`);
  return [start, start + words.length - 1];
}

/** The frozen session a reveal call reads, from a hand-written case. */
function caseBasis(scenario: Scenario, entry: { transcript: { learner: string; persona: string }[] }, state: Partial<EngineState>, notes: string): RevealBasis {
  const turnIndex = entry.transcript.length;
  return {
    scenario,
    turns: toTranscript(scenario, entry.transcript).map((line) => ({
      ...line,
      learnerTokens: line.learnerText === null ? null : tokenize(line.learnerText),
      analysis: null,
      unlockedItemId: null,
      opennessDropped: false,
      flagged: false,
    })),
    state: { ...initialState(scenario.openness_start), turnIndex, ...state },
    canvasTokens: tokenize(notes),
  };
}

/** Runs the production end judge on each case's notes and keeps what code made of its matches. */
export async function runCanvasSet(scenario: Scenario, cases: CanvasCase[], options: JudgementOptions): Promise<SetScore> {
  const rows: CanvasRow[] = [];
  for (const entry of cases) {
    const turn = entry.transcript.length;
    const at = (itemId: string) => ({ itemId, turn });
    const basis = caseBasis(
      scenario,
      entry,
      {
        unlocked: itemIds(scenario, entry.id, entry.unlocked).map(at),
        disclosed: itemIds(scenario, entry.id, entry.told).map(at),
        ledger: itemIds(scenario, entry.id, entry.dropped).map((itemId) => ({ itemId, droppedAt: turn, pickedAt: null, ignoredAt: null, closedAt: null })),
      },
      entry.notes,
    );
    const reply = await callModel(
      "END_JUDGE",
      buildEndJudgeMessages(buildEndJudgeContext(basis)),
      { schema: endJudgeSchema, meta: { judgement_case: entry.id }, scope: options.scope },
      options.llmDeps,
    );
    const matches = resolveCanvasMatches(scenario, basis.state, basis.canvasTokens, reply.output.canvas_matches);
    for (const expected of entry.expected) {
      if (expected.item !== undefined) itemIds(scenario, entry.id, [expected.item]);
      const [start, end] = phraseRange(entry.id, entry.notes, expected.phrase);
      const overlapping: CanvasMatch | undefined = matches.find((match) => match.range[0] <= end && start <= match.range[1]);
      rows.push({
        id: entry.id,
        phrase: expected.phrase,
        expected: { kind: expected.kind, item: expected.item ?? null },
        predicted: overlapping ? { kind: overlapping.kind, item: overlapping.itemId } : { kind: "none", item: null },
      });
    }
  }
  return scoreCanvasSet(rows);
}

/** Runs the production verifier on one leading-novelty check per case. */
export async function runNoveltySet(scenario: Scenario, cases: NoveltyCase[], options: JudgementOptions): Promise<SetScore> {
  const rows = [];
  for (const entry of cases) {
    // The question with the added words is the last learner turn; the persona's reply to it plays no part.
    const transcript = [...entry.transcript, { learner: entry.question, persona: "(chưa trả lời)" }];
    const basis = caseBasis(scenario, { transcript }, {}, "");
    phraseRange(entry.id, entry.question, entry.span);
    const check: VerifierCheck = { id: "V1", kind: "leading_novelty", turn: transcript.length, itemId: null, claimId: null, text: entry.span };
    const reply = await callModel(
      "VERIFIER",
      buildVerifierMessages(buildVerifierContext(basis, [check], [])),
      { schema: verifierSchema, meta: { judgement_case: entry.id }, scope: options.scope },
      options.llmDeps,
    );
    const [verdict] = resolveVerdicts(reply.output.claims, [check]);
    // No answer is not an agreement: the words are then not shown as added.
    rows.push({ id: entry.id, expected: entry.expected, predicted: verdict?.agree ? ("novel" as const) : ("said" as const) });
  }
  return scoreNoveltySet(rows);
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

/** The score as lines for a terminal. */
export function formatScore(score: SetScore): string[] {
  return [
    ...score.rates.map((entry) => {
      const measured = entry.value === null ? "không có ca nào đo" : `${percent(entry.value)} (${entry.count})`;
      return `[${entry.met ? "ĐẠT" : "CHƯA ĐẠT"}] ${entry.label}: ${measured}, cổng ${entry.atLeast ? "≥" : "≤"} ${percent(entry.limit)}`;
    }),
    ...(score.mismatches.length > 0 ? ["Các ca lệch:", ...score.mismatches.map((line) => `  ${line}`)] : []),
    ...(score.size < (score.minSize ?? MIN_SET_SIZE)
      ? [`Bộ thử có ${score.size} ca, cần ≥ ${score.minSize ?? MIN_SET_SIZE} ca gán tay: kết quả này chưa chứng minh được cổng NFR-7.`]
      : []),
  ];
}
