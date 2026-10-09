// Stands in for the OpenAI API during end-to-end tests. The app is unchanged: it reaches this
// server because OPENAI_BASE_URL points here. It answers the two calls of a turn:
//   - Call 1 (a request that asks for a JSON schema) gets a neutral analysis;
//   - Call 2 (a streamed request) gets a persona line, sent piece by piece.
// Markers in the learner's newest question steer one turn:
//   [stub:fail]            every call of the turn gets HTTP 500
//   [stub:fail-persona]    Call 1 succeeds, Call 2 gets HTTP 500
//   [stub:break-stream]    Call 2 sends two pieces, then the connection is cut
//   [stub:slow]            Call 2 waits between pieces, so a test can watch the reply arrive
//   [stub:analysis={...}]  JSON (no spaces) merged over the neutral analysis
// It also answers the three reveal calls, told apart by the first sentence of their prompt:
//   - the end judge gets a neutral verdict and no canvas match;
//   - the generator gets one claim for every slot the prompt lists;
//   - the verifier gets "agree" for every check the prompt lists.
// Markers anywhere in a reveal prompt (a learner question, or the notes for the judge) steer it:
//   [stub:judge={...}]              JSON (no spaces) merged over the judge's neutral reply
//   [stub:verifier-disagree=a,b]    the verifier disagrees with every check of these kinds
//   [stub:fail-reveal=judge]        that reveal call gets HTTP 500 (judge, generator, verifier or all)
//   [stub:slow-reveal]              the judge waits before answering, so a test can watch the wait
// It answers the replay judge too (the third call of a replay turn), told apart by the first
// sentence of its prompt: a neutral verdict, and the label "open" for the learner's question.
// Markers in the newest learner line of the transcript the judge is given steer it:
//   [stub:replay-judge={...}]       JSON (no spaces) merged over the judge's neutral reply
//   [stub:fail-judge]               the judge gets HTTP 500, so the turn counts unchecked
//   [stub:slow-judge]               the judge waits before answering, so a test can watch the wait
// It answers the calls of a custom topic as well, told apart by the first sentence of their prompt:
//   - moderation allows the topic, with the focus the learner's answer names;
//   - the scenario generator returns chị Thu's file under another name ("chị Mai");
//   - the output safety check finds nothing.
// Markers in the topic the learner typed steer one attempt:
//   [stub:refuse]            moderation refuses the topic
//   [stub:minor]             moderation allows it with the constraint adult_persona_only
//   [stub:fail-moderation]   the moderation call gets HTTP 500
//   [stub:invalid]           the generator returns three items, on every try
//   [stub:unsafe]            the generator names a real company, and the safety check objects to it
//   [stub:fail-gen]          the generator gets HTTP 500
//   [stub:slow-gen]          the generator waits before answering, so a test can watch the wait
// GET /requests returns every request body received so far, so tests can read what the app sent.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = Number(process.env.LLM_STUB_PORT ?? 4010);
const usage = { input: 420, output: 18 };
const received = [];

const NEUTRAL_ANALYSIS = {
  prev_turn_verdict: { hook_dropped: false, disclosed_item_ids: [], violations: [] },
  question_type: "other",
  label: "open",
  grounded_turn_id: null,
  introduced_span: null,
  hook_id: null,
  topic_tags: [],
};

const textOf = (content) => (typeof content === "string" ? content : (content ?? []).map((part) => part.text ?? "").join(""));

/** Text of every message of a role, whichever of the two OpenAI request shapes was used. */
function texts(body, role) {
  const messages = body.messages ?? body.input ?? [];
  return messages.filter((message) => message.role === role).map((message) => textOf(message.content));
}

const wantsJson = (body) => body.text?.format?.type === "json_schema" || body.response_format?.type === "json_schema";

/** The learner's newest question as the prompt carries it: Call 1 in <cau_hoi_moi>, Call 2 in the last <cau_hoi>. */
function newestQuestion(body) {
  const last = texts(body, "user").at(-1) ?? "";
  const tag = wantsJson(body) ? "cau_hoi_moi" : "cau_hoi";
  const start = last.lastIndexOf(`<${tag}>`);
  return start < 0 ? "" : last.slice(start);
}

