import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { percentile, runMeasureLatency, type MeasureLatencyDeps } from "../../cli/commands/measure-latency";

const SESSION = "0b0e6c0e-1111-4222-8333-444455556666";
const COOKIE = "sb-local-auth-token=abc";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) }, out, err };
}

type Seen = { method: string; path: string; cookie: string | undefined; body: unknown };
type Behaviour = {
  /** Answers one turn request; the default streams a reply. */
  turn?: (index: number) => { status: number; json: unknown } | "stream" | "stored" | "broken" | "cut";
  /** Polls of the reveal answered `ready: false` before the one that is ready. */
  revealPolls?: number;
  end?: { status: number; json: unknown };
};

/** A server that speaks the app's session API, so the command is run over real HTTP. */
async function appStub(behaviour: Behaviour = {}) {
  const seen: Seen[] = [];
  let pollsLeft = behaviour.revealPolls ?? 0;
  const read = async (request: IncomingMessage) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    return raw ? JSON.parse(raw) : null;
  };
  const server: Server = createServer(async (request, response) => {
    const body = await read(request);
    const path = request.url ?? "";
    seen.push({ method: request.method ?? "", path, cookie: request.headers.cookie, body });
    const json = (status: number, value: unknown) => response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));

    if (path.endsWith("/turns")) {
      const index = (body as { expectedIndex: number }).expectedIndex;
      const answer = behaviour.turn?.(index) ?? "stream";
      if (answer === "stored") return json(200, { personaText: "Đã lưu.", turnIndex: index });
      if (typeof answer === "object") return json(answer.status, answer.json);
      response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8" });
      response.write(`${JSON.stringify({ type: "delta", text: "Chị " })}\n`);
      if (answer === "broken") return response.end(`${JSON.stringify({ type: "error", error: "llm_failed" })}\n`);
      if (answer === "cut") return response.end();
      return response.end(`${JSON.stringify({ type: "delta", text: "kể." })}\n${JSON.stringify({ type: "done", personaText: "Chị kể.", turnIndex: index })}\n`);
    }
    if (path.endsWith("/end")) return json(behaviour.end?.status ?? 200, behaviour.end?.json ?? { ended: true });
    if (path.endsWith("/guess")) return json(200, { stored: true });
    if (path.endsWith("/reveal")) return json(200, pollsLeft-- > 0 ? { ready: false } : { ready: true, reveal: {} });
    return json(404, { error: "not_found" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, seen, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

let running: Server | undefined;
afterEach(() => new Promise<void>((resolve) => (running ? running.close(() => resolve()) : resolve())));

async function run(args: (url: string) => string[], behaviour: Behaviour = {}, deps: Partial<MeasureLatencyDeps> = {}) {
  const stub = await appStub(behaviour);
  running = stub.server;
  const printed = capture();
  const code = await runMeasureLatency(args(stub.url), printed.io, { cookie: COOKIE, sleep: async () => {}, ...deps });
  return { code, ...printed, seen: stub.seen };
}

const measure = (turns: number) => (url: string) => [url, "--session", SESSION, "--turns", String(turns)];

describe("percentile (nearest rank)", () => {
  it("is the middle sample for p50 and the slowest of twenty for p95 of twenty", () => {
    const twenty = Array.from({ length: 20 }, (_, index) => (index + 1) * 100);
    expect(percentile(twenty, 0.5)).toBe(1000);
    expect(percentile(twenty, 0.95)).toBe(1900);
    expect(percentile(twenty, 1)).toBe(2000);
  });

  it("of thirty turns, p95 leaves the one slowest turn out", () => {
    const thirty = [...Array.from({ length: 28 }, () => 2000), 5000, 9000];
    expect(percentile(thirty, 0.95)).toBe(5000);
  });

  it("does not depend on the order of the samples, and leaves them as they were", () => {
    const samples = [900, 100, 500];
    expect(percentile(samples, 0.5)).toBe(500);
    expect(samples).toEqual([900, 100, 500]);
  });

  it("of one sample is that sample; of none is an error", () => {
    expect(percentile([42], 0.95)).toBe(42);
    expect(() => percentile([], 0.5)).toThrow();
  });
});

describe("il measure-latency", () => {
  it("plays the turns in order as the signed-in account, ends, guesses, and waits for the result", async () => {
    const { code, seen, err } = await run(measure(3), { revealPolls: 2 });

    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(seen.map((request) => `${request.method} ${request.path}`)).toEqual([
      ...[1, 2, 3].map(() => `POST /api/sessions/${SESSION}/turns`),
      `POST /api/sessions/${SESSION}/end`,
      `POST /api/sessions/${SESSION}/guess`,
      ...[1, 2, 3].map(() => `GET /api/sessions/${SESSION}/reveal`),
    ]);
    expect(seen.every((request) => request.cookie === COOKIE)).toBe(true);
    const turns = seen.slice(0, 3).map((request) => request.body as { text: string; expectedIndex: number; turnKey: string });
    expect(turns.map((turn) => turn.expectedIndex)).toEqual([1, 2, 3]);
    expect(new Set(turns.map((turn) => turn.turnKey)).size).toBe(3);
    expect(turns[0].text).toContain("chị Thu");
    expect(seen[3].body).toMatchObject({ canvasText: expect.any(String) });
    expect(seen[4].body).toEqual({ guess: 0 });
  });

  it("prints each turn, the percentiles, the reveal wait and the two NFR-2 verdicts", async () => {
    // A clock that moves one second each time it is read: every duration is known.
    let clock = 0;
    const { out } = await run(measure(2), {}, { now: () => (clock += 1000) });

    expect(out[0]).toMatch(/^Đo 2 lượt trên http:\/\/127\.0\.0\.1:\d+, buổi 0b0e6c0e/u);
    expect(out[1]).toBe("  lượt 01: 2.00 s (chữ đầu sau 1.00 s)");
    expect(out[2]).toBe("  lượt 02: 2.00 s (chữ đầu sau 1.00 s)");
    expect(out.slice(4)).toEqual([
      "Lượt (tới hết câu trả lời): p50 2.00 s · p95 2.00 s · chậm nhất 2.00 s · 2 mẫu",
      "Chữ đầu tiên của câu trả lời: p50 1.00 s · p95 1.00 s",
      'Reveal: sẵn sàng 1.00 s sau "Xem kết quả", 2.00 s sau khi kết thúc buổi · 1 mẫu',
      "NFR-2 lượt p95 ≤ 6.00 s: ĐẠT",
      "NFR-2 reveal ≤ 15.00 s: ĐẠT (một buổi là một mẫu; p95 cần nhiều buổi)",
    ]);
  });

  it("says when a target is missed", async () => {
    let clock = 0;
    const { code, out } = await run(measure(1), {}, { now: () => (clock += 8000) });

    expect(code).toBe(0);
    expect(out).toContain("NFR-2 lượt p95 ≤ 6.00 s: KHÔNG ĐẠT");
    expect(out).toContain("NFR-2 reveal ≤ 15.00 s: ĐẠT (một buổi là một mẫu; p95 cần nhiều buổi)");
  });

  it("repeats the demo questions when the session is longer than the transcript", async () => {
    const { seen } = await run(measure(30));
    const texts = seen.filter((request) => request.path.endsWith("/turns")).map((request) => (request.body as { text: string }).text);

    expect(texts).toHaveLength(30);
    const distinct = new Set(texts).size;
    expect(distinct).toBeLessThan(30);
    expect(texts[distinct]).toBe(texts[0]);
  });

  it("times a reply that was not streamed, with no first-text time", async () => {
    const { code, out } = await run(measure(1), { turn: () => "stored" });

    expect(code).toBe(0);
    expect(out[1]).toMatch(/^ {2}lượt 01: \d+\.\d\d s$/u);
    expect(out.some((line) => line.startsWith("Chữ đầu tiên"))).toBe(false);
  });

  it("stops at a turn the app refuses, with the app's reason, and ends nothing", async () => {
    const { code, err, seen } = await run(measure(3), { turn: (index) => (index === 2 ? { status: 409, json: { error: "conflict" } } : "stream") });

    expect(code).toBe(1);
    expect(err).toEqual(["Lượt 2: HTTP 409 (conflict)."]);
    expect(seen.some((request) => request.path.endsWith("/end"))).toBe(false);
  });

  it("stops when a reply breaks off or its stream is cut", async () => {
    expect((await run(measure(1), { turn: () => "broken" })).err).toEqual(["Lượt 1: câu trả lời hỏng giữa chừng (llm_failed)."]);
    await new Promise<void>((resolve) => running!.close(() => resolve()));
    expect((await run(measure(1), { turn: () => "cut" })).err).toEqual(["Lượt 1: luồng trả lời dừng trước khi báo kết quả."]);
  });

  it("says the cookie ran out when the app asks for a sign-in", async () => {
    const { code, err } = await run(measure(1), { turn: () => ({ status: 401, json: { error: "unauthenticated", redirectTo: "/sign-in?next=%2Fsessions%2Fx" } }) });

    expect(code).toBe(1);
    expect(err[0]).toContain("app đòi đăng nhập lại (/sign-in?next=%2Fsessions%2Fx)");
  });

  it("stops when the session cannot be ended", async () => {
    const { code, err, seen } = await run(measure(1), { end: { status: 409, json: { error: "in_flight" } } });

    expect(code).toBe(1);
    expect(err).toEqual(["Kết thúc buổi: HTTP 409 (in_flight)."]);
    expect(seen.some((request) => request.path.endsWith("/guess"))).toBe(false);
  });

  it("gives up on a result that never comes", async () => {
    let clock = 0;
    const { code, err } = await run(measure(1), { revealPolls: Number.POSITIVE_INFINITY }, { now: () => (clock += 60_000) });

    expect(code).toBe(1);
    expect(err).toEqual(["Kết quả chưa sẵn sàng sau 300.00 s."]);
  });

  it("refuses to start without a URL, a session id, a cookie, or with a wrong option, and sends nothing", async () => {
    const cases: [(url: string) => string[], Partial<MeasureLatencyDeps>, RegExp][] = [
      [() => [], {}, /^Cách dùng: il measure-latency <url> --session <id>/u],
      [(url) => [url], {}, /^Cách dùng: il measure-latency/u],
      [(url) => [url, "--session", "abc"], {}, /^"abc" không phải id buổi\.$/u],
      [() => ["not a url", "--session", SESSION], {}, /^"not a url" không phải URL\.$/u],
      [measure(3), { cookie: undefined }, /^Đặt IL_MEASURE_COOKIE/u],
      [measure(3), { cookie: "sb-token=secret-part\nsecond-line" }, /^IL_MEASURE_COOKIE phải là một dòng/u],
      [() => ["http://example.com", "--session", SESSION], {}, /^"http:\/\/example\.com" phải là https/u],
      [() => ["ftp://localhost", "--session", SESSION], {}, /phải là https/u],
      [measure(0), {}, /^--turns phải là số nguyên từ 1 đến 30\.$/u],
      [measure(31), {}, /^--turns phải là số nguyên từ 1 đến 30\.$/u],
      [(url) => [url, "--session", SESSION, "--fast"], {}, /^Không có tùy chọn --fast\.$/u],
      [(url) => [url, "--session", SESSION, "--persona", "nobody"], {}, /^Không đọc được file/u],
    ];
    for (const [args, deps, message] of cases) {
      const { code, err, seen } = await run(args, {}, deps);
      await new Promise<void>((resolve) => running!.close(() => resolve()));
      expect(code).toBe(1);
      expect(err[0]).toMatch(message);
      // A refused cookie is never repeated in the message.
      expect(err.join("\n")).not.toContain("secret-part");
      expect(seen).toEqual([]);
    }
  });

  it("keeps only the origin of the URL it was given", async () => {
    const { code, seen } = await run((url) => [`${url}/prep/chi-thu?x=1`, "--session", SESSION, "--turns", "1"]);

    expect(code).toBe(0);
    expect(seen[0].path).toBe(`/api/sessions/${SESSION}/turns`);
  });
});
