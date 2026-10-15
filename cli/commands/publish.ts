import type { Database } from "@/db/client";
import { latestApproval, latestLeanRun, listFlags, publishScenario, unpublishPersona } from "@/db/repo/eval";
import { listOtherPersonaTags } from "@/db/repo/scenarios";
import { getScenarioByPersona } from "@/db/repo/sessions";
import { evaluateGate, type GateResult } from "@/eval/publish-gate";
import { validateScenario } from "@/scenario/validate";
import { needsDb, parseArgs, reportCliErrors } from "../args";
import { CliError, type CliIo, type Command } from "../scenario-file";
import { PRODUCT_TARGET, loadStringStates, loadStringTarget } from "./strings";

/** Everything the publish gate reads about the newest version of a persona, and its answer. */
export async function checkPublishGate(db: Database, personaId: string) {
  const found = await getScenarioByPersona(db, personaId);
  if (!found) throw new CliError(`Không tìm thấy persona "${personaId}".`);
  const { scenario } = found;

  const otherPersonas = await listOtherPersonaTags(db, scenario.topicId, scenario.personaId);
  const validation = validateScenario(scenario.content, { otherPersonas });
  const run = await latestLeanRun(db, scenario.id);
  const flags = run ? await listFlags(db, run.id) : [];
  const approval = await latestApproval(db, scenario.id);
  const strings = [
    ...(await loadStringStates(db, await loadStringTarget(db, personaId))),
    ...(await loadStringStates(db, await loadStringTarget(db, PRODUCT_TARGET))).map((entry) => ({ ...entry, key: `${PRODUCT_TARGET}:${entry.key}` })),
  ];

  const gate: GateResult = evaluateGate({
    violations: validation.violations.map((violation) => `${violation.path || "(gốc)"} [${violation.code}] ${violation.message}`),
    run: run ? { id: run.id, profile: run.profile, status: run.status, report: run.reportJson } : null,
    flags: flags.map(({ flag, rulings }) => ({ id: flag.id, rulings })),
    strings,
    approval,
  });
  return { scenario, run, gate };
}

/**
 * `publish <persona>`: publishes the newest version only when `validate` is clean, its newest
 * lean run is done with every threshold met, each leak flag of that run was ruled not a leak,
 * every fixed string passed FR-36 and was approved, and an admin approved the version on that
 * run. Otherwise it changes nothing and lists each reason.
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
    io.out(`Đã publish ${name} (${email}).`);
    return 0;
  });
}

export function publishCommand(db: Database | null, operator: () => string): Command {
  return {
    usage: "publish <persona>",
    summary: "Publish phiên bản mới nhất nếu qua cổng publish (eval lean); nếu không, nêu từng lý do.",
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
