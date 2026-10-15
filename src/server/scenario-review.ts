import type { Database } from "@/db/client";
import { approveVersion, decideString, latestApproval, latestLeanRun, listFlags, listStringRows, publishScenario, saveStringCheck } from "@/db/repo/eval";
import { listOtherPersonaTags } from "@/db/repo/scenarios";
import { getScenarioByPersona } from "@/db/repo/sessions";
import { evaluateGate, type GateResult } from "@/eval/publish-gate";
import { checkString, personaStrings, stringStates, textHash, type FixedString, type StringState } from "@/eval/string-check";
import type { CallModelDeps } from "@/llm/call-model";
import type { Scenario } from "@/scenario/schema";
import { validateScenario } from "@/scenario/validate";
import { productStrings } from "@/strings/product-strings";

/**
 * Reviewing a persona version: the publish gate and the admin decisions that feed it. Shared by
 * the CLI and the admin pages, so both give the same answer. No access check here: the CLI runs
 * as the operator, and the admin services check the admin before they call in.
 */

/** What `product` names: the strings every persona shares. */
export const PRODUCT_TARGET = "product";

export type StringTarget = { scope: "persona" | "product"; personaId: string; scenario: Scenario | null; strings: FixedString[] };

/** The fixed strings of `product` or of the newest version of a persona; null for an unknown persona. */
export async function loadStringTarget(db: Database, name: string): Promise<StringTarget | null> {
  if (name === PRODUCT_TARGET) {
    const strings = productStrings().map((entry) => ({ ...entry, origin: "lời sản phẩm nói với người học" }));
    return { scope: "product", personaId: "", scenario: null, strings };
  }
  const found = await getScenarioByPersona(db, name);
  if (!found) return null;
  const scenario = found.scenario.content;
  return { scope: "persona", personaId: found.scenario.personaId, scenario, strings: personaStrings(scenario) };
}

export async function loadStringStates(db: Database, target: StringTarget): Promise<StringState[]> {
  return stringStates(target.strings, await listStringRows(db, target));
}

/** Everything the publish gate reads about the newest version of a persona, and its answer; null for an unknown persona. */
export async function checkPublishGate(db: Database, personaId: string) {
  const found = await getScenarioByPersona(db, personaId);
  if (!found) return null;
  const { scenario } = found;

  const otherPersonas = await listOtherPersonaTags(db, scenario.topicId, scenario.personaId);
  const validation = validateScenario(scenario.content, { otherPersonas });
  const run = await latestLeanRun(db, scenario.id);
  const flags = run ? await listFlags(db, run.id) : [];
  const approval = await latestApproval(db, scenario.id);
  const product = await loadStringTarget(db, PRODUCT_TARGET);
  const strings = [
    ...(await loadStringStates(db, (await loadStringTarget(db, personaId))!)),
    ...(await loadStringStates(db, product!)).map((entry) => ({ ...entry, key: `${PRODUCT_TARGET}:${entry.key}` })),
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

export type PublishResult =
  | { outcome: "not_found" }
  | { outcome: "already_published" | "published"; name: string }
  | { outcome: "refused"; name: string; reasons: string[] };

/**
 * Publishes the newest version of a persona only when the publish gate passes: `validate` is
 * clean, its newest lean run is done with every threshold met, each leak flag was ruled not a
 * leak, every fixed string passed FR-36 and was approved, and an admin approved the version on
 * that run. Otherwise nothing changes and every reason is returned.
 */
export async function publishNewest(db: Database, personaId: string): Promise<PublishResult> {
  const checked = await checkPublishGate(db, personaId);
  if (!checked) return { outcome: "not_found" };
  const { scenario, gate } = checked;
  const name = `${scenario.personaId} phiên bản ${scenario.version}`;
  if (scenario.status === "published") return { outcome: "already_published", name };
  if (!gate.ok) return { outcome: "refused", name, reasons: gate.reasons };
  await publishScenario(db, scenario.id);
  return { outcome: "published", name };
}

export type ApproveVersionResult =
  | { outcome: "not_found" }
  | { outcome: "no_run"; version: number }
  | { outcome: "approved"; version: number; runId: string };

/**
 * An admin approves the newest version of a persona on its newest finished lean run. The approval
 * holds for that run only: evaluating the version again needs a new approval. It is one input of
 * the publish gate, not a publish.
 */
export async function approveNewestVersion(db: Database, personaId: string, adminEmail: string, note: string): Promise<ApproveVersionResult> {
  const found = await getScenarioByPersona(db, personaId);
  if (!found) return { outcome: "not_found" };
  const { scenario } = found;
  const run = await latestLeanRun(db, scenario.id);
  if (!run || run.status !== "done") return { outcome: "no_run", version: scenario.version };
  await approveVersion(db, { scenarioId: scenario.id, version: scenario.version, evalRunId: run.id, adminEmail, note });
  return { outcome: "approved", version: scenario.version, runId: run.id };
}

/**
 * FR-36: runs the automatic check on every fixed string of the target that has none for its
 * current text (`all`: on every string), stores each result, and returns the states after it.
 */
export async function checkStrings(
  db: Database,
  target: StringTarget,
  options: { all?: boolean; llmDeps?: Partial<CallModelDeps> } = {},
): Promise<{ checked: number; states: StringState[] }> {
  const before = await loadStringStates(db, target);
  const todo = options.all ? before : before.filter((entry) => !entry.checked);
  for (const entry of todo) {
    const result = await checkString(entry, target.scenario, { scope: { scope: "eval" }, meta: { string_key: entry.key }, llmDeps: options.llmDeps });
    await saveStringCheck(db, target, { key: entry.key, text: entry.text, textHash: textHash(entry.text), result });
  }
  return { checked: todo.length, states: await loadStringStates(db, target) };
}

/** `unknown`: no string has that key. `unchecked`: these strings did not pass FR-36, so none was approved. */
export type ApproveStringsResult =
  | { ok: true; approved: number; waiting: number }
  | { ok: false; unknown: string }
  | { ok: false; unchecked: string[] };

/**
 * FR-60: an admin approves fixed strings as they read now, the named ones or (`all`) every one
 * that passed the check and is not approved yet. Only a string that passed FR-36 can be approved.
 */
export async function approveStrings(db: Database, target: StringTarget, keys: string[] | "all", approverEmail: string): Promise<ApproveStringsResult> {
  const states = await loadStringStates(db, target);
  let chosen: StringState[];
  if (keys === "all") {
    chosen = states.filter((entry) => entry.checkOk && !entry.approved);
  } else {
    chosen = [];
    for (const key of keys) {
      const entry = states.find((candidate) => candidate.key === key);
      if (!entry) return { ok: false, unknown: key };
      chosen.push(entry);
    }
  }
  const blocked = chosen.filter((entry) => !entry.checkOk);
  if (blocked.length > 0) return { ok: false, unchecked: blocked.map((entry) => entry.key) };
  for (const entry of chosen) {
    await decideString(db, target, { key: entry.key, textHash: textHash(entry.text), decision: "approved", approverEmail, note: null });
  }
  return { ok: true, approved: chosen.length, waiting: states.filter((entry) => !entry.checkOk).length };
}
