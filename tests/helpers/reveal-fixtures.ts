import { assembleReveal, buildChecks, resolveClaims } from "@/engine/reveal-claims";
import { commentSlots, settle } from "@/engine/reveal-compute";
import type { CanvasMatchKind, GeneratorPart, JudgePart, RevealBasis, RevealJson, RevealParts, VerifierCheck, VerifierPart } from "@/engine/reveal-types";
import { selectReplay } from "@/engine/select-replay";
import { tokenize, type TokenRange } from "@/engine/tokens";
import type { Label, RawAnalysis } from "@/engine/types";
import { DROPPED, a, chiThu, engineSession, told } from "./engine-fixtures";

type Session = ReturnType<typeof engineSession>;

/** The frozen session a reveal reads, from turns played through the real engine rules. */
export function basisOf(session: Session, canvas = ""): RevealBasis {
  return {
    scenario: chiThu,
    turns: session.transcript.map((line) => {
      const plan = session.plans.find((candidate) => candidate.turnIndex === line.index);
      return {
        index: line.index,
        learnerText: line.learnerText,
        learnerTokens: line.learnerText === null ? null : tokenize(line.learnerText),
        personaText: line.personaText,
        analysis: plan?.analysis ?? null,
        unlockedItemId: plan?.unlockedItemId ?? null,
        opennessDropped: plan ? plan.opennessAfter < plan.opennessBefore : false,
        flagged: false,
      };
    }),
    state: session.state,
    canvasTokens: tokenize(canvas),
  };
}

export const selectionOf = (basis: RevealBasis) =>
  selectReplay({
    scenario: basis.scenario,
    ledger: basis.state.ledger,
    unlocked: basis.state.unlocked,
    turns: basis.turns.map((turn) => ({ index: turn.index, label: turn.analysis?.label ?? null, flagged: turn.flagged })),
  });

/** The token range of `phrase` inside `text`, as the end judge would name it. */
export function rangeOf(text: string, phrase: string): TokenRange {
  const tokens = tokenize(text);
  const words = tokenize(phrase);
  const start = tokens.findIndex((_, index) => words.every((word, offset) => tokens[index + offset] === word));
  if (start < 0) throw new Error(`"${phrase}" is not in the text`);
  return [start, start + words.length - 1];
}

export const QUESTIONS = {
  1: "Chị thường quản lý tiền nong hằng tháng thế nào ạ?",
  2: "Chị có hay ghi lại chi tiêu không ạ?",
  3: "Lần gần nhất chị ghi chi tiêu là khi nào ạ?",
  4: "Chắc tại chị lười nên mới bỏ đúng không ạ?",
  5: "Sau này chị có định ghi lại không ạ?",
  6: "Nếu có app tự ghi thì chị sẽ dùng chứ ạ?",
} as const;

/**
 * Six turns that leave one of everything a reveal has to handle:
 * - `money-home` and `last-attempt` opened and told (turns 1 and 3); turn 3 is a grounded question;
 * - the hook of `paid-app` dropped at turn 2 and ignored at 3; the hook of `shame` dropped at 3 and ignored at 4;
 * - a leading question at turn 4 (the words "tại chị lười"), which lowered openness;
 * - two questions about the future, at turns 5 and 6;
 * - every other item never shown.
 * The replay moment is `paid-app`: same weight as `shame`, dropped earlier.
 */
export function playedSession(): Session {
  const session = engineSession();
  const script: Partial<RawAnalysis>[] = [
    { topic_tags: [a("tag", "money-home")], question_type: "open" },
    { prev_turn_verdict: told("money-home"), topic_tags: [a("tag", "paid-app")] },
    { prev_turn_verdict: DROPPED, topic_tags: [a("tag", "last-attempt")], question_type: "past_specific", label: "confirm_grounded", grounded_turn_id: 2 },
    { prev_turn_verdict: told("last-attempt"), label: "leading", introduced_span: [1, 3] },
    { question_type: "hypothetical_future" },
    { question_type: "hypothetical_future" },
  ];
  script.forEach((analysis, position) => session.turn(analysis, QUESTIONS[(position + 1) as keyof typeof QUESTIONS]));
  return session;
}

export const NOTES = [
  "kế toán, ở trọ với bạn",
  "mỗi tháng gửi ba mẹ 3 triệu",
  "đang trả phí cho một app mà không dùng?",
  "chắc có nợ thẻ tín dụng",
  "lương thấp nên khó để dành",
].join("\n");

/** What the end judge is scripted to find in `NOTES`: one told item, one shown, one never shown, one invention. */
export function judgedNotes(): Extract<JudgePart, { ok: true }> {
  const match = (phrase: string, itemId: string | null, kind: CanvasMatchKind) => ({
    range: rangeOf(NOTES, phrase),
    kind,
    itemId,
    reason: "lý do nội bộ của judge",
  });
  return {
    ok: true,
    verdict: { hook_dropped: false, disclosed_item_ids: [], violations: [] },
    matches: [
      match("mỗi tháng gửi ba mẹ 3 triệu", "money-home", "told"),
      match("đang trả phí cho một app mà không dùng?", "paid-app", "unconfirmed"),
      match("chắc có nợ thẻ tín dụng", "installment", "unrevealed"),
      match("lương thấp nên khó để dành", null, "never_said"),
    ],
  };
}

const NEEDS_SUGGESTION = new Set(["leading", "hypothetical_future", "heard_not_followed"]);

/** A generator that writes one well-formed claim for every slot code opened. */
export function generatedClaims(basis: RevealBasis, judge?: JudgePart): GeneratorPart {
  const settled = settle(basis, judge);
  const selection = selectionOf(basis);
  const slots = commentSlots(settled, selection, judge?.ok ? judge.matches : []);
  const raw = slots.map((slot) => ({
    slot: slot.id,
    text: `Nhận xét cho ô ${slot.type}.`,
    cited_turns: slot.canvas ? [slot.turns[0]] : slot.turns,
    item_id: null,
    canvas_range: slot.canvas ? [...slot.canvas.range] : null,
    suggested_question: NEEDS_SUGGESTION.has(slot.type) ? `Câu hỏi thay thế cho ô ${slot.type}?` : null,
  }));
  return { ok: true, claims: resolveClaims(raw, { basis: settled, slots, selection }) };
}

/** A verifier that agrees with every check of this reveal, except those `disagrees` picks. */
export function verifierFor(
  basis: RevealBasis,
  parts: RevealParts,
  disagrees: (check: VerifierCheck) => boolean = () => false,
  labelOf: (check: VerifierCheck) => Label | null = () => null,
): VerifierPart {
  const checks = buildChecks(settle(basis, parts.judge), parts.generator?.ok ? parts.generator.claims : []);
  return { ok: true, verdicts: checks.map((check) => ({ id: check.id, agree: !disagrees(check), label: labelOf(check), reason: "lý do của verifier" })) };
}

/** Judge, generator and verifier all succeeded, and the verifier agreed with everything. */
export function fullParts(basis: RevealBasis, judge: JudgePart = judgedNotes()): RevealParts {
  const parts: RevealParts = { judge, generator: generatedClaims(basis, judge) };
  return { ...parts, verifier: verifierFor(basis, parts) };
}

export const assemble = (basis: RevealBasis, parts: RevealParts): RevealJson => assembleReveal(basis, selectionOf(basis), parts);
