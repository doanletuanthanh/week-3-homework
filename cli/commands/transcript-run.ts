import { randomUUID } from "node:crypto";
import { z } from "zod";
import { roleSpecFromEnv } from "@/config/env";
import { MAX_TURNS } from "@/config/limits";
import type { LlmCallRecord } from "@/db/repo/llm-calls";
import { tokenize } from "@/engine/tokens";
import { runTurnGraph } from "@/graphs/turn-graph";
import { LlmCallError, type CallModelDeps } from "@/llm/call-model";
import { ZERO_USAGE, costUsd, type TokenUsage } from "@/llm/pricing";
import type { Role } from "@/llm/roles";
import { validateScenario } from "@/scenario/validate";
import { inMemoryTurnStore } from "@/server/in-memory-turn-store";
import { intOption, parseArgs, reportCliErrors } from "../args";
import { CliError, readJsonFile, type CliIo, type Command } from "../scenario-file";
import { percentile } from "./measure-latency";

const USAGE = "Cách dùng: il transcript-run <file kịch bản> [--questions <file .json>] [--turns N] [--yes]";

/** A question list file: the demo transcripts in `evalsets/demo/` have this shape. */
const questionsFileSchema = z.object({ questions: z.array(z.string().trim().min(1)).min(1) });

/**
 * Tokens of one turn's calls, for the estimate printed before anything is spent. Rounded up from
 * the 2026-10-14 cost baseline, so the estimate errs high.
 */
const TURN_ESTIMATE: Partial<Record<Role, TokenUsage>> = {
  ANALYSIS: { ...ZERO_USAGE, inputTokens: 4_000, outputTokens: 200 },
  PERSONA: { ...ZERO_USAGE, inputTokens: 2_500, outputTokens: 350 },
};

/**
 * Sentences of a reply: what ends in `.`, `!` or `?`, and whatever trails after the last one. An
 * ellipsis ("…" or "...") is a spoken pause, not an end ("Ờ… để chị nhớ coi." is one sentence).
 */
export function sentenceCount(text: string): number {
  return text.split(/(?<=[!?]|(?<![.…])\.)\s+/u).filter((part) => part.trim() !== "").length;
}

/** A reply written as a list: a line that starts with a bullet or a number. */
export const isListReply = (text: string) => /^\s*(?:[-•*]|\d+[.)])\s/mu.test(text);

const median = (values: number[]) => (values.length === 0 ? 0 : percentile(values, 0.5));
const secondsOf = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const usdOf = (records: LlmCallRecord[]) => `${records.reduce((sum, record) => sum + record.costUsd, 0).toFixed(4)} USD`;

/** One call as the run reports it: the successful attempt of a role in a turn. */
function callLine(name: string, record: LlmCallRecord | undefined): string {
  if (!record) return `${name}: không có`;
  return `${name}: ${record.tokensIn} vào / ${record.tokensOut} ra (${record.tokensReasoning} suy nghĩ), ${secondsOf(record.latencyMs)}`;
}

/**
 * `transcript-run <scenario>`: plays a fixed list of questions through the real turn graph, on an
 * in-memory session, and prints each reply with its length and the tokens, latency and cost of
 * both calls. It is how prompt changes are read and compared before and after, without a running
 * app. When `--turns` is more than the list, the questions start over. Nothing is stored but the
 * `llm_call` rows (scope `eval`). Without `--yes` it prints the estimate and stops.
 */
