import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SESSION_STATUSES } from "@/db/schema";
import { topicSchema } from "@/scenario/schema";
import type { PersonaCardRow } from "@/db/repo/library";
import { filterTopics, groupByTopic, parseRoleFilter, personaButton, toOwnTopicCard, toPersonaCardView, type LibraryTopic } from "@/server/library";
import { clockOf } from "@/server/session-view";
import { HOME, LIBRARY, NEXT_STEP, ROLE_LABEL, TOPIC, fillTemplate, productStrings } from "@/strings/product-strings";
import { findSealed, readChiThu } from "../helpers/sealed-strings";

const persona = (personaId: string, topicId: string, topicRole: "ux" | "ba" | "pm" | null = "ux") => ({
  personaId,
  topicId,
  topicTitle: `Chủ đề ${topicId}`,
  topicSummary: "Một câu mô tả.",
  topicRole,
});

const topic = (id: string, role: LibraryTopic["role"]): LibraryTopic => ({ id, title: id, summary: "", role, personaCount: 1, doneCount: null });

describe("groupByTopic", () => {
  const rows = [persona("thu", "chi-tieu"), persona("dung", "chi-tieu"), persona("lan", "dat-san"), persona("hoa", "mua-sam", "ba")];

  it("makes one card per topic, in the order the rows come, with the persona count", () => {
    expect(groupByTopic(rows, null)).toEqual([
      { id: "chi-tieu", title: "Chủ đề chi-tieu", summary: "Một câu mô tả.", role: "ux", personaCount: 2, doneCount: null },
      { id: "dat-san", title: "Chủ đề dat-san", summary: "Một câu mô tả.", role: "ux", personaCount: 1, doneCount: null },
      { id: "mua-sam", title: "Chủ đề mua-sam", summary: "Một câu mô tả.", role: "ba", personaCount: 1, doneCount: null },
    ]);
  });

  it("has no done count for a guest, and a count from zero for a learner", () => {
    expect(groupByTopic(rows, null).map((card) => card.doneCount)).toEqual([null, null, null]);
    expect(groupByTopic(rows, new Set()).map((card) => card.doneCount)).toEqual([0, 0, 0]);
    expect(groupByTopic(rows, new Set(["thu", "dung", "hoa"])).map((card) => card.doneCount)).toEqual([2, 0, 1]);
  });

  it("ignores a finished persona that is no longer listed", () => {
    expect(groupByTopic(rows, new Set(["gone"])).map((card) => card.doneCount)).toEqual([0, 0, 0]);
  });

  it("is empty when there is no persona", () => {
    expect(groupByTopic([], new Set(["thu"]))).toEqual([]);
  });
});

