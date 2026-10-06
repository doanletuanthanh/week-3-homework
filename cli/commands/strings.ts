import type { Database } from "@/db/client";
import { decideString, listStringRows, saveStringCheck } from "@/db/repo/eval";
import { getScenarioByPersona } from "@/db/repo/sessions";
import { checkString, personaStrings, stringStates, textHash, type FixedString, type StringState } from "@/eval/string-check";
import type { CallModelDeps } from "@/llm/call-model";
import type { Scenario } from "@/scenario/schema";
import { productStrings } from "@/strings/product-strings";
import { needsDb, parseArgs, reportCliErrors } from "../args";
import { CliError, type CliIo, type Command } from "../scenario-file";

/** What `product` names on the command line: the strings every persona shares. */
export const PRODUCT_TARGET = "product";

export type StringTarget = { scope: "persona" | "product"; personaId: string; scenario: Scenario | null; strings: FixedString[] };

/** The fixed strings of `product` or of the newest version of a persona. */
export async function loadStringTarget(db: Database, name: string): Promise<StringTarget> {
  if (name === PRODUCT_TARGET) {
    const strings = productStrings().map((entry) => ({ ...entry, origin: "lời sản phẩm nói với người học" }));
    return { scope: "product", personaId: "", scenario: null, strings };
  }
  const found = await getScenarioByPersona(db, name);
  if (!found) throw new CliError(`Không tìm thấy persona "${name}". Dùng "${PRODUCT_TARGET}" cho chuỗi cấp sản phẩm.`);
  const scenario = found.scenario.content;
  return { scope: "persona", personaId: found.scenario.personaId, scenario, strings: personaStrings(scenario) };
}

export async function loadStringStates(db: Database, target: StringTarget): Promise<StringState[]> {
  return stringStates(target.strings, await listStringRows(db, target));
}

const CHECK_USAGE = "Cách dùng: il check-strings <persona|product> [--all]";

/**
 * `check-strings` (FR-36): runs the automatic check on every fixed string that has none for its
 * current text (`--all`: on every string) and stores the result. Exit code 1 when a string fails.
 */
export function runCheckStrings(
  args: string[],
  io: CliIo,
  db: Database | null,
  llmDeps?: Partial<CallModelDeps>,
): Promise<number> {
  return reportCliErrors(io, async () => {
    if (!db) throw new CliError(needsDb("check-strings"));
    const { positional, switches } = parseArgs(args, { switches: ["all"] });
    if (positional.length !== 1) throw new CliError(CHECK_USAGE);
    const target = await loadStringTarget(db, positional[0]);

    const before = await loadStringStates(db, target);
    const todo = switches.has("all") ? before : before.filter((entry) => !entry.checked);
    for (const entry of todo) {
      const result = await checkString(entry, target.scenario, { scope: { scope: "eval" }, meta: { string_key: entry.key }, llmDeps });
      await saveStringCheck(db, target, { key: entry.key, text: entry.text, textHash: textHash(entry.text), result });
    }

    const after = await loadStringStates(db, target);
    for (const entry of after) {
      io.out(`[${entry.checkOk ? "OK" : "LỖI"}] ${entry.key}: ${entry.text}`);
      for (const problem of entry.problems) io.out(`      ${problem}`);
    }
    const failing = after.filter((entry) => !entry.checkOk).length;
    io.out(`${after.length} chuỗi, ${todo.length} vừa kiểm, ${failing} không qua.`);
    return failing === 0 ? 0 : 1;
  });
}

export function checkStringsCommand(db: Database | null, llmDeps: () => Partial<CallModelDeps>): Command {
  return {
    usage: "check-strings <persona|product>",
    summary: "Kiểm tự động chuỗi cố định (FR-36) và lưu kết quả.",
    run: (args, io) => runCheckStrings(args, io, db, llmDeps()),
  };
}

const APPROVE_USAGE =
  'Cách dùng: il approve-strings <persona|product> [list] | ... approve <khóa...>|--all | ... return <khóa> "<ghi chú>"';

const stateText = (entry: StringState) => {
  if (!entry.checked) return "chưa kiểm";
  if (!entry.checkOk) return "không qua kiểm";
  if (entry.decision === "approved") return "đã duyệt";
  return entry.decision === "returned" ? `trả lại: ${entry.note}` : "chờ duyệt";
};

/**
 * `approve-strings` (FR-60): an admin approves or returns fixed strings, one decision per string
 * as it reads now. Only a string that passed the automatic check can be approved.
 */
export function runApproveStrings(args: string[], io: CliIo, db: Database | null, operator: () => string): Promise<number> {
  return reportCliErrors(io, async () => {
    if (!db) throw new CliError(needsDb("approve-strings"));
    const { positional, switches } = parseArgs(args, { switches: ["all"] });
    const [name, action = "list", ...rest] = positional;
    if (!name) throw new CliError(APPROVE_USAGE);
    const target = await loadStringTarget(db, name);
    const states = await loadStringStates(db, target);

    if (action === "list" && rest.length === 0 && !switches.has("all")) {
      for (const entry of states) io.out(`${entry.key} [${stateText(entry)}]: ${entry.text}`);
      io.out(`${states.filter((entry) => entry.approved).length}/${states.length} chuỗi đã duyệt.`);
      return 0;
    }

    const email = operator();
    const byKey = (key: string) => {
      const entry = states.find((candidate) => candidate.key === key);
      if (!entry) throw new CliError(`Không có chuỗi "${key}". Xem danh sách: il approve-strings ${name}`);
      return entry;
    };

    if (action === "approve") {
      // Either `--all` or a list of keys, never both and never neither.
      if (switches.has("all") === (rest.length > 0)) throw new CliError(APPROVE_USAGE);
      const chosen = switches.has("all") ? states.filter((entry) => entry.checkOk && !entry.approved) : rest.map(byKey);
      const blocked = chosen.filter((entry) => !entry.checkOk);
      if (blocked.length > 0) {
        throw new CliError(
          `Chưa duyệt được vì chưa qua kiểm FR-36: ${blocked.map((entry) => entry.key).join(", ")}. Chạy il check-strings ${name} trước.`,
        );
      }
      for (const entry of chosen) {
        await decideString(db, target, { key: entry.key, textHash: textHash(entry.text), decision: "approved", approverEmail: email, note: null });
      }
      io.out(`Đã duyệt ${chosen.length} chuỗi (${email}).`);
      const waiting = states.filter((entry) => !entry.checkOk).length;
      if (waiting > 0) io.out(`Còn ${waiting} chuỗi chưa qua kiểm FR-36 nên chưa duyệt được.`);
      return 0;
    }

    if (action === "return") {
      const [key, ...noteWords] = rest;
      const note = noteWords.join(" ").trim();
      if (!key || note === "" || switches.has("all")) throw new CliError(APPROVE_USAGE);
      const entry = byKey(key);
      if (!entry.checked) throw new CliError(`Chuỗi "${key}" chưa được kiểm. Chạy il check-strings ${name} trước.`);
      await decideString(db, target, { key, textHash: textHash(entry.text), decision: "returned", approverEmail: email, note });
      io.out(`Đã trả lại "${key}" (${email}).`);
      return 0;
    }
    throw new CliError(APPROVE_USAGE);
  });
}

export function approveStringsCommand(db: Database | null, operator: () => string): Command {
  return {
    usage: "approve-strings <persona|product>",
    summary: "Duyệt hoặc trả lại chuỗi cố định của persona và của sản phẩm.",
    run: (args, io) => runApproveStrings(args, io, db, operator),
  };
}