export function runTranscriptRun(args: string[], io: CliIo, llmDeps: Partial<CallModelDeps> = {}): Promise<number> {
  return reportCliErrors(io, async () => {
    const { positional, values, switches } = parseArgs(args, { values: ["questions", "turns"], switches: ["yes"] });
    if (positional.length !== 1) throw new CliError(USAGE);
    const { scenario, violations } = validateScenario(await readJsonFile(positional[0]));
    if (!scenario) throw new CliError(`Kịch bản "${positional[0]}" không qua validate (${violations.length} vi phạm): chạy il validate.`);

    const questionsFile = values.questions ?? `evalsets/demo/${scenario.persona_id}-transcript.json`;
    const parsed = questionsFileSchema.safeParse(await readJsonFile(questionsFile));
    if (!parsed.success) throw new CliError(`File "${questionsFile}" cần một mảng "questions" gồm các câu hỏi không rỗng.`);
    const { questions } = parsed.data;
    const turns = intOption(values.turns, "turns", { min: 1, max: MAX_TURNS, fallback: questions.length });

    const roleSpec = llmDeps.roleSpec ?? roleSpecFromEnv;
    const perTurn = (Object.entries(TURN_ESTIMATE) as [Role, TokenUsage][]).reduce((sum, [role, usage]) => sum + costUsd(roleSpec(role).model, usage), 0);
    io.out(`${scenario.persona_id}: ${turns} lượt, ước tính tối đa ${(perTurn * turns).toFixed(3)} USD (ANALYSIS ${roleSpec("ANALYSIS").model}, PERSONA ${roleSpec("PERSONA").model}).`);
    if (!switches.has("yes")) {
      io.out("Chưa gọi model nào. Thêm --yes để chạy.");
      return 0;
    }

    const records: LlmCallRecord[] = [];
    const recordCall = llmDeps.recordCall ?? (async () => {});
    const runDeps: Partial<CallModelDeps> = {
      ...llmDeps,
      recordCall: async (record) => {
        await recordCall(record);
        records.push(record);
      },
    };
    const store = inMemoryTurnStore(scenario);
    const replies: { words: number; sentences: number; list: boolean }[] = [];

    for (let turn = 1; turn <= turns; turn += 1) {
      const question = questions[(turn - 1) % questions.length];
      const before = records.length;
      const startedAt = Date.now();
      let result: Awaited<ReturnType<typeof runTurnGraph>>;
      try {
        result = await runTurnGraph(
          { ...(await store.loadState()), question },
          { scope: { scope: "eval", turnIndex: turn }, meta: { transcript_run: scenario.persona_id, turn_index: turn }, llmDeps: runDeps },
        );
      } catch (error) {
        if (!(error instanceof LlmCallError)) throw error;
        io.err(`Lượt ${turn} dừng: ${error.message}`);
        return 1;
      }
      const { analysis, plan, personaText } = result;
      await store.commitTurn({ turnKey: randomUUID(), question, personaText, analysis, plan, latencyMs: Date.now() - startedAt });

      const calls = records.slice(before);
      const ok = (role: Role) => calls.find((record) => record.role === role && record.ok);
      const reply = { words: tokenize(personaText).length, sentences: sentenceCount(personaText), list: isListReply(personaText) };
      replies.push(reply);
      io.out(`Lượt ${turn} · nhãn ${plan.analysis.label} · loại ${plan.analysis.question_type} · mở: ${plan.unlockedItemId ?? "—"}`);
      io.out(`  Hỏi: ${question}`);
      io.out(`  Đáp: ${personaText}`);
      io.out(
        `  → ${reply.words} từ, ${reply.sentences} câu${reply.list ? ", dạng liệt kê" : ""} · ${callLine("Call 1", ok("ANALYSIS"))} · ${callLine("Call 2", ok("PERSONA"))} · ${usdOf(calls)}`,
      );
    }

    const okOf = (role: Role) => records.filter((record) => record.role === role && record.ok);
    const medianOf = (role: Role, read: (record: LlmCallRecord) => number) => median(okOf(role).map(read));
    const summary = (role: Role, name: string) =>
      `${name} ${medianOf(role, (record) => record.tokensIn)} vào / ${medianOf(role, (record) => record.tokensOut)} ra, ${secondsOf(medianOf(role, (record) => record.latencyMs))}`;
    io.out(`Tổng: ${turns} lượt, ${records.length} lần gọi, ${usdOf(records)}.`);
    io.out(
      `Trung vị mỗi lượt: ${median(replies.map((reply) => reply.words))} từ, ${median(replies.map((reply) => reply.sentences))} câu; ${summary("ANALYSIS", "Call 1")}; ${summary("PERSONA", "Call 2")}.`,
    );
    io.out(`Câu trả lời dạng liệt kê: ${replies.filter((reply) => reply.list).length}/${replies.length}.`);
    return 0;
  });
}

export function transcriptRunCommand(llmDeps: () => Partial<CallModelDeps>): Command {
  return {
    usage: "transcript-run <file kịch bản>",
    summary: "Chạy một danh sách câu hỏi qua engine thật (không cần app), in từng câu trả lời, độ dài, token, độ trễ và chi phí.",
    run: (args, io) => runTranscriptRun(args, io, llmDeps()),
  };
}
