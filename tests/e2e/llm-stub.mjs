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
// GET /requests returns every request body received so far, so tests can read what the app sent.
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
  if (question.includes("[stub:fail]") || (!structured && question.includes("[stub:fail-persona]"))) {
    reply.writeHead(500, { "content-type": "application/json" });
    reply.end(JSON.stringify({ error: { message: "stubbed provider failure", type: "server_error" } }));
    return;
  }

  const isResponses = request.url.endsWith("/responses");
  const text = structured ? JSON.stringify(analysisFor(question)) : personaLine(body);
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
