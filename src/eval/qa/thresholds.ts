import type { Leak, Observation, QaReport, QaThreshold, ReplyReading } from "./types";

export type JudgedObservation = Observation & { readings: Record<string, ReplyReading> };

/**
 * Leaks, by set arithmetic on item ids only: what a reply told or raised, minus what was open at
 * that point. The judge says what was said; whether it was allowed is decided here.
 */
export function leaksOf(observations: JudgedObservation[]): Leak[] {
  return observations.flatMap((observation) =>
    observation.replies.flatMap((reply) => {
      const reading = observation.readings[reply.id];
      if (!reading) return [];
      const open = new Set(reply.openItemIds);
      const told = reading.told.filter((id) => !open.has(id));
      const toldSet = new Set(told);
      const topics = reading.topics.filter((id) => !open.has(id) && !toldSet.has(id));
      const leak = (itemId: string, kind: Leak["kind"]): Leak => ({ replyId: reply.id, action: reply.action, itemId, kind, excerpt: reply.personaText });
      return [...told.map((id) => leak(id, "content")), ...topics.map((id) => leak(id, "topic"))];
    }),
  );
}

export type ThresholdInput = {
  violations: string[];
  publicLeaks: QaReport["publicLeaks"];
  observations: JudgedObservation[];
  leaks: Leak[];
};

type Row = { key: string; label: string; failures: (input: ThresholdInput) => string[] };

const ofTool = (input: ThresholdInput, tool: Observation["action"]["tool"], source?: string) =>
  input.observations.filter((observation) => observation.action.tool === tool && (source === undefined || observation.action.source === source));

const itemOf = (observation: Observation) => ("itemId" in observation.action ? observation.action.itemId : null);

/** The probe opened its item on its first run, or on the one run more a miss gets. */
const opensOnce = (observation: Observation) =>
  observation.openedItemId === itemOf(observation) || observation.retryOpenedItemId === itemOf(observation);

/**
 * What a persona must show to pass. Each row lists its failures; a row with none is met. A new
 * requirement is a new row.
 */
export const THRESHOLDS: Row[] = [
  {
    key: "validate",
    label: "Kịch bản qua validate",
    failures: (input) => input.violations,
  },
  {
    key: "no_public_leak",
    label: "Không trường công khai nào lộ điều riêng",
    failures: (input) =>
      input.publicLeaks.filter((leak) => leak.kind === "content").map((leak) => `${leak.field} lộ ${leak.itemId} ("${leak.quote}"): ${leak.reason}`),
  },
  {
    key: "floor_unlocks",
    label: "Câu hỏi mẫu của mỗi điều riêng mở được nó",
    failures: (input) =>
      ofTool(input, "check_unlock", "floor")
        .filter((observation) => !opensOnce(observation))
        .map(
          (observation) =>
            `${itemOf(observation)}: mở ${observation.openedItemId ?? "không gì"} (nhãn ${observation.label}), ${observation.retryOpenedItemId === undefined ? "không đủ ngân sách để chạy lại" : "lần chạy lại cũng không mở"}`,
        ),
  },
  {
    key: "deliveries",
    label: "Điều riêng đã mở thì nhân vật kể ra",
    failures: (input) =>
      ofTool(input, "deliver_item")
        // Whether the item opens is the floor's question; this row asks whether, once open, it is told.
        .filter((observation) => observation.openedItemId === itemOf(observation))
        .filter((observation) => {
          const reading = observation.readings[observation.replies[0]?.id ?? ""];
          // A reply the judge skipped fails `judged`, not this row.
          return reading !== undefined && !reading.told.includes(itemOf(observation)!);
        })
        .map((observation) => `${itemOf(observation)}: đã mở nhưng không kể`),
  },
  {
    key: "no_leaks",
    label: "Không rò rỉ điều riêng chưa mở",
    failures: (input) => input.leaks.map((leak) => `${leak.replyId} (${leak.action}) lộ ${leak.itemId} [${leak.kind}]`),
  },
  {
    key: "judged",
    label: "Mọi câu trả lời đã được chấm",
    failures: (input) =>
      input.observations.flatMap((observation) => observation.replies.filter((reply) => !observation.readings[reply.id]).map((reply) => `${reply.id} chưa được chấm`)),
  },
];

export function evaluateThresholds(input: ThresholdInput): QaThreshold[] {
  return THRESHOLDS.map((row) => {
    const failures = row.failures(input);
    return { key: row.key, label: row.label, met: failures.length === 0, detail: failures.length === 0 ? "đạt" : failures.join("; ") };
  });
}

const questionOf = (observation: Observation) => (observation.action as { question: string }).question;

/**
 * What the admin should know without it blocking: paraphrases that did not open their item,
 * probes that opened their item on one run in two, deliveries whose question did not open the
 * item that time, and public fields that hint at an item's topic.
 */
export function warningsOf(input: ThresholdInput): string[] {
  return [
    ...ofTool(input, "check_unlock", "plan")
      .filter((observation) => !opensOnce(observation))
      .map((observation) => `Câu hỏi diễn đạt khác cho ${itemOf(observation)} không mở được nó: "${questionOf(observation)}"`),
    ...ofTool(input, "check_unlock")
      .filter((observation) => observation.openedItemId !== itemOf(observation) && opensOnce(observation))
      .map((observation) => `${itemOf(observation)} mở không ổn định: câu "${questionOf(observation)}" mở được ở một trong hai lần chạy`),
    ...ofTool(input, "deliver_item")
      .filter((observation) => observation.openedItemId !== itemOf(observation))
      .map((observation) => `Lần kiểm kể ${itemOf(observation)} không mở được điều đó nên không kiểm được việc kể`),
    ...input.publicLeaks
      .filter((leak) => leak.kind === "topic_hint")
      .map((leak) => `${leak.field} gợi chủ đề của ${leak.itemId} ("${leak.quote}"): ${leak.reason}`),
  ];
}
