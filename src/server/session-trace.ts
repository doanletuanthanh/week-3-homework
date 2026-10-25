import type { loadSessionTrace } from "@/db/repo/turns";

export type SessionTrace = NonNullable<Awaited<ReturnType<typeof loadSessionTrace>>>;

/** One field of a turn: a value, or a list under its label. A line without a label is a note. */
export type TraceLine = { label?: string; text?: string; items?: string[] };
export type TraceTurn = { index: number; title: string; lines: TraceLine[] };

const OUTCOME_TEXT = { satisfied: "thỏa", not_satisfied: "không thỏa", prerequisite_locked: "tiên quyết còn khóa" } as const;
const none = (values: string[]) => (values.length > 0 ? values.join(", ") : "(không)");

/**
 * What a session trace shows (FR-44), turn by turn: the learner question, Call 1 output, the
 * verdict for the previous turn, the corrections code made, the unlock rules that ran, the item
 * opened, the hook selected with its verdict, and openness before and after. `pnpm il trace` prints
 * it and the admin transcript page renders it, so the two always show the same thing. Stored data
 * only: no model call. Whoever shows it records the access first.
 */
export function describeTrace({ session, scenario, turns }: SessionTrace): { title: string; turns: TraceTurn[] } {
  const state = session.endedAt ? `${session.status}, đã kết thúc` : session.status;
  const title = `Buổi ${session.id} · ${scenario.personaId} phiên bản ${scenario.version} · ${state} · ${turns.length - 1} lượt`;

  const described = turns.map(({ turn, snapshot }, position): TraceTurn => {
    if (turn.index === 0) {
      return {
        index: 0,
        title: "Lượt 0 (lời mở đầu, không gọi LLM)",
        lines: [
          { label: "Persona", text: turn.personaText },
          { label: "Openness", text: String(snapshot.openness) },
        ],
      };
    }
    const decision = turn.decisionJson;
    const previous = turns[position - 1].turn;
    const lines: TraceLine[] = [
      { label: "Người học", text: turn.learnerText ?? "" },
      { label: "Call 1", text: turn.analysisJson ? JSON.stringify(turn.analysisJson) : "(không lưu)" },
      {
        label: `Verdict cho lượt ${previous.index}`,
        text: previous.verdictJson
          ? `hook đã thả = ${previous.verdictJson.hook_dropped}; đã kể = ${none(previous.verdictJson.disclosed_item_ids)}; vi phạm = ${none(previous.verdictJson.violations)}`
          : "(không áp dụng)",
      },
    ];
    if (!decision) {
      lines.push({ text: "(Lượt này được ghi trước khi có engine: không có phân tích.)" });
    } else {
      const { analysis } = decision;
      const hookVerdict = turn.verdictJson ? (turn.verdictJson.hook_dropped ? "đã thả" : "chưa thả") : "chưa có verdict";
      lines.push(
        decision.corrections.length === 0
          ? { label: "Sửa của code", text: "(không)" }
          : { label: "Sửa của code", items: decision.corrections.map((fix) => `${fix.field}: ${JSON.stringify(fix.from)} → ${JSON.stringify(fix.to)} (${fix.reason})`) },
        {
          label: "Sau khi kiểm",
          // Rows written before topic routing have no span or broad topics.
          text: `nhãn = ${analysis.label}; loại = ${analysis.question_type}; grounded_turn_id = ${analysis.grounded_turn_id}; introduced_span = ${JSON.stringify(analysis.introduced_span)}; hook = ${analysis.hook_item_id}; direct = ${analysis.tag_item_id}; direct_span = ${JSON.stringify(analysis.tag_span ?? null)}; broad = ${none(analysis.hint_item_ids ?? [])}`,
        },
        { label: "Luật mở khóa", items: decision.rules.map((rule) => `${rule.itemId} [${rule.path}]: ${OUTCOME_TEXT[rule.outcome]}`) },
        { label: "Item mở", text: decision.unlockedItemId ?? "(không)" },
        { label: "Hook được chọn", text: turn.hookSelected ? `${turn.hookSelected} (${hookVerdict})` : "(không)" },
        { label: "Openness", text: `${decision.opennessBefore} → ${decision.opennessAfter}` },
        // Rows written before memory, and turns that remembered nothing, have no entry.
        decision.memory
          ? { label: `Ghi nhớ lượt ${decision.memory.turn}`, items: [decision.memory.gist || "(gist trống)", ...decision.memory.claims.map((claim) => `chi tiết: ${claim}`)] }
          : { label: "Ghi nhớ", text: "(không)" },
      );
    }
    lines.push({ label: "Persona", text: `${turn.personaText}${turn.flagged ? "  [GẮN CỜ: vi phạm do-not-assert]" : ""}` });
    return { index: turn.index, title: `Lượt ${turn.index}`, lines };
  });

  return { title, turns: described };
}