describe("filterTopics", () => {
  const topics = [topic("a", "ux"), topic("b", "ba"), topic("c", "ux"), topic("d", null)];
  const ids = (filter: Parameters<typeof filterTopics>[1]) => filterTopics(topics, filter).map((card) => card.id);

  it("keeps the topics of the chosen role, in order", () => {
    expect(ids("ux")).toEqual(["a", "c"]);
    expect(ids("ba")).toEqual(["b"]);
    expect(ids("pm")).toEqual([]);
  });

  it("shows every topic for 'Khác' and when no chip is chosen", () => {
    expect(ids("other")).toEqual(["a", "b", "c", "d"]);
    expect(ids(null)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("parseRoleFilter", () => {
  it("reads the four chips", () => {
    expect(["ux", "ba", "pm", "other"].map(parseRoleFilter)).toEqual(["ux", "ba", "pm", "other"]);
  });

  it("reads anything else as no filter", () => {
    for (const value of ["", "UX", " ux", "admin", "ux,ba", null, undefined, 3, ["ux"], { role: "ux" }]) expect(parseRoleFilter(value)).toBeNull();
  });
});

describe("personaButton (PRD §7)", () => {
  it("is 'Bắt đầu' when the learner has no session with the persona", () => {
    expect(personaButton(null)).toBe("start");
  });

  it("is 'Xem lại kết quả' for a finished session and 'Tiếp tục buổi luyện' for every other state", () => {
    const buttons = Object.fromEntries(SESSION_STATUSES.map((status) => [status, personaButton({ status })]));
    expect(buttons).toEqual({
      generating: "continue",
      interviewing: "continue",
      revealed: "continue",
      replaying: "continue",
      failed_eval: "continue",
      withdrawn: "continue",
      done: "review",
    });
  });
});

describe("topic file", () => {
  const base = { id: "ux-dat-san", title: "Đặt sân", summary: "Một câu." };

  const full = { ...base, role: "pm", display_order: 30 };

  it("is refused without a role or without an order: an import would wipe what is stored", () => {
    expect(topicSchema.safeParse(base).success).toBe(false);
    expect(topicSchema.safeParse({ ...base, role: "ux" }).success).toBe(false);
    expect(topicSchema.safeParse({ ...base, display_order: 10 }).success).toBe(false);
  });

  it("takes a role of the closed set and a whole, non-negative order", () => {
    expect(topicSchema.parse(full)).toEqual(full);
    expect(topicSchema.parse({ ...full, display_order: 0 })).toMatchObject({ display_order: 0 });
    for (const bad of [{ role: "other" }, { role: "UX" }, { role: null }, { display_order: -1 }, { display_order: 1.5 }, { display_order: "10" }, { owner: "x" }]) {
      expect(topicSchema.safeParse({ ...full, ...bad }).success).toBe(false);
    }
  });

  it("is what the curated topic on disk passes", () => {
    const file = JSON.parse(readFileSync("scenarios/ux-chi-tieu/topic.json", "utf8"));
    expect(topicSchema.parse(file)).toMatchObject({ id: "ux-chi-tieu", role: "ux", display_order: 10 });
  });
});

describe("toOwnTopicCard (Màn 2, PRD §7)", () => {
  const row = (status: (typeof SESSION_STATUSES)[number]) => ({
    topicId: "topic-1",
    title: "app đặt lịch cắt tóc ở tiệm nhỏ",
    // 14:40 UTC is 21:40 on the learners' clock.
    createdAt: new Date("2026-10-02T14:40:00Z"),
    sessionId: "session-1",
    status,
  });

  it("opens Màn 11 while the topic is being prepared or did not pass", () => {
    expect(toOwnTopicCard(row("generating"))).toMatchObject({ state: "preparing", href: "/sessions/session-1", done: false });
    expect(toOwnTopicCard(row("failed_eval"))).toMatchObject({ state: "failed_eval", href: "/sessions/session-1", done: false });
  });

  it("opens the topic's own page once it can be played, and is done only for a finished session", () => {
    for (const status of ["interviewing", "revealed", "replaying"] as const) {
      expect(toOwnTopicCard(row(status)), status).toMatchObject({ state: "playable", href: "/topics/topic-1", done: false });
    }
    expect(toOwnTopicCard(row("done"))).toMatchObject({ state: "playable", href: "/topics/topic-1", done: true });
  });

  it("carries the topic as typed and when it was asked for, on the learners' clock", () => {
    expect(toOwnTopicCard(row("generating"))).toEqual({
      topicId: "topic-1",
      title: "app đặt lịch cắt tóc ở tiệm nhỏ",
      created: "02/10 · 21:40",
      state: "preparing",
      done: false,
      href: "/sessions/session-1",
    });
  });

  it("puts a request made late in the evening UTC on the next day", () => {
    expect(toOwnTopicCard({ ...row("done"), createdAt: new Date("2026-12-31T17:05:00Z") }).created).toBe("01/01 · 00:05");
  });
});

describe("clockOf", () => {
  it("is the time of day at UTC+7, two digits each, midnight as 00", () => {
    expect(clockOf(new Date("2026-10-02T02:03:00Z"))).toBe("09:03");
    expect(clockOf(new Date("2026-10-02T17:00:00Z"))).toBe("00:00");
    expect(clockOf(new Date("2026-10-02T16:59:59Z"))).toBe("23:59");
  });
});

describe("the strings of the library", () => {
  it("are all in the fixed-string check", () => {
    const checked = new Map(productStrings().map((entry) => [entry.key, entry.text]));
    for (const [name, text] of Object.entries(LIBRARY)) expect(checked.get(`library.${name}`), name).toBe(text);
    for (const [name, text] of Object.entries(ROLE_LABEL)) expect(checked.get(`role_label.${name}`), name).toBe(text);
    for (const [name, text] of Object.entries(TOPIC)) expect(checked.get(`topic.${name}`), name).toBe(text);
    for (const [name, text] of Object.entries(HOME)) expect(checked.get(`home.${name}`), name).toBe(text);
    for (const [name, text] of Object.entries(NEXT_STEP)) expect(checked.get(`next_step.${name}`), name).toBe(text);
  });

  it("word the next step as the PRD and the artboard do, with the persona's form of address in the button", () => {
    expect(NEXT_STEP.all_practised).toBe("Bạn đã luyện mọi persona của vai trò này.");
    expect(NEXT_STEP.same_topic).toBe("Cùng chủ đề");
    expect(fillTemplate(NEXT_STEP.continue_with, { persona: "anh Dũng" })).toBe("Luyện tiếp với anh Dũng");
    expect(LIBRARY.enter).toBe("Vào thư viện");
  });

  it("word the topic's warning, its line for a generated scenario and its two end states as the PRD does", () => {
    expect(TOPIC.warning).toBe(
      "Nếu đồ án của bạn cũng về chủ đề này, điều các nhân vật ở đây kể có thể thành giả thuyết trong đầu bạn trước khi gặp người thật. Họ là nhân vật hư cấu, không phải người dùng của bạn.",
    );
    expect(TOPIC.generated).toBe("Kịch bản do AI sinh, chỉ qua kiểm tra nhẹ. Mọi chi tiết là hư cấu.");
    expect(TOPIC.empty).toBe("Chủ đề này đang được cập nhật.");
    expect(TOPIC.not_found).toBe("Không tìm thấy chủ đề này.");
  });

  it("word the 'Khác' line and the empty state as the PRD does", () => {
    expect(LIBRARY.other_note).toBe("Chưa có chủ đề dành cho vai trò của bạn; đây là mọi chủ đề.");
    expect(LIBRARY.empty).toBe("Chưa có chủ đề cho vai trò này.");
    expect(ROLE_LABEL).toEqual({ ux: "UX", ba: "BA", pm: "PM", other: "Khác" });
  });

  it("gives every string its own key", () => {
    const keys = productStrings().map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("toPersonaCardView (Màn 2b, PRD §7)", () => {
  const chiThu = readChiThu();
  const row: PersonaCardRow = {
    personaId: "chi-thu",
    topicId: "ux-chi-tieu",
    displayName: "chị Thu",
    avatarKey: "thu",
    tagline: "Kế toán ở một công ty logistics",
    origin: "authored",
    name: "Chị Thu, 26 tuổi",
    researchGoal: chiThu.research_goal,
    itemCount: chiThu.items.length,
    firstImportedAt: new Date("2026-09-20T03:00:00Z"),
  };
  // 18:30 UTC is already the next day on the learners' clock.
  const session = (status: (typeof SESSION_STATUSES)[number]) => ({ personaId: "chi-thu", id: "session-1", status, startedAt: new Date("2026-09-25T18:30:00Z") });

  it("no session: 'Bắt đầu', with no session to open and no day", () => {
    expect(toPersonaCardView(row, null)).toMatchObject({ button: "start", sessionId: null, sessionDate: null });
  });

  it.each(["interviewing", "revealed", "replaying"] as const)("%s: 'Tiếp tục buổi luyện' on that session", (status) => {
    expect(toPersonaCardView(row, session(status))).toMatchObject({ button: "continue", sessionId: "session-1" });
  });

  it("done: 'Xem lại kết quả' on that session, with the day it started in Vietnam", () => {
    expect(toPersonaCardView(row, session("done"))).toMatchObject({ button: "review", sessionId: "session-1", sessionDate: "26/09" });
  });

  it("carries who the persona is, the research question and how many items there are, under these keys only", () => {
    const card = toPersonaCardView(row, session("done"));
    expect(card).toMatchObject({
      personaId: "chi-thu",
      name: "Chị Thu, 26 tuổi",
      displayName: "chị Thu",
      avatarKey: "thu",
      tagline: "Kế toán ở một công ty logistics",
      researchGoal: "Vì sao người trẻ bắt đầu rồi bỏ việc theo dõi chi tiêu?",
      itemCount: 11,
    });
    // A new field has to be added here on purpose: the card is sent to the browser.
    expect(Object.keys(card).sort()).toEqual(["avatarKey", "button", "displayName", "itemCount", "name", "personaId", "researchGoal", "sessionDate", "sessionId", "tagline"]);
    expect(findSealed(JSON.stringify(card), chiThu)).toEqual([]);
  });

  it("drops a field the row may gain later instead of passing it on", () => {
    const widened = { ...row, content: chiThu, items: chiThu.items } as PersonaCardRow;
    const sent = JSON.stringify(toPersonaCardView(widened, null));
    expect(findSealed(sent, chiThu)).toEqual([]);
    expect(sent).not.toContain("sample_question");
  });
});
