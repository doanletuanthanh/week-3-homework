import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { setConfig } from "@/db/repo/config";
import { listFlags } from "@/db/repo/eval";
import { adminAccessLog, evalRuns, generationAttempts, scenarios, topics, users } from "@/db/schema";
import { productStrings } from "@/strings/product-strings";
import {
  approveStringsFor,
  approveVersionFor,
  checkStringsFor,
  getAdminDraft,
  getScenarioReview,
  listDraftTopics,
  listScenarioReviews,
  publishFor,
  requestLeanEval,
  ruleOnFlag,
  startAdminDraft,
  unpublishFor,
} from "@/server/admin/scenarios";
import type { AppUser } from "@/server/auth";
import { countAttemptsToday } from "@/db/repo/custom-topics";
import { runGeneration } from "@/server/generation";
import { checkPublishGate } from "@/server/scenario-review";
import { runPublish } from "../../cli/commands/publish";
import { pipelineModels } from "../helpers/custom-fixtures";
import { repeat, roleModels } from "../helpers/eval-models";
import { CLEAN_STRING, cleanPersonaCheck, newestVersion, seedLeanRun } from "../helpers/publish-fixtures";
import { createLearner, resetDatabase } from "../helpers/test-db";

const ADMIN = "admin@example.com";
const LISTS = { ADMIN_EMAILS: [ADMIN], DEMO_ACCOUNT_EMAILS: [] };
const db = () => getDb();

vi.setConfig({ testTimeout: 60_000 });
beforeEach(resetDatabase);

/** The error `notFound()` throws: what makes Next answer 404. */
const isNotFound = (error: unknown) => (error as { digest?: string }).digest === "NEXT_HTTP_ERROR_FALLBACK;404";

async function refusal(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return null;
}

const logRows = () => db().select().from(adminAccessLog);
const DRAFT = { topicId: "ux-chi-tieu", personaId: "chi-mai", topicText: "Nhân viên văn phòng tự quản lý chi tiêu hằng tháng", focus: "general" };

/** Every admin call of the review, with arguments that would work for an admin. */
const CALLS: [string, (user: AppUser | null) => Promise<unknown>][] = [
  ["listScenarioReviews", (user) => listScenarioReviews(db(), user)],
  ["getScenarioReview", (user) => getScenarioReview(db(), user, "chi-thu")],
  ["requestLeanEval", (user) => requestLeanEval(db(), user, "chi-thu")],
  ["ruleOnFlag", (user) => ruleOnFlag(db(), user, {})],
  ["checkStringsFor", (user) => checkStringsFor(db(), user, "chi-thu", roleModels({}).llmDeps)],
  ["approveStringsFor", (user) => approveStringsFor(db(), user, "chi-thu")],
  ["approveVersionFor", (user) => approveVersionFor(db(), user, "chi-thu", "ok")],
  ["publishFor", (user) => publishFor(db(), user, "chi-thu")],
  ["unpublishFor", (user) => unpublishFor(db(), user, "chi-thu", true)],
  ["listDraftTopics", (user) => listDraftTopics(db(), user)],
  ["startAdminDraft", (user) => startAdminDraft(db(), user, DRAFT)],
  ["getAdminDraft", (user) => getAdminDraft(db(), user, "00000000-0000-4000-8000-000000000000")],
];

describe("admin scenario review: access", () => {
  it.each(CALLS)("%s answers 404 to a guest and a learner, and changes nothing", async (_, call) => {
    const learner = await createLearner("an@example.com", LISTS);
    for (const user of [null, learner]) expect(isNotFound(await refusal(() => call(user)))).toBe(true);
    expect(await logRows()).toEqual([]);
    expect((await newestVersion()).status).toBe("draft");
    expect(await db().select().from(generationAttempts)).toEqual([]);
  });
});