/** Every piece of text in the request, whatever role or request shape carries it. */
function allText(body) {
  const messages = body.messages ?? body.input ?? [];
  return [typeof body.instructions === "string" ? body.instructions : "", ...(Array.isArray(messages) ? messages.map((message) => textOf(message.content)) : [])].join("\n");
}

const REVEAL_ROLES = [
  ["judge", "người chấm cuối buổi"],
  ["generator", "người viết nhận xét"],
  ["verifier", "người kiểm chứng"],
];

/** Which reveal call this is, or null for a call of a turn. */
function revealRole(text) {
  return REVEAL_ROLES.find(([, phrase]) => text.includes(phrase))?.[0] ?? null;
}

const isReplayJudge = (text) => text.includes("người phán đoán của một buổi luyện phỏng vấn");

/** The learner line of the turn the replay judge is asked about: the last one of its transcript. */
function judgedQuestion(text) {
  return [...text.matchAll(/^\[lượt \d+\] người hỏi: (.*)$/gm)].at(-1)?.[1] ?? "";
}

function replayJudgeReply(question) {
  const match = /\[stub:replay-judge=(\{\S*\})\]/.exec(question);
  return { prev_turn_verdict: NEUTRAL_ANALYSIS.prev_turn_verdict, label: "open", introduced_span: null, ...(match ? JSON.parse(match[1]) : {}) };
}

const NEEDS_QUESTION = new Set(["leading", "hypothetical_future", "heard_not_followed"]);

function revealReply(role, text) {
  if (role === "judge") {
    const match = /\[stub:judge=(\{\S*\})\]/.exec(text);
    return { last_turn_verdict: NEUTRAL_ANALYSIS.prev_turn_verdict, canvas_matches: [], ...(match ? JSON.parse(match[1]) : {}) };
  }
  if (role === "generator") {
    const claims = [...text.matchAll(/^- (S\d+) \| loại: (\w+) \| lượt: ([\d, ]+)(.*)$/gm)].map(([, slot, type, turns, rest]) => {
      const cited = turns.split(",").map((turn) => Number(turn.trim()));
      const note = /ghi chú \[(\d+), (\d+)\]/.exec(rest);
      return {
        slot,
        text: `Nhận xét của stub cho ô ${type}.`,
        cited_turns: note ? [cited[0]] : cited,
        item_id: /điều: (I\d+)/.exec(rest)?.[1] ?? null,
        canvas_range: note ? [Number(note[1]), Number(note[2])] : null,
        suggested_question: NEEDS_QUESTION.has(type) ? `Câu hỏi thay thế của stub cho lượt ${cited[0]}?` : null,
      };
    });
    return { claims };
  }
  const disagree = (/\[stub:verifier-disagree=([\w,]+)\]/.exec(text)?.[1] ?? "").split(",");
  const claims = [...text.matchAll(/^- (V\d+) \| loại: (\w+)/gm)].map(([, id, kind]) => ({
    claim_id: id,
    verdict: disagree.includes(kind) ? "disagree" : "agree",
    reason: "stub",
    label: kind === "suggested_question" ? "open" : null,
  }));
  return { claims };
}

function analysisFor(question) {
  const match = /\[stub:analysis=(\{\S*\})\]/.exec(question);
  return { ...NEUTRAL_ANALYSIS, ...(match ? JSON.parse(match[1]) : {}) };
}

function personaLine(body) {
  const users = texts(body, "user");
  // The reply reports how the question arrived, so tests can see the transcript and the data block.
  const wrapped = (users.at(-1) ?? "").includes("<cau_hoi>\n") ? "trong khối dữ liệu" : "không có khối dữ liệu";
  return `Chị trả lời câu thứ ${users.length} (${wrapped}).`;
}

const CUSTOM_ROLES = [
  ["moderation", "người kiểm duyệt chủ đề"],
  ["generator", "người soạn kịch bản nhân vật"],
  ["safety", "người kiểm an toàn nội dung"],
];

/** Which call of the custom-topic path this is, or null for any other call. */
function customRole(text) {
  return CUSTOM_ROLES.find(([, phrase]) => text.includes(phrase))?.[0] ?? null;
}

const BASE_SCENARIO = JSON.parse(readFileSync(new URL("../../scenarios/ux-chi-tieu/chi-thu.json", import.meta.url), "utf8"));
const REAL_COMPANY_CLAIM = "Chị làm kế toán ở Vinamilk, công ty này hay nợ lương nhân viên.";

