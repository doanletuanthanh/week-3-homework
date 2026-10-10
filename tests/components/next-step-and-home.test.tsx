import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TopicCard } from "@/components/library/topic-card";
import { NextStep } from "@/components/reveal/next-step";
import type { LibraryTopic, NextPersona } from "@/server/library";

const HOSTILE = '<img src=x onerror="alert(1)">';

const persona = (overrides: Partial<NextPersona> = {}): NextPersona => ({
  personaId: "anh-dung",
  displayName: "anh Dũng",
  name: "Anh Dũng, 29 tuổi",
  avatarKey: null,
  itemCount: 10,
  topicId: "ux-chi-tieu",
  topicTitle: "Chi tiêu hằng ngày của người trẻ đi làm",
  sameTopic: true,
  ...overrides,
});

const ALL_PRACTISED = "Bạn đã luyện mọi persona của vai trò này.";
/** The links of a markup, as [text, href]. */
const links = (markup: string) => [...markup.matchAll(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gu)].map((match) => [match[2].replace(/<svg.*?<\/svg>/gu, ""), match[1]]);

describe("NextStep: a persona to practise next (FR-31)", () => {
  it("of the same topic: says so, names the persona, and leads to its prep screen and to the library", () => {
    const markup = renderToStaticMarkup(<NextStep waitlisted={false} next={{ kind: "next", persona: persona() }} />);

    expect(markup).toContain('<span class="eyebrow">Cùng chủ đề</span>');
    expect(markup).toContain('<h3 class="headline-sm">Anh Dũng, 29 tuổi</h3>');
    expect(markup).toContain("Đang giữ 10 điều");
    expect(links(markup)).toEqual([
      ["Luyện tiếp với anh Dũng", "/prep/anh-dung"],
      ["Về thư viện", "/library"],
    ]);
    // The topic is the one just practised: it is not repeated.
    expect(markup).not.toContain("Chi tiêu hằng ngày");
    expect(markup).not.toContain(ALL_PRACTISED);
    // No illustration: the initial of the given name.
    expect(markup).toContain(">D</text>");
  });

  it("of another topic: says so and names that topic", () => {
    const next = persona({ personaId: "co-lan", displayName: "cô Lan", name: "Cô Lan, 52 tuổi", topicId: "ux-dat-san", topicTitle: "Ứng dụng đặt sân thể thao theo giờ", sameTopic: false });
    const markup = renderToStaticMarkup(<NextStep waitlisted={false} next={{ kind: "next", persona: next }} />);

    expect(markup).toContain('<span class="eyebrow">Một chủ đề khác</span>');
    expect(markup).toContain("Ứng dụng đặt sân thể thao theo giờ");
    expect(links(markup)[0]).toEqual(["Luyện tiếp với cô Lan", "/prep/co-lan"]);
    expect(markup).not.toContain("Cùng chủ đề");
  });

  it("still offers the waitlist beside the suggestion", () => {
    const markup = renderToStaticMarkup(<NextStep waitlisted={false} next={{ kind: "next", persona: persona() }} />);
    expect(markup).toContain("Muốn thêm persona?");
    expect(markup).toMatch(/<button type="button"[^>]*>Báo tôi khi có<\/button>/u);
  });

  it("escapes what a persona and its topic carry, and encodes nothing into the link but the id", () => {
    const markup = renderToStaticMarkup(
      <NextStep waitlisted={false} next={{ kind: "next", persona: persona({ name: HOSTILE, displayName: HOSTILE, topicTitle: HOSTILE, sameTopic: false }) }} />,
    );
    expect(markup).not.toContain("<img");
    expect(markup.match(/&lt;img/gu)!.length).toBeGreaterThanOrEqual(3);
  });
});

describe("NextStep: nobody left to offer", () => {
  it("every persona of the role practised: says so, with the library and the waitlist", () => {
    const markup = renderToStaticMarkup(<NextStep waitlisted={false} next={{ kind: "all_practised" }} />);

    expect(markup).toContain(ALL_PRACTISED);
    expect(links(markup)).toEqual([["Vào thư viện", "/library"]]);
    expect(markup).toContain("Báo tôi khi có");
    expect(markup).not.toContain("Luyện tiếp với");
  });

  it("a role with no persona at all: never 'you practised them all', only the library and the waitlist", () => {
    const markup = renderToStaticMarkup(<NextStep waitlisted={false} next={{ kind: "none_exist" }} />);

    expect(markup).not.toContain(ALL_PRACTISED);
    expect(markup).not.toContain("đã luyện");
    expect(links(markup)).toEqual([["Vào thư viện", "/library"]]);
    expect(markup).toContain("Báo tôi khi có");
  });

  it("no link leads to the home page or to a persona by a fixed id", () => {
    for (const next of [{ kind: "all_practised" }, { kind: "none_exist" }] as const) {
      const markup = renderToStaticMarkup(<NextStep waitlisted={false} next={next} />);
      expect(markup).not.toContain('href="/"');
      expect(markup).not.toContain("/prep/");
    }
  });
});

describe("NextStep: the waitlist once joined", () => {
  it.each([{ kind: "all_practised" }, { kind: "none_exist" }, { kind: "next", persona: persona() }] as const)("says so in place of the button ($kind)", (next) => {
    const markup = renderToStaticMarkup(<NextStep waitlisted next={next} />);
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Đã ghi. Chúng tôi sẽ báo khi có persona mới.");
    expect(markup).not.toContain("Báo tôi khi có");
  });
});

describe("TopicCard: its heading level", () => {
  const topic: LibraryTopic = { id: "ux-chi-tieu", title: "Chi tiêu hằng ngày", summary: "Một câu.", role: "ux", personaCount: 3, doneCount: null };

  it("is a second-level heading in the library and a third-level one under the home page's section", () => {
    expect(renderToStaticMarkup(<TopicCard topic={topic} />)).toContain('<h2 class="headline-md tcard-title">Chi tiêu hằng ngày</h2>');
    expect(renderToStaticMarkup(<TopicCard topic={topic} level={3} />)).toContain('<h3 class="headline-md tcard-title">Chi tiêu hằng ngày</h3>');
  });

  it("shows no progress when there is none to show: the home page is the same for everyone", () => {
    const markup = renderToStaticMarkup(<TopicCard topic={topic} level={3} />);
    expect(markup).not.toContain("Đã luyện");
    expect(markup).toContain("3 persona");
    expect(markup).toContain('href="/topics/ux-chi-tieu"');
  });
});