describe("admin scenario review: reads", () => {
  it("lists every curated persona with its gate and its lean run, as the CLI gate reads it", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    await seedLeanRun(["shame"]);
    const [row] = await listScenarioReviews(db(), admin);
    const cli = (await checkPublishGate(db(), "chi-thu"))!;
    expect(row).toMatchObject({ personaId: "chi-thu", version: 1, status: "draft", lean: { status: "done", costUsd: 0.05 } });
    expect(row.gate).toEqual(cli.gate);
  });

  it("shows the newest version with its report, flags, strings, versions and the change from the previous version", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    const first = await newestVersion();
    const content = { ...first.content, opening_line: "Chào em, chị là Thu nè." };
    await db().insert(scenarios).values({ ...first, id: undefined, version: 2, content: { ...content, version: 2 }, createdAt: undefined });
    await seedLeanRun(["shame"]);

    const review = (await getScenarioReview(db(), admin, "chi-thu"))!;
    expect(review.versions.map((version) => version.version)).toEqual([2, 1]);
    expect(review.diff).toEqual([{ path: "opening_line", before: JSON.stringify(first.content.opening_line), after: JSON.stringify(content.opening_line) }]);
    expect(review.report?.leaks).toHaveLength(1);
    expect(review.flags).toMatchObject([{ flag: { itemId: "shame" }, status: "open" }]);
    expect(review.strings.product).toHaveLength(productStrings().length);
    expect(review).toMatchObject({ runLive: false, dueRunId: null, approval: null });
    expect(await getScenarioReview(db(), admin, "nobody")).toBeNull();
    // Reading writes no log: only changes do, and none of this is learner data.
    expect(await logRows()).toEqual([]);
  });
});

describe("admin scenario review: actions", () => {
  it("runs the whole review from the console, one access-log row per action, with the CLI's gate answer", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    const queued = await requestLeanEval(db(), admin, "chi-thu");
    expect(queued).toMatchObject({ ok: true, resumed: false });
    expect(await requestLeanEval(db(), admin, "chi-thu")).toMatchObject({ ok: true });

    // The queued run is replaced by a finished one with one flag, as the job would write it.
    await db().delete(evalRuns);
    const run = await seedLeanRun(["shame"]);
    const [{ flag }] = await listFlags(db(), run.id);

    expect(await ruleOnFlag(db(), admin, { personaId: "chi-thu", flagId: flag.id, verdict: "maybe", reason: "x" })).toEqual({ ok: false, error: "invalid_input" });
    expect(await ruleOnFlag(db(), admin, { personaId: "chi-thu", flagId: flag.id, verdict: "not_leak", reason: "Chỉ nhắc sự thật bề mặt." })).toEqual({ ok: true });

    expect(await checkStringsFor(db(), admin, "chi-thu", cleanPersonaCheck().llmDeps)).toEqual({ ok: true, checked: 24, failing: 0 });
    const product = roleModels({ STRING_CHECK: repeat(productStrings().length, CLEAN_STRING) });
    expect(await checkStringsFor(db(), admin, "product", product.llmDeps)).toMatchObject({ ok: true, failing: 0 });
    expect(await approveStringsFor(db(), admin, "chi-thu")).toEqual({ ok: true, approved: 24, waiting: 0 });
    expect(await approveStringsFor(db(), admin, "product")).toMatchObject({ ok: true, waiting: 0 });

    expect(await approveVersionFor(db(), admin, "chi-thu", "  ")).toEqual({ outcome: "invalid_input" });
    expect(await approveVersionFor(db(), admin, "chi-thu", "Đã đọc báo cáo.")).toMatchObject({ outcome: "approved", version: 1, runId: run.id });

    expect((await checkPublishGate(db(), "chi-thu"))!.gate).toEqual({ ok: true, reasons: [] });
    expect(await publishFor(db(), admin, "chi-thu")).toEqual({ outcome: "published", name: "chi-thu phiên bản 1" });
    expect(await publishFor(db(), admin, "chi-thu")).toEqual({ outcome: "already_published", name: "chi-thu phiên bản 1" });
    expect(await unpublishFor(db(), admin, "chi-thu", false)).toEqual({ ok: true, versions: 1, sessions: 0 });
    expect(await unpublishFor(db(), admin, "chi-thu", false)).toEqual({ ok: false, error: "nothing_playable" });

    const rows = await logRows();
    expect(rows.every((row) => row.channel === "console" && row.adminEmail === ADMIN && row.userId === null && row.sessionId === null)).toBe(true);
    expect(rows.map((row) => row.action.split(" ").slice(0, 2).join(" "))).toEqual([
      "scenario eval",
      "scenario eval",
      // The malformed ruling names nothing to log; only the accepted one is on record.
      "scenario adjudicate",
      "scenario check-strings",
      "scenario check-strings",
      "scenario approve-strings",
      "scenario approve-strings",
      "scenario approve",
      "scenario approve",
      "scenario publish",
      "scenario publish",
      "scenario unpublish",
      "scenario unpublish",
    ]);
  });

  it("gives the same gate answer as the CLI publish for a refused version", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    await seedLeanRun(["shame"]);
    const err: string[] = [];
    expect(await runPublish(["chi-thu"], { out: () => {}, err: (line) => err.push(line) }, db(), () => ADMIN)).toBe(1);
    const result = await publishFor(db(), admin, "chi-thu");
    expect(result.outcome).toBe("refused");
    expect(err.slice(1)).toEqual((result as { reasons: string[] }).reasons.map((reason) => `  - ${reason}`));
  });

  it("refuses a ruling on a flag of an older run or of another persona", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    const old = await seedLeanRun(["shame"]);
    const [{ flag }] = await listFlags(db(), old.id);
    await seedLeanRun([]);
    expect(await ruleOnFlag(db(), admin, { personaId: "chi-thu", flagId: flag.id, verdict: "leak", reason: "x" })).toEqual({ ok: false, error: "stale" });
    expect(await ruleOnFlag(db(), admin, { personaId: "anh-khac", flagId: flag.id, verdict: "leak", reason: "x" })).toEqual({ ok: false, error: "not_found" });
  });

  it("refuses to approve a version that has no finished lean run", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    expect(await approveVersionFor(db(), admin, "chi-thu", "ok")).toEqual({ outcome: "no_run", version: 1 });
  });
});

