import { randomUUID } from "node:crypto";
import { z } from "zod";
import { MAX_CANVAS_CHARS, MAX_QUESTION_CHARS, MAX_TURNS } from "@/config/limits";
import type { Database } from "@/db/client";
import { deleteSession, getSession } from "@/db/repo/sessions";
import { findUserByEmail } from "@/db/repo/users";
import type { CallModelDeps } from "@/llm/call-model";
import type { AppUser } from "@/server/auth";
import { endSession } from "@/server/canvas";
import { runReveal, submitGuess } from "@/server/reveal";
import { openSession } from "@/server/sessions";
import { runTurn } from "@/server/turns";
import { intOption, needsDb, parseArgs, reportCliErrors } from "../args";
import { CliError, readJsonFile, type CliIo, type Command } from "../scenario-file";

/** A prepared interview: the learner's questions in order, and the notes they took. */
const transcriptSchema = z.object({
  persona_id: z.string().min(1),
  questions: z.array(z.string().trim().min(1).max(MAX_QUESTION_CHARS)).min(1).max(MAX_TURNS),
  canvas_text: z.string().max(MAX_CANVAS_CHARS),
});
export type DemoTranscript = z.infer<typeof transcriptSchema>;

export const demoTranscriptPath = (personaId: string) => `evalsets/demo/${personaId}-transcript.json`;

export async function loadDemoTranscript(path: string, personaId: string): Promise<DemoTranscript> {
  const parsed = transcriptSchema.safeParse(await readJsonFile(path));
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(gốc)"}: ${issue.message}`);
    throw new CliError(`Transcript "${path}" không hợp lệ: ${problems.join("; ")}`);
  }
  if (parsed.data.persona_id !== personaId) {
    throw new CliError(`Transcript "${path}" là của persona "${parsed.data.persona_id}", không phải "${personaId}".`);
  }
  return parsed.data;
}

export type SeedDemoDeps = {
  /** `DEMO_ACCOUNT_EMAILS`: the only accounts a demo session may be attached to. */
  demoEmails: string[];
  llmDeps?: Partial<CallModelDeps>;
  transcriptPath?: (personaId: string) => string;
};

/** Why the seeded session cannot be the demo: its replay moment is not an ignored hook. */
function notPrimary(level: "fallback1" | "none", turn: number | null): string {
  return level === "none"
    ? "buổi không có khoảnh khắc luyện lại nào (không hook nào bị bỏ qua, không câu dẫn dắt nào)"
    : `khoảnh khắc luyện lại là câu dẫn dắt ở lượt ${turn} (dự phòng 1), không phải một hook bị bỏ qua`;
}

/**
 * `seed-demo <email> --persona <id> --guess <n>` (FR-45): plays the prepared transcript through
 * the real engine with the configured models, ends the session with the prepared notes, computes
 * the reveal and stores the guess, so the demo account opens on the result with the replay still
 * ahead. It fails, with the reason, unless the replay moment is an ignored hook; a session that
 * failed is removed, so the account's newest session is always one that can be shown. Each run
 * makes a new session: a demo account has no one-session limit.
 */
