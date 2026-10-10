import { randomUUID } from "node:crypto";
import { MAX_TURNS } from "@/config/limits";
import { isUuid } from "@/server/uuid";
import { intOption, parseArgs, reportCliErrors } from "../args";
import { CliError, type CliIo, type Command } from "../scenario-file";
import { demoTranscriptPath, loadDemoTranscript } from "./seed-demo";

/** NFR-2: p95 of a main-interview turn, and of the wait for the result after "Xem kết quả". */
const TURN_TARGET_MS = 6_000;
const REVEAL_TARGET_MS = 15_000;

const REVEAL_POLL_MS = 500;
/** Longer than a reveal with every retry of its three calls. */
const REVEAL_GIVE_UP_MS = 300_000;

export type MeasureLatencyDeps = {
  /** The `Cookie` header of a signed-in account that accepted the data notice (`IL_MEASURE_COOKIE`). */
  cookie: string | undefined;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  transcriptPath?: (personaId: string) => string;
};

/** The value at or below which `share` of the samples fall (nearest rank). */
export function percentile(samples: number[], share: number): number {
  if (samples.length === 0) throw new Error("percentile of no samples");
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(share * sorted.length) - 1)];
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
const verdict = (ms: number, target: number) => (ms <= target ? "ĐẠT" : "KHÔNG ĐẠT");

type TurnTiming = { firstTextMs: number | null; totalMs: number };

/**
 * `measure-latency <base URL> --session <id>` (NFR-2): plays a session over HTTP as a browser
 * does and prints how long the turns and the reveal took. The session is one the operator just
 * started in the browser with a demo account; the questions are the demo transcript's, repeated.
 * It uses the deployed app's real models, so a run costs one session.
 */