/** A scenario as the generator returns it: chị Thu's content under another name. */
function generatedScenario(prompt) {
  const items = BASE_SCENARIO.items.map((item) => ({
    id: item.id,
    content: item.content,
    secret_terms: item.secret_terms,
    topic_tag: item.topic_tag,
    path: item.path,
    prerequisite_id: item.prerequisite_id ?? null,
    trust_threshold: item.trust_threshold ?? null,
    hook_line: item.hook_line,
    do_not_assert: item.do_not_assert.text,
    weight: item.weight,
    sample_question: item.sample_question,
  }));
  const facts = BASE_SCENARIO.surface_facts;
  return {
    persona: { ...BASE_SCENARIO.persona, avatar_key: undefined, display_name: "chị Mai", name: "Chị Mai, 27 tuổi", tagline: "Nhân viên văn phòng ở một công ty nhỏ" },
    research_goal: BASE_SCENARIO.research_goal,
    opening_line: "Chào em, chị là Mai. Em cứ hỏi tự nhiên nha.",
    openness_start: BASE_SCENARIO.openness_start,
    surface_facts: prompt.includes("[stub:unsafe]") ? [REAL_COMPANY_CLAIM, ...facts.slice(1)] : facts,
    error_patterns: BASE_SCENARIO.error_patterns,
    habit_card_label: BASE_SCENARIO.habit_card_label,
    items: prompt.includes("[stub:invalid]") ? items.slice(0, 3) : items,
  };
}

function moderationReply(prompt) {
  if (prompt.includes("[stub:refuse]")) return { decision: "refuse", reason_code: "real_org_or_brand", constraints: [], focus: "general" };
  const asked = prompt.slice(prompt.lastIndexOf("<muon_luyen>"));
  const focus = asked.includes("Hỏi tiếp chi tiết") ? "follow_up" : asked.includes("dẫn dắt") ? "no_leading" : "general";
  if (prompt.includes("[stub:minor]")) return { decision: "allow_with_constraints", reason_code: null, constraints: ["adult_persona_only"], focus };
  return { decision: "allow", reason_code: null, constraints: [], focus };
}

/** The reply of a custom-topic call, as JSON text. */
function customReply(role, prompt) {
  if (role === "moderation") return moderationReply(prompt);
  if (role === "generator") return generatedScenario(prompt);
  return { violations: prompt.includes("Vinamilk") ? [{ field: "surface_facts[0]", kind: "real_org_or_brand", reason: "stub" }] : [] };
}

const tokenUsage = {
  chat: { prompt_tokens: usage.input, completion_tokens: usage.output, total_tokens: usage.input + usage.output },
  responses: {
    input_tokens: usage.input,
    output_tokens: usage.output,
    total_tokens: usage.input + usage.output,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 0 },
  },
};

function chatCompletion(model, text) {
  return {
    id: "chatcmpl-stub",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: tokenUsage.chat,
  };
}

const outputMessage = (text) => ({
  type: "message",
  id: "msg_stub",
  status: "completed",
  role: "assistant",
  content: [{ type: "output_text", text, annotations: [] }],
});

