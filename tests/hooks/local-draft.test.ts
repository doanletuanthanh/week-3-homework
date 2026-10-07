import { afterEach, describe, expect, it, vi } from "vitest";
import { readDraft, writeDraft } from "@/hooks/use-local-draft";

/** A `localStorage` that keeps its values in a map the test can read. */
function fakeStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

let counter = 0;
/** The store remembers keys for the life of the page, so every test uses its own. */
const freshKey = () => `notes:test-${(counter += 1)}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("drafts kept in the browser", () => {
  it("has no draft before anything is typed", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage() });
    expect(readDraft(freshKey())).toBeNull();
  });

  it("stores a draft under the session's key and reads it back", () => {
    const storage = fakeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    const key = freshKey();

    writeDraft(key, "từng thử ghi chép rồi bỏ?");

    expect(readDraft(key)).toBe("từng thử ghi chép rồi bỏ?");
    expect(storage.values.get(`il:draft:${key}`)).toBe("từng thử ghi chép rồi bỏ?");
  });

  it("finds a draft left by an earlier page load (after a reload or a sign-in round trip)", () => {
    const storage = fakeStorage();
    const key = freshKey();
    storage.values.set(`il:draft:${key}`, "câu hỏi đang gõ dở");
    vi.stubGlobal("window", { localStorage: storage });

    expect(readDraft(key)).toBe("câu hỏi đang gõ dở");
  });

  it("keeps an empty draft apart from no draft: the learner cleared the text", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage() });
    const key = freshKey();
    writeDraft(key, "");
    expect(readDraft(key)).toBe("");
  });

  it("removes the draft from the browser once the server has the text", () => {
    const storage = fakeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    const key = freshKey();
    writeDraft(key, "đã gửi");

    writeDraft(key, null);

    expect(readDraft(key)).toBeNull();
    expect(storage.values.has(`il:draft:${key}`)).toBe(false);
  });

  it("keeps drafts of different sessions apart", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage() });
    const [first, second] = [freshKey(), freshKey()];
    writeDraft(first, "buổi một");
    writeDraft(second, "buổi hai");
    expect([readDraft(first), readDraft(second)]).toEqual(["buổi một", "buổi hai"]);
  });

  it("still holds the text for this page when the browser refuses storage", () => {
    const refuse = () => {
      throw new Error("storage is disabled");
    };
    vi.stubGlobal("window", { localStorage: { getItem: refuse, setItem: refuse, removeItem: refuse } });
    const key = freshKey();

    expect(readDraft(key)).toBeNull();
    writeDraft(key, "vẫn còn trên màn hình");
    expect(readDraft(key)).toBe("vẫn còn trên màn hình");
    writeDraft(key, null);
    expect(readDraft(key)).toBeNull();
  });

  it("does not fail where there is no browser at all", () => {
    const key = freshKey();
    expect(readDraft(key)).toBeNull();
    expect(() => writeDraft(key, "trên server")).not.toThrow();
  });
});