export async function runMeasureLatency(args: string[], io: CliIo, deps: MeasureLatencyDeps): Promise<number> {
  return reportCliErrors(io, async () => {
    const { positional, values } = parseArgs(args, { values: ["session", "turns", "persona"] as const });
    const [baseUrl] = positional;
    if (!baseUrl || positional.length !== 1 || !values.session) throw new CliError(`Cách dùng: il ${measureLatencyCommand(deps).usage}`);
    if (!isUuid(values.session)) throw new CliError(`"${values.session}" không phải id buổi.`);
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new CliError(`"${baseUrl}" không phải URL.`);
    }
    // The cookie is a sign-in: it only travels encrypted, or to this machine.
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new CliError(`"${baseUrl}" phải là https (http chỉ dùng cho localhost).`);
    const origin = url.origin;
    if (!deps.cookie) {
      throw new CliError("Đặt IL_MEASURE_COOKIE là header Cookie của tài khoản demo đang đăng nhập (DevTools > Network > một request tới app > Request Headers > Cookie).");
    }
    // Said here, without the value: a header the runtime refuses is reported with the whole value in it.
    if (!/^[\x20-\x7e]+$/u.test(deps.cookie)) throw new CliError("IL_MEASURE_COOKIE phải là một dòng, không xuống dòng và không có ký tự lạ: sao chép lại header Cookie.");
    const turns = intOption(values.turns, "turns", { min: 1, max: MAX_TURNS, fallback: MAX_TURNS });
    const personaId = values.persona ?? "chi-thu";
    const transcript = await loadDemoTranscript((deps.transcriptPath ?? demoTranscriptPath)(personaId), personaId);

    const send = deps.fetch ?? fetch;
    const now = deps.now ?? (() => performance.now());
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const sessionUrl = `${origin}/api/sessions/${values.session}`;
    const headers = { cookie: deps.cookie, "content-type": "application/json", "x-device-class": "desktop" };

    /** An answer that is not the one expected: said in words, with what the app answered. */
    const refused = async (what: string, response: Response): Promise<never> => {
      const body = (await response.json().catch(() => ({}))) as { error?: string; redirectTo?: string };
      if (body.redirectTo) throw new CliError(`${what}: app đòi đăng nhập lại (${body.redirectTo}). Cookie đã hết hạn hoặc tài khoản chưa bấm "Tôi hiểu".`);
      throw new CliError(`${what}: HTTP ${response.status}${body.error ? ` (${body.error})` : ""}.`);
    };

    async function playTurn(index: number): Promise<TurnTiming> {
      const text = transcript.questions[(index - 1) % transcript.questions.length];
      const startedAt = now();
      const response = await send(`${sessionUrl}/turns`, { method: "POST", headers, body: JSON.stringify({ text, expectedIndex: index, turnKey: randomUUID() }) });
      if (!response.ok) await refused(`Lượt ${index}`, response);
      if (!response.headers.get("content-type")?.includes("ndjson") || !response.body) return { firstTextMs: null, totalMs: now() - startedAt };

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let firstTextMs: number | null = null;
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line) as { type: string; error?: string };
          if (event.type === "delta") firstTextMs ??= now() - startedAt;
          else if (event.type === "done") return { firstTextMs, totalMs: now() - startedAt };
          else throw new CliError(`Lượt ${index}: câu trả lời hỏng giữa chừng (${event.error ?? "không rõ"}).`);
        }
      }
      throw new CliError(`Lượt ${index}: luồng trả lời dừng trước khi báo kết quả.`);
    }

    io.out(`Đo ${turns} lượt trên ${origin}, buổi ${values.session}`);
    const timings: TurnTiming[] = [];
    for (let index = 1; index <= turns; index += 1) {
      const timing = await playTurn(index);
      timings.push(timing);
      io.out(`  lượt ${String(index).padStart(2, "0")}: ${seconds(timing.totalMs)}${timing.firstTextMs === null ? "" : ` (chữ đầu sau ${seconds(timing.firstTextMs)})`}`);
    }

    const endedAt = now();
    const ended = await send(`${sessionUrl}/end`, { method: "POST", headers, body: JSON.stringify({ canvasText: transcript.canvas_text }) });
    if (!ended.ok) await refused("Kết thúc buổi", ended);
    // Sent at once: a learner spends longer on the guess screen, so this is the longest wait there can be.
    const guessedAt = now();
    const guessed = await send(`${sessionUrl}/guess`, { method: "POST", headers, body: JSON.stringify({ guess: 0 }) });
    if (!guessed.ok) await refused("Gửi dự đoán", guessed);
    for (;;) {
      const response = await send(`${sessionUrl}/reveal`, { headers });
      if (!response.ok) await refused("Đọc kết quả", response);
      if (((await response.json()) as { ready: boolean }).ready) break;
      if (now() - guessedAt > REVEAL_GIVE_UP_MS) throw new CliError(`Kết quả chưa sẵn sàng sau ${seconds(REVEAL_GIVE_UP_MS)}.`);
      await sleep(REVEAL_POLL_MS);
    }
    const readyAt = now();

    const totals = timings.map((timing) => timing.totalMs);
    const firsts = timings.flatMap((timing) => (timing.firstTextMs === null ? [] : [timing.firstTextMs]));
    const turnP95 = percentile(totals, 0.95);
    const revealMs = readyAt - guessedAt;
    io.out("");
    io.out(`Lượt (tới hết câu trả lời): p50 ${seconds(percentile(totals, 0.5))} · p95 ${seconds(turnP95)} · chậm nhất ${seconds(Math.max(...totals))} · ${totals.length} mẫu`);
    if (firsts.length > 0) io.out(`Chữ đầu tiên của câu trả lời: p50 ${seconds(percentile(firsts, 0.5))} · p95 ${seconds(percentile(firsts, 0.95))}`);
    io.out(`Reveal: sẵn sàng ${seconds(revealMs)} sau "Xem kết quả", ${seconds(readyAt - endedAt)} sau khi kết thúc buổi · 1 mẫu`);
    io.out(`NFR-2 lượt p95 ≤ ${seconds(TURN_TARGET_MS)}: ${verdict(turnP95, TURN_TARGET_MS)}`);
    io.out(`NFR-2 reveal ≤ ${seconds(REVEAL_TARGET_MS)}: ${verdict(revealMs, REVEAL_TARGET_MS)} (một buổi là một mẫu; p95 cần nhiều buổi)`);
    return 0;
  });
}

export const measureLatencyCommand = (deps: MeasureLatencyDeps): Command => ({
  usage: "measure-latency <url> --session <id> [--turns n] [--persona id]",
  summary: "Đo độ trễ lượt và reveal của một buổi trên app đã deploy (NFR-2); tốn chi phí một buổi",
  run: (args, io) => runMeasureLatency(args, io, deps),
});
