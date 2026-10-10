import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PersonaCard } from "@/components/library/persona-card";
import { PersonaAvatar } from "@/components/persona-avatar";
import { TopicWarning } from "@/components/topic-warning";
import { TopicSkeleton } from "@/components/ui/page-skeletons";
import type { PersonaCardView } from "@/server/library";

// The card's form posts a server action; what it does is tested where sessions are started.
vi.mock("@/server/actions", () => ({ startSession: async () => {} }));

const HOSTILE = '<img src=x onerror="alert(1)">';

const card = (overrides: Partial<PersonaCardView> = {}): PersonaCardView => ({
  personaId: "chi-thu",
  name: "Chị Thu, 26 tuổi",
  displayName: "chị Thu",
  avatarKey: "thu",
  tagline: "Kế toán ở một công ty logistics",
  researchGoal: "Vì sao người trẻ bắt đầu rồi bỏ việc theo dõi chi tiêu?",
  itemCount: 11,
  button: "start",
  sessionId: null,
  sessionDate: null,
  ...overrides,
});

const render = (persona: PersonaCardView, demo = false) => renderToStaticMarkup(<PersonaCard persona={persona} demo={demo} />);
/** The links of a card's foot, as [text, href]. */
const links = (markup: string) => [...markup.matchAll(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gu)].map((match) => [match[2].replace(/<svg.*?<\/svg>/gu, ""), match[1]]);

describe("PersonaAvatar", () => {
  it("draws the illustration its key names", () => {
    const markup = renderToStaticMarkup(<PersonaAvatar size={64} avatarKey="thu" name="chị Thu" />);
    expect(markup).toContain("<path");
    expect(markup).not.toContain("<text");
    expect(markup).toContain('aria-hidden="true"');
  });

  it("shows the initial of the given name for a persona with no illustration", () => {
    for (const [name, initial] of [["anh Khoa", "K"], ["chị Hạnh", "H"], ["cô Lan", "L"], ["ông Đạt", "Đ"]]) {
      const markup = renderToStaticMarkup(<PersonaAvatar size={44} avatarKey={null} name={name} />);
      expect(markup, name).toContain(`>${initial}</text>`);
      expect(markup).toMatch(/class="avatar av-tone-[0-3]"/u);
      expect(markup).toContain('width="44" height="44"');
      expect(markup).toContain('aria-hidden="true"');
    }
  });

  it("falls back to the initial for a key no illustration exists for", () => {
    expect(renderToStaticMarkup(<PersonaAvatar size={64} avatarKey="khoa" name="anh Khoa" />)).toContain(">K</text>");
  });

  it("gives a persona the same tone every time, and not every persona the same one", () => {
    const tone = (name: string) => /av-tone-(\d)/u.exec(renderToStaticMarkup(<PersonaAvatar size={64} avatarKey={null} name={name} />))![1];
    expect(tone("anh Khoa")).toBe(tone("anh Khoa"));
    // A screen that starts a sentence with the name passes it capitalised: still the same tone.
    for (const name of ["anh Khoa", "đồng chí Đạt", "ông Ân", "chị ánh"]) expect(tone(name.charAt(0).toLocaleUpperCase("vi") + name.slice(1)), name).toBe(tone(name));
    expect(new Set(["chị Hạnh", "anh Khoa", "anh Tùng", "cô Lan", "chị My", "bạn Phúc"].map(tone)).size).toBeGreaterThan(1);
  });

  it("is an empty circle where no persona exists yet", () => {
    const markup = renderToStaticMarkup(<PersonaAvatar size={44} avatarKey={null} name={null} />);
    expect(markup).toContain("<text");
    expect(markup).toMatch(/<text[^>]*><\/text>/u);
  });

  it("escapes a name", () => {
    expect(renderToStaticMarkup(<PersonaAvatar size={44} avatarKey={null} name={`chị ${HOSTILE}`} />)).not.toContain("<img");
  });
});

