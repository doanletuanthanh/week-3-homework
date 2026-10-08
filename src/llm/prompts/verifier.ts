import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { VerifierContext, VerifierLine } from "@/engine/reveal-contexts";
import { tokenize } from "@/engine/tokens";
import type { UnlockPath } from "@/scenario/schema";
import { renderTranscript } from "./analysis";
import { DATA_BLOCK_RULE, dataBlock } from "./data-block";

const PATHS: Record<UnlockPath, string> = {
  surface: "hỏi thẳng vào chủ đề, không dẫn dắt",
  follow_up: "hỏi tiếp đúng vào câu gợi mở nhân vật đã nói, bằng một câu xác nhận hoặc dò ranh giới",
  past_story: "hỏi về một lần cụ thể đã xảy ra, không dẫn dắt",
  trust: "hỏi vào chủ đề khi nhân vật đã đủ cởi mở, không dẫn dắt",
};

const RULES = [
  "Với mỗi mục (mã V...), trả một phần tử: claim_id = mã đó, verdict = \"agree\" hoặc \"disagree\", reason = một câu ngắn, label = null trừ loại suggested_question.",
  "- unlock: agree khi câu hỏi của người hỏi ở lượt đó đúng là loại câu hỏi và nhãn được ghi, tức là đúng cách hỏi của đường mở được ghi.",
  "- disclosure: agree khi ở lượt đó nhân vật thật sự kể ra phần chính của điều được ghi. Chỉ nhắc lướt thì disagree.",
  "- leading_novelty: agree khi trước lượt đó nhân vật chưa từng nói ý của cụm được ghi. Nhân vật đã nói ý đó rồi thì disagree.",
  "- hook_ignored: agree khi câu hỏi ở lượt sau không hỏi tiếp vào câu gợi mở được ghi. Lượt sau thực ra có hỏi tiếp thì disagree.",
  "- praise, comment, habit: agree khi (các) lượt được trích đúng là chứa điều nhận xét nói tới, và nhận xét không khẳng định gì về người dùng thật hay người thật. Sai một trong hai thì disagree.",
  "- suggested_question: gán label cho câu hỏi được ghi, coi như nó được hỏi thay cho câu ở lượt được trích: confirm_grounded (xác nhận hoặc hỏi sâu điều nhân vật đã nói), boundary_probe (dò ranh giới điều nhân vật đã nói), open (câu mở, trung tính), leading (tự thêm nguyên nhân, phán xét, giải pháp hay nội dung nhân vật chưa nói). verdict = \"disagree\" khi label là leading, ngược lại \"agree\".",
].join("\n");

const oneLine = (text: string) => tokenize(text).join(" ");

/** One check per line. Text a model or the learner wrote is flattened so it cannot start a line. */
function renderCheck(check: VerifierLine): string {
  const parts = [`- ${check.id}`, `loại: ${check.kind}`];
  const aboutClaim = check.kind === "praise" || check.kind === "comment" || check.kind === "habit";
  if (check.kind === "hook_ignored") {
    parts.push(`lượt thả: ${check.turn}`, `lượt sau: ${check.nextTurn}`, `câu gợi mở: ${oneLine(check.hookLine ?? "")}`);
  } else if (aboutClaim || check.kind === "suggested_question") {
    parts.push(`lượt trích: ${check.citedTurns.join(", ") || "(không có)"}`);
  } else {
    parts.push(`lượt: ${check.turn}`);
  }
  if (check.path) parts.push(`đường mở: ${PATHS[check.path]}`, `nhãn: ${check.label}`, `loại câu hỏi: ${check.questionType}`);
  if (check.itemContent) parts.push(`điều: ${oneLine(check.itemContent)}`);
  if (check.kind === "leading_novelty") parts.push(`cụm: "${oneLine(check.text)}"`);
  if (check.kind === "suggested_question") parts.push(`câu hỏi: ${oneLine(check.text)}`);
  if (aboutClaim) parts.push(`nhận xét: ${oneLine(check.text)}`);
  if (check.canvasQuote) parts.push(`ghi chú: "${oneLine(check.canvasQuote)}"`);
  return parts.join(" | ");
}

/**
 * Reveal call 3 (addendum §2.5): checks, on the frozen transcript, everything a learner is about
 * to be shown or credited with. It wrote none of it: the labels came from Call 1, the verdicts
 * from the judges, the comments from the generator.
 */
export function buildVerifierMessages(context: VerifierContext): BaseMessage[] {
  const system = [
    "Bạn là người kiểm chứng của một buổi luyện phỏng vấn người dùng đã kết thúc. Bạn không viết nhận xét. Bạn kiểm lại từng mục trong <can_kiem> dựa trên <hoi_thoai> và trả về đúng một đối tượng JSON theo schema được yêu cầu.",
    DATA_BLOCK_RULE,
    RULES,
  ].join("\n\n");

  const human = [
    dataBlock("nhan_vat", `${context.persona.displayName}. ${context.persona.identity}`),
    dataBlock("hoi_thoai", renderTranscript(context.transcript)),
    "Các mục cần kiểm:",
    dataBlock("can_kiem", context.checks.length > 0 ? context.checks.map(renderCheck).join("\n") : "(không có)"),
  ].join("\n\n");

  return [new SystemMessage(system), new HumanMessage(human)];
}