describe("admin scenario review: learners' custom personas", () => {
  it("does not reach a learner's custom persona: not shown, not read, not changed", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    const learner = await createLearner("an@example.com", LISTS);
    const base = await newestVersion();
    await db().insert(topics).values({ id: "custom-t1", title: "Chủ đề riêng", summary: "Chủ đề tự tạo", kind: "custom", ownerUserId: learner.id });
    await db().insert(scenarios).values({
      ...base,
      id: undefined,
      createdAt: undefined,
      personaId: "custom-p1",
      topicId: "custom-t1",
      status: "published",
      origin: "generated",
      content: { ...base.content, persona_id: "custom-p1", topic_id: "custom-t1" },
    });

    expect((await listScenarioReviews(db(), admin)).map((row) => row.personaId)).toEqual(["chi-thu"]);
    expect(await getScenarioReview(db(), admin, "custom-p1")).toBeNull();
    expect(await requestLeanEval(db(), admin, "custom-p1")).toEqual({ ok: false, reason: "not_found" });
    expect(await checkStringsFor(db(), admin, "custom-p1", roleModels({}).llmDeps)).toEqual({ ok: false, error: "not_found" });
    expect(await approveStringsFor(db(), admin, "custom-p1")).toEqual({ ok: false, error: "not_found" });
    expect(await approveVersionFor(db(), admin, "custom-p1", "ok")).toEqual({ outcome: "not_found" });
    expect(await publishFor(db(), admin, "custom-p1")).toEqual({ outcome: "not_found" });
    expect(await unpublishFor(db(), admin, "custom-p1", true)).toEqual({ ok: false, error: "not_found" });
    const [row] = await db().select().from(scenarios).where(eq(scenarios.personaId, "custom-p1"));
    expect(row.status).toBe("published");
  });
});

