// Stands in for the OpenAI API during end-to-end tests. The app is unchanged: it reaches this
// server because OPENAI_BASE_URL points here. A question containing "[stub:fail]" gets HTTP 500.
// GET /requests returns every request body received so far, so tests can read what the app sent.
import { createServer } from "node:http";

const PORT = Number(process.env.LLM_STUB_PORT ?? 4010);
const usage = { input: 420, output: 18 };
const received = [];

/** Text of every user message, whichever of the two OpenAI request shapes was used. */
function userTexts(body) {
  const messages = body.messages ?? body.input ?? [];
  return messages
    .filter((message) => message.role === "user")
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : (message.content ?? []).map((part) => part.text ?? "").join(""),
    );
}

function chatCompletion(model, text) {
  return {
    id: "chatcmpl-stub",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: usage.input, completion_tokens: usage.output, total_tokens: usage.input + usage.output },
  };
}

function response(model, text) {
  return {
    id: "resp_stub",
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model,
    output: [
      {
        type: "message",
        id: "msg_stub",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    usage: {
      input_tokens: usage.input,
      output_tokens: usage.output,
      total_tokens: usage.input + usage.output,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
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
  const questions = userTexts(body);
  const last = questions.at(-1) ?? "";

  if (last.includes("[stub:fail]")) {
    reply.writeHead(500, { "content-type": "application/json" });
    reply.end(JSON.stringify({ error: { message: "stubbed provider failure", type: "server_error" } }));
    return;
  }

  // The reply reports how the question arrived, so tests can see the transcript and the data block.
  const wrapped = last.trimStart().startsWith("<cau_hoi>") ? "trong khối dữ liệu" : "không có khối dữ liệu";
  const text = `Chị trả lời câu thứ ${questions.length} (${wrapped}).`;
  const payload = request.url.endsWith("/responses") ? response(body.model, text) : chatCompletion(body.model, text);
  reply.writeHead(200, { "content-type": "application/json" });
  reply.end(JSON.stringify(payload));
}).listen(PORT, "127.0.0.1", () => console.log(`LLM stub listening on ${PORT}`));