export function runSeedDemo(args: string[], io: CliIo, db: Database | null, deps: () => SeedDemoDeps): Promise<number> {
  return reportCliErrors(io, async () => {
    if (!db) throw new CliError(needsDb("seed-demo"));
    const usage = "Cách dùng: il seed-demo <email> --persona <id> --guess <n>";
    const { positional, values } = parseArgs(args, { values: ["persona", "guess"] });
    const personaId = values.persona;
    if (positional.length !== 1 || !personaId || values.guess === undefined) throw new CliError(usage);
    const email = positional[0].trim().toLowerCase();
    // Checked against the persona's own number of items once the session exists.
    const guess = intOption(values.guess, "guess", { min: 0, max: 99, fallback: 0 });
    const { demoEmails, llmDeps, transcriptPath = demoTranscriptPath } = deps();

    if (!demoEmails.includes(email)) throw new CliError(`"${email}" không có trong DEMO_ACCOUNT_EMAILS: chỉ tài khoản demo mới nhận buổi seed.`);
    const transcript = await loadDemoTranscript(transcriptPath(personaId), personaId);
    const row = await findUserByEmail(db, email);
    if (!row) throw new CliError(`Chưa có tài khoản "${email}": đăng nhập vào InterviewLab bằng tài khoản này một lần rồi chạy lại.`);
    const user: AppUser = { id: row.id, email: row.email, isAdmin: false, isDemo: true, noticeAcked: true, roleFilter: null };

    const opened = await openSession(db, user, personaId);
    if (!opened.ok) {
      throw new CliError(
        opened.reason === "cap_reached" ? "Hôm nay đã chạm cap chi phí buổi luyện: không tạo được buổi mới." : `Không có persona "${personaId}" nào chơi được.`,
      );
    }
    const sessionId = opened.session.id;

    /** Removes the session that could not become the demo, and stops with the reason. */
    const fail = async (reason: string): Promise<never> => {
      await deleteSession(db, sessionId);
      throw new CliError(`seed-demo thất bại: ${reason}. Buổi vừa tạo đã được xóa.`);
    };

    // Declared here so the lines after the steps can report them.
    let seeded: { told: number; total: number; returnTurn: number };
    try {
      const itemCount = (await getSession(db, user.id, sessionId))!.scenario.content.items.length;
      if (guess > itemCount) await fail(`--guess ${guess} lớn hơn số điều persona giữ (${itemCount})`);

      for (const [position, text] of transcript.questions.entries()) {
        const turn = await runTurn(db, user, sessionId, { text, expectedIndex: position + 1, turnKey: randomUUID() }, { llmDeps });
        if (!turn.ok) await fail(`lượt ${position + 1} không chạy được (${turn.error})`);
        io.out(`Lượt ${position + 1}/${transcript.questions.length} xong.`);
      }

      const ended = await endSession(db, user, sessionId, { canvasText: transcript.canvas_text });
      if (!ended.ok) await fail(`không kết thúc được buổi (${ended.error})`);
      if ((await runReveal(db, sessionId, { llmDeps })) !== "finalised") await fail("không tính được reveal");

      const reveal = (await getSession(db, user.id, sessionId))?.session.revealJson;
      if (!reveal) return fail("không tính được reveal");
      const { replay } = reveal;
      if (replay.level !== "primary") await fail(notPrimary(replay.level, replay.level === "fallback1" ? replay.leadingTurn : null));

      const stored = await submitGuess(db, user, sessionId, { guess });
      if (!stored.ok) await fail(`không lưu được số đoán (${stored.error})`);
      seeded = { told: reveal.counts.told, total: reveal.counts.total, returnTurn: replay.level === "primary" ? replay.forkAfterTurn + 1 : 0 };
    } catch (error) {
      // A step that threw (a lost connection, a provider error outside a model call) must not
      // leave a half-played session as the account's newest one.
      if (!(error instanceof CliError)) await deleteSession(db, sessionId).catch(() => {});
      throw error;
    }

    io.out(`Đã seed buổi ${sessionId} cho ${email}: ${personaId}, ${transcript.questions.length} lượt, kể ${seeded.told}/${seeded.total}, đoán ${guess}.`);
    io.out(`Buổi dừng ở "revealed" với khoảnh khắc luyện lại từ lượt ${seeded.returnTurn}. Mở /sessions/${sessionId} bằng tài khoản demo.`);
    return 0;
  });
}

export function seedDemoCommand(db: Database | null, deps: () => SeedDemoDeps): Command {
  return {
    usage: "seed-demo <email> --persona <id> --guess <n>",
    summary: "Chạy transcript soạn sẵn qua engine thật cho tài khoản demo, dừng ở revealed.",
    run: (args, io) => runSeedDemo(args, io, db, deps),
  };
}
