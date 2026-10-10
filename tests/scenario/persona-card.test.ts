import { describe, expect, it } from "vitest";
import { capitalizeFirst, personaCard, personaInitial } from "@/scenario/persona-card";
import { findSealed, readChiThu } from "../helpers/sealed-strings";

describe("capitalizeFirst", () => {
  it("capitalises the first letter only, including Vietnamese letters", () => {
    expect(capitalizeFirst("chị Thu")).toBe("Chị Thu");
    expect(capitalizeFirst("anh Dũng")).toBe("Anh Dũng");
    expect(capitalizeFirst("ông Đạt")).toBe("Ông Đạt");
    expect(capitalizeFirst("")).toBe("");
  });
});

describe("personaInitial", () => {
  it("is the first letter of the given name, not of the form of address", () => {
    // chị Thu, and the six personas of the three topics about apps and web apps.
    const initials = ["chị Thu", "chị Hạnh", "anh Khoa", "anh Tùng", "cô Lan", "chị My", "bạn Phúc"].map(personaInitial);
    expect(initials).toEqual(["T", "H", "K", "T", "L", "M", "P"]);
  });

  it("keeps a Vietnamese letter whole and in upper case", () => {
    expect(personaInitial("ông Đạt")).toBe("Đ");
    expect(personaInitial("chị ánh")).toBe("Á");
    expect(personaInitial("anh Ân")).toBe("Â");
  });

  it("reads a name of one word, and spaces around or inside a name", () => {
    expect(personaInitial("Thu")).toBe("T");
    expect(personaInitial("  chị   Thu  ")).toBe("T");
    expect(personaInitial("chị Thu Hà")).toBe("H");
  });

  it("is a letter: a last word that starts with anything else is passed over", () => {
    expect(personaInitial("anh Dũng (IT)")).toBe("D");
    expect(personaInitial("chị Thu 2")).toBe("T");
    expect(personaInitial("(IT)")).toBe("");
    expect(personaInitial("123")).toBe("");
  });

  it("is empty for an empty name", () => {
    expect(personaInitial("")).toBe("");
    expect(personaInitial("   ")).toBe("");
  });
});

describe("personaCard", () => {
  const scenario = readChiThu();
  const card = personaCard(scenario);

  it("carries the names, the research goal and the seal counter", () => {
    expect(card).toEqual({
      displayName: "chị Thu",
      displayNameCapitalized: "Chị Thu",
      name: "Chị Thu, 26 tuổi",
      tagline: "Kế toán ở một công ty logistics",
      researchGoal: "Vì sao người trẻ bắt đầu rồi bỏ việc theo dõi chi tiêu?",
      itemCount: 11,
    });
  });

  it("the sealed-text check used by these tests does find item text when it is there", () => {
    expect(findSealed(JSON.stringify(scenario), scenario).length).toBeGreaterThan(50);
    expect(findSealed("Chị đang TRA PHI cho một app.", scenario)).toEqual(["trả phí"]);
  });

  it("carries nothing from the items except how many there are", () => {
    expect(findSealed(JSON.stringify(card), scenario)).toEqual([]);
  });
});
