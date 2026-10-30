/**
 * The plain voice of everything a persona says: short spoken sentences, everyday words, no
 * closing lesson. The prompts describe the voice and show it by example; no list of words is
 * banned, and no code checks a reply's wording. Whether a text keeps the voice is judged by a
 * model in eval only (`voice-judge` set), never at runtime.
 */

/** Rule lines for every prompt whose output a learner reads as someone's words: the persona, the scenario generator and the feedback generator. */
export const PLAIN_VOICE_LINES = [
  "- Dùng từ đời thường như lời nói, không dùng từ sách vở hay kiểu \"một cách + tính từ\".",
  "- Không kết bằng bài học, lời khuyên chung hay câu tóm tắt.",
] as const;

/**
 * What the generator asks of the fields a persona speaks. `identity` and `voice_notes` are
 * descriptions with their own field rules, and `opening_line` is a greeting that must reveal
 * nothing, so the concrete-detail line covers none of them.
 */
export const PLAIN_VOICE_RULES = [
  "Giọng văn của những gì nhân vật nói ra (opening_line, surface_facts, content, hook_line): câu ngắn như lời nói.",
  "- surface_facts, content và hook_line kể việc đã xảy ra, có con số, thời điểm, nơi chốn hay đồ vật, thay cho việc gọi tên một cảm xúc hay một tính cách.",
  ...PLAIN_VOICE_LINES,
].join("\n");

/**
 * The longest each field of the hand-written library runs, in words: the caps a generated
 * scenario is asked to keep. A unit test holds the library to them.
 */
export const VOICE_CAPS = { surfaceFact: 28, hookLine: 16, sampleQuestion: 22 } as const;