describe("admin draft of a new persona", () => {
  it("generates a draft version of a new curated persona, holding the generation budget, without moderation or a session", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    const started = await startAdminDraft(db(), admin, DRAFT);
    expect(started.ok).toBe(true);
    const { attemptId } = started as { attemptId: string };
    expect(await getAdminDraft(db(), admin, attemptId)).toMatchObject({ outcome: "running", personaId: "chi-mai", due: true });

    const models = pipelineModels();
    expect(await runGeneration(db(), attemptId, { llmDeps: models.llmDeps })).toBe("passed");
    expect(models.count("MODERATION")).toBe(0);
    expect(models.count("SCENARIO_GENERATOR")).toBe(1);
    expect(models.count("SAFETY")).toBe(1);

    const draft = (await getAdminDraft(db(), admin, attemptId))!;
    expect(draft).toMatchObject({ outcome: "passed", personaId: "chi-mai", due: false });
    const [row] = await db().select().from(scenarios).where(eq(scenarios.personaId, "chi-mai"));
    expect(row).toMatchObject({ topicId: "ux-chi-tieu", version: 1, status: "draft", origin: "authored" });
    expect(row.content).toMatchObject({ persona_id: "chi-mai", topic_id: "ux-chi-tieu", version: 1 });

    // The admin's own learner limits are untouched.
    const [account] = await db().select().from(users).where(eq(users.id, admin.id));
    expect(account).toMatchObject({ freeCustomUsed: false, customFailedCount: 0 });
    expect(await countAttemptsToday(db(), admin.id)).toEqual({ attempts: 0, refusals: 0 });
    expect((await logRows()).map((log) => log.action)).toEqual(["scenario draft ux-chi-tieu chi-mai"]);
  });

  it("refuses bad input, an existing persona, a second draft at once and a spent budget", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    expect(await startAdminDraft(db(), admin, { ...DRAFT, personaId: "Chị Mai" })).toEqual({ ok: false, error: "invalid_input" });
    expect(await startAdminDraft(db(), admin, { ...DRAFT, topicId: "khong-co" })).toEqual({ ok: false, error: "topic_not_found" });
    expect(await startAdminDraft(db(), admin, { ...DRAFT, personaId: "chi-thu" })).toEqual({ ok: false, error: "persona_exists" });
    expect((await startAdminDraft(db(), admin, DRAFT)).ok).toBe(true);
    expect(await startAdminDraft(db(), admin, { ...DRAFT, personaId: "chi-lan" })).toEqual({ ok: false, error: "running" });

    const other = await createLearner("admin2@example.com", { ...LISTS, ADMIN_EMAILS: [ADMIN, "admin2@example.com"] });
    await setConfig(db(), "generation_daily_budget_usd", 1.5, "test");
    expect(await startAdminDraft(db(), other, { ...DRAFT, personaId: "chi-lan" })).toEqual({ ok: false, error: "over_budget" });
  });

  it("lets one admin claim a persona id at a time, and never turns a draft into a version of a persona imported meanwhile", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    const other = await createLearner("admin2@example.com", { ...LISTS, ADMIN_EMAILS: [ADMIN, "admin2@example.com"] });
    expect(await startAdminDraft(db(), admin, { ...DRAFT, personaId: "custom-abc" })).toEqual({ ok: false, error: "invalid_input" });
    const { attemptId } = (await startAdminDraft(db(), admin, DRAFT)) as { attemptId: string };
    expect(await startAdminDraft(db(), other, DRAFT)).toEqual({ ok: false, error: "persona_exists" });

    // The same id arrives by import while the draft is generated.
    const base = await newestVersion();
    await db().insert(scenarios).values({ ...base, id: undefined, createdAt: undefined, personaId: "chi-mai", content: { ...base.content, persona_id: "chi-mai" } });
    // The generator passed; storing it is what is refused, so the attempt ends as a system error.
    await runGeneration(db(), attemptId, { llmDeps: pipelineModels().llmDeps });
    expect(await getAdminDraft(db(), admin, attemptId)).toMatchObject({ outcome: "system_error", report: { error: "persona_taken" } });
    expect((await db().select().from(scenarios).where(eq(scenarios.personaId, "chi-mai"))).map((row) => row.version)).toEqual([1]);
  });

  it("records a failed draft without storing a scenario", async () => {
    const admin = await createLearner(ADMIN, LISTS);
    const { attemptId } = (await startAdminDraft(db(), admin, DRAFT)) as { attemptId: string };
    const models = pipelineModels({ safety: { violations: [{ field: "surface_facts[0]", kind: "real_org_or_brand", reason: "x" }] } });
    expect(await runGeneration(db(), attemptId, { llmDeps: models.llmDeps })).toBe("failed");
    expect(await getAdminDraft(db(), admin, attemptId)).toMatchObject({ outcome: "failed", failureCode: "unsafe_output" });
    expect(await db().select().from(scenarios).where(eq(scenarios.personaId, "chi-mai"))).toEqual([]);
    const [account] = await db().select().from(users).where(eq(users.id, admin.id));
    expect(account.customFailedCount).toBe(0);
  });
});
