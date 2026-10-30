import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Takeaway } from "@/components/reveal/takeaway";
import type { BrowserClaim, BrowserReveal } from "@/engine/seal";
import { TAKEAWAY, fillTemplate } from "@/strings/product-strings";

const claim = (overrides: Partial<BrowserClaim> = {}): BrowserClaim => ({
  id: "C1",
  type: "leading",
  text: "Lần sau hỏi chị Thu ghi chi tiêu thế nào trước.",
  turns: [4, 6, 9],
  quote: "Chắc tại chị lười nên mới bỏ đúng không ạ?",
  addedWords: "tại chị lười",
  canvasQuote: null,
  suggestedQuestion: "Lần gần nhất chị dừng ghi là khi nào ạ?",
  ...overrides,
});

const takeaway = (overrides: Partial<BrowserReveal["takeaway"]> = {}): BrowserReveal["takeaway"] => ({ praise: null, comments: [claim()], habit: null, emptyLine: null, ...overrides });

const render = (value: BrowserReveal["takeaway"], canDownload = true) =>
  renderToStaticMarkup(
    <Takeaway
      takeaway={value}
      persona={{ displayName: "chị Thu", displayNameCapitalized: "Chị Thu" }}
      canDownload={canDownload}
      sessionId="s1"
      print={{ topicTitle: "Chi tiêu cá nhân", date: "30/10/2026", fileName: "f" }}
    />,
  );

describe("Takeaway: a lighter frame around the comments", () => {
  it("titles the section and the print sheet with the fixed title, with no em dash", () => {
    const markup = render(takeaway());
    expect(markup.match(new RegExp(TAKEAWAY.title, "gu"))).toHaveLength(2);
    expect(TAKEAWAY.title).not.toContain("—");
  });

  it("folds a comment's other turns under one count line, and lists them plainly on the print sheet", () => {
    const markup = render(takeaway());
    const screen = markup.slice(0, markup.indexOf('class="print-sheet"'));
    expect(screen).toContain(`<details class="body-sm c-variant"><summary>${fillTemplate(TAKEAWAY.repeated, { count: 2 })}</summary>`);
    expect(screen).not.toContain("Cũng thấy ở");
    expect(markup.slice(markup.indexOf('class="print-sheet"'))).toContain("(lượt 6, 9)");
  });

  it("shows no count line for a comment about one turn", () => {
    expect(render(takeaway({ comments: [claim({ turns: [4] })] }))).not.toContain("<details");
  });

  it("says the learner made no mistake only when nothing was found, and a neutral line when comments were not shown", () => {
    expect(render(takeaway({ comments: [], emptyLine: "nothing_found" }), false)).toContain(TAKEAWAY.empty);
    const notShown = render(takeaway({ comments: [], emptyLine: "not_shown" }), false);
    expect(notShown).toContain(TAKEAWAY.notShown);
    expect(notShown).not.toContain(TAKEAWAY.empty);
  });
});
