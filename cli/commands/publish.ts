import type { Database } from "@/db/client";
import { latestFullRun, listFlags, publishScenario, unpublishPersona } from "@/db/repo/eval";
import { listOtherPersonaTags } from "@/db/repo/scenarios";
import { getScenarioByPersona } from "@/db/repo/sessions";
import { evaluateGate, type GateResult } from "@/eval/publish-gate";
import { validateScenario } from "@/scenario/validate";
import { needsDb, parseArgs, reportCliErrors } from "../args";
import { CliError, type CliIo, type Command } from "../scenario-file";
import { PRODUCT_TARGET, loadStringStates, loadStringTarget } from "./strings";

/** Everything the interim gate reads about the newest version of a persona, and its answer. */
export async function checkPublishGate(db: Database, personaId: string) {
  const found = await getScenarioByPersona(db, personaId);
  if (!found) throw new CliError(`Không tìm thấy persona "${personaId}".`);
  const { scenario } = found;

  const otherPersonas = await listOtherPersonaTags(db, scenario.topicId, scenario.personaId);
  const validation = validateScenario(scenario.content, { otherPersonas });
  const latest = await latestFullRun(db, scenario.id);
  const flags = latest ? await listFlags(db, latest.run.id) : [];
  const strings = [
    ...(await loadStringStates(db, await loadStringTarget(db, personaId))),
    ...(await loadStringStates(db, await loadStringTarget(db, PRODUCT_TARGET))).map((entry) => ({ ...entry, key: `${PRODUCT_TARGET}:${entry.key}` })),
  ];

  const gate: GateResult = evaluateGate({
    violations: validation.violations.map((violation) => `${violation.path || "(gốc)"} [${violation.code}] ${violation.message}`),
    run: latest
      ? { profile: latest.run.profile, status: latest.run.status, episodeKeys: latest.episodeKeys, report: latest.run.reportJson }
      : null,
    flags: flags.map(({ flag, rulings }) => ({ id: flag.id, episode: flag.episode, rulings })),
    strings,
  });
  return { scenario, gate };
}

/**
 * `publish <persona>` (FR-35, interim gate): publishes the newest version only when `validate` is
 * clean, a full evaluation of that exact version met every threshold, every leak flag was closed
 * by two admins with no confirmed leak in the adversarial episodes, and every fixed string passed
 * FR-36 and was approved. Otherwise it changes nothing and lists each reason.
 */
export function runPublish(args: string[], io: CliIo, db: Database | null, operator: () => string): Promise<number> {
  return reportCliErrors(io, async () => {
    if (!db) throw new CliError(needsDb("publish"));
    const [personaId] = args;
    if (!personaId || args.length !== 1) throw new CliError("Cách dùng: il publish <persona>");
    const email = operator();

    const { scenario, gate } = await checkPublishGate(db, personaId);
    const name = `${scenario.personaId} phiên bản ${scenario.version}`;
    if (scenario.status === "published") {
      io.out(`${name} đã được publish.`);
      return 0;
    }
    if (!gate.ok) {
      io.err(`KHÔNG publish ${name}: ${gate.reasons.length} lý do`);
      for (const reason of gate.reasons) io.err(`  - ${reason}`);
      return 1;
    }
    await publishScenario(db, scenario.id);
    io.out(`Đã publish ${name} qua cổng tạm (${email}). Phiên bản mang cờ interim_gate cho tới khi qua lại cổng đầy đủ.`);
    return 0;
  });
}

export function publishCommand(db: Database | null, operator: () => string): Command {
  return {
    usage: "publish <persona>",
    summary: "Publish phiên bản mới nhất nếu qua cổng tạm (FR-35); nếu không, nêu từng lý do.",
    run: (args, io) => runPublish(args, io, db, operator),
  };
}

/**
 * `unpublish <persona>`: pulls every version a learner could start on, drafts included (they are
 * playable while `require_published` is off), so no new session starts with the persona.
 * Sessions already under way keep their version unless `--stop-sessions` withdraws them.
 */
export function runUnpublish(args: string[], io: CliIo, db: Database | null, operator: () => string): Promise<number> {
  return reportCliErrors(io, async () => {
    if (!db) throw new CliError(needsDb("unpublish"));
    const { positional, switches } = parseArgs(args, { switches: ["stop-sessions"] });
    if (positional.length !== 1) throw new CliError("Cách dùng: il unpublish <persona> [--stop-sessions]");
    const email = operator();
    const [personaId] = positional;
    if (!(await getScenarioByPersona(db, personaId))) throw new CliError(`Không tìm thấy persona "${personaId}".`);

    const result = await unpublishPersona(db, personaId, { stopSessions: switches.has("stop-sessions") });
    if (result.versions === 0) throw new CliError(`${personaId} không còn phiên bản nào chơi được để gỡ.`);
    io.out(`Đã gỡ ${result.versions} phiên bản của ${personaId} (${email}). Không buổi mới nào bắt đầu được với persona này.`);
    io.out(
      switches.has("stop-sessions")
        ? `Đã rút ${result.sessions} buổi chưa xong.`
        : "Các buổi đang diễn ra tiếp tục trên phiên bản cũ.",
    );
    return 0;
  });
}

export function unpublishCommand(db: Database | null, operator: () => string): Command {
  return {
    usage: "unpublish <persona>",
    summary: "Gỡ publish persona; --stop-sessions rút luôn các buổi chưa xong.",
    run: (args, io) => runUnpublish(args, io, db, operator),
  };
}