describe("PersonaCard: the label and the button of each state (PRD §7)", () => {
  it("no session: 'Sẵn sàng' and 'Bắt đầu' to Màn 3", () => {
    const markup = render(card());
    expect(markup).toContain("Sẵn sàng");
    expect(links(markup)).toEqual([["Bắt đầu", "/prep/chi-thu"]]);
  });

  it("a session in progress: 'Đang làm dở' and 'Tiếp tục buổi luyện' to the session", () => {
    const markup = render(card({ button: "continue", sessionId: "s-1", sessionDate: "25/09" }));
    expect(markup).toContain("Đang làm dở");
    expect(markup).not.toContain("25/09");
    expect(links(markup)).toEqual([["Tiếp tục buổi luyện", "/sessions/s-1"]]);
  });

  it("a finished session: 'Đã luyện · dd/mm' and 'Xem lại kết quả' to the session", () => {
    const markup = render(card({ button: "review", sessionId: "s-1", sessionDate: "25/09" }));
    expect(markup).toContain("Đã luyện · 25/09");
    expect(links(markup)).toEqual([["Xem lại kết quả", "/sessions/s-1"]]);
  });

  it("shows who the persona is, the research question and the seal counter", () => {
    const markup = render(card());
    expect(markup).toContain('<h2 id="persona-chi-thu" class="headline-md">Chị Thu, 26 tuổi</h2>');
    // Two cards carry the same button text: each card is a region named by its persona.
    expect(markup).toContain('<article class="card pcard" aria-labelledby="persona-chi-thu">');
    expect(markup).toContain("Kế toán ở một công ty logistics");
    expect(markup).toContain("Câu hỏi nghiên cứu");
    expect(markup).toContain("Vì sao người trẻ bắt đầu rồi bỏ việc theo dõi chi tiêu?");
    expect(markup).toContain("Niêm phong");
    expect(markup).toContain("Đang giữ 11 điều chưa nói");
  });

  it("a learner's card has no form: a session is only ever created on Màn 3", () => {
    for (const state of [card(), card({ button: "continue", sessionId: "s-1" }), card({ button: "review", sessionId: "s-1", sessionDate: "25/09" })]) {
      expect(render(state)).not.toContain("<form");
      expect(render(state)).not.toContain("Bắt đầu buổi mới");
    }
  });

  it("a demo account's card also starts one more session, in every state (FR-45)", () => {
    for (const state of [card(), card({ button: "continue", sessionId: "s-1" }), card({ button: "review", sessionId: "s-1", sessionDate: "25/09" })]) {
      const markup = render(state, true);
      expect(markup.match(/<form/gu)).toHaveLength(1);
      expect(markup).toContain('<input type="hidden" name="personaId" value="chi-thu"/>');
      expect(markup).toMatch(/<button type="submit"[^>]*>Bắt đầu buổi mới<\/button>/u);
      // The main button is still there, and still the one of the state.
      expect(links(markup)).toHaveLength(1);
    }
  });

  it("escapes everything a generated persona carries", () => {
    const markup = render(card({ name: HOSTILE, displayName: HOSTILE, tagline: HOSTILE, researchGoal: HOSTILE, avatarKey: null }));
    expect(markup).not.toContain("<img");
    expect(markup.match(/&lt;img/gu)!.length).toBeGreaterThanOrEqual(3);
  });
});

describe("TopicWarning (FR-51)", () => {
  it("says the warning of the PRD, word for word, as a note", () => {
    const markup = renderToStaticMarkup(<TopicWarning />);
    expect(markup).toContain('role="note"');
    expect(markup).toContain(
      "Nếu đồ án của bạn cũng về chủ đề này, điều các nhân vật ở đây kể có thể thành giả thuyết trong đầu bạn trước khi gặp người thật. Họ là nhân vật hư cấu, không phải người dùng của bạn.",
    );
  });
});

describe("the loading state of a topic's page", () => {
  it("says what is loading once, first, and hides its blocks", () => {
    const markup = renderToStaticMarkup(<TopicSkeleton />);
    expect(markup).toMatch(/^<div><p class="sr" role="status">Đang tải chủ đề<\/p>/u);
    expect(markup.match(/role="status"/gu)).toHaveLength(1);
    expect(markup).not.toContain("aria-busy");
    const blocks = markup.match(/<span class="skel[^>]*>/gu) ?? [];
    expect(blocks.length).toBeGreaterThan(8);
    expect(blocks.every((block) => block.includes('aria-hidden="true"'))).toBe(true);
  });
});