function response(model, text, status = "completed") {
  return {
    id: "resp_stub",
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status,
    model,
    output: status === "completed" ? [outputMessage(text)] : [],
    usage: status === "completed" ? tokenUsage.responses : null,
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Server-sent events of a streamed reply, in the shape of the endpoint that was called. */
async function streamReply(reply, { model, text, isResponses, slow, breakAfter }) {
  reply.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const send = (event, data) => reply.write(`${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`);
  const pieces = text.match(/\S+\s*/g) ?? [];

  if (isResponses) {
    send("response.created", { type: "response.created", response: response(model, "", "in_progress") });
    send("response.output_item.added", {
      type: "response.output_item.added",
      output_index: 0,
      item: { type: "message", id: "msg_stub", status: "in_progress", role: "assistant", content: [] },
    });
    send("response.content_part.added", {
      type: "response.content_part.added",
      item_id: "msg_stub",
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: "", annotations: [] },
    });
  }

  for (const [index, piece] of pieces.entries()) {
    if (index === breakAfter) {
      // Let the pieces already written reach the client before the connection drops.
      await sleep(300);
      reply.destroy();
      return;
    }
    if (slow) await sleep(250);
    if (isResponses) {
      send("response.output_text.delta", { type: "response.output_text.delta", item_id: "msg_stub", output_index: 0, content_index: 0, delta: piece });
    } else {
      send(null, { id: "chatcmpl-stub", object: "chat.completion.chunk", model, choices: [{ index: 0, delta: { role: "assistant", content: piece }, finish_reason: null }] });
    }
  }

  if (isResponses) {
    send("response.output_text.done", { type: "response.output_text.done", item_id: "msg_stub", output_index: 0, content_index: 0, text });
    send("response.output_item.done", { type: "response.output_item.done", output_index: 0, item: outputMessage(text) });
    send("response.completed", { type: "response.completed", response: response(model, text) });
  } else {
    send(null, { id: "chatcmpl-stub", object: "chat.completion.chunk", model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
    send(null, { id: "chatcmpl-stub", object: "chat.completion.chunk", model, choices: [], usage: tokenUsage.chat });
    reply.write("data: [DONE]\n\n");
  }
  reply.end();
}

createServer(async (request, reply) => {
  if (request.method === "GET") {
    if (request.url === "/requests") {
      reply.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(received));
      return;
    }
    reply.writeHead(200).end("ok");
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  received.push(body);

  const question = newestQuestion(body);
  const structured = wantsJson(body);
  const prompt = allText(body);
  const custom = customRole(prompt);
  if (custom) {
    const failed = (custom === "moderation" && prompt.includes("[stub:fail-moderation]")) || (custom === "generator" && prompt.includes("[stub:fail-gen]"));
    if (failed) {
      reply.writeHead(500, { "content-type": "application/json" });
      reply.end(JSON.stringify({ error: { message: "stubbed provider failure", type: "server_error" } }));
      return;
    }
    if (custom === "generator" && prompt.includes("[stub:slow-gen]")) await sleep(4000);
    const text = JSON.stringify(customReply(custom, prompt));
    reply.writeHead(200, { "content-type": "application/json" });
    reply.end(JSON.stringify(request.url.endsWith("/responses") ? response(body.model, text) : chatCompletion(body.model, text)));
    return;
  }

  const reveal = revealRole(prompt);
  const failReveal = /\[stub:fail-reveal=(\w+)\]/.exec(prompt)?.[1];
  if (reveal && (failReveal === reveal || failReveal === "all")) {
    reply.writeHead(500, { "content-type": "application/json" });
    reply.end(JSON.stringify({ error: { message: "stubbed provider failure", type: "server_error" } }));
    return;
  }
  if (reveal === "judge" && prompt.includes("[stub:slow-reveal]")) await sleep(2500);
  const judged = !reveal && isReplayJudge(prompt) ? judgedQuestion(prompt) : null;
  if (judged?.includes("[stub:fail-judge]")) {
    reply.writeHead(500, { "content-type": "application/json" });
    reply.end(JSON.stringify({ error: { message: "stubbed provider failure", type: "server_error" } }));
    return;
  }
  if (judged?.includes("[stub:slow-judge]")) await sleep(2000);
  if (question.includes("[stub:fail]") || (!structured && question.includes("[stub:fail-persona]"))) {
    reply.writeHead(500, { "content-type": "application/json" });
    reply.end(JSON.stringify({ error: { message: "stubbed provider failure", type: "server_error" } }));
    return;
  }

  const isResponses = request.url.endsWith("/responses");
  const text = reveal
    ? JSON.stringify(revealReply(reveal, prompt))
    : judged !== null
      ? JSON.stringify(replayJudgeReply(judged))
      : structured
        ? JSON.stringify(analysisFor(question))
        : personaLine(body);
  if (body.stream) {
    await streamReply(reply, {
      model: body.model,
      text,
      isResponses,
      slow: question.includes("[stub:slow]"),
      breakAfter: question.includes("[stub:break-stream]") ? 2 : -1,
    });
    return;
  }
  reply.writeHead(200, { "content-type": "application/json" });
  reply.end(JSON.stringify(isResponses ? response(body.model, text) : chatCompletion(body.model, text)));
}).listen(PORT, "127.0.0.1", () => console.log(`LLM stub listening on ${PORT}`));
