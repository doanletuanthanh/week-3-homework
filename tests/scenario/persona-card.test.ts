import { describe, expect, it } from "vitest";
import { capitalizeFirst, personaCard } from "@/scenario/persona-card";
import { findSealed, readChiThu } from "../helpers/sealed-strings";

describe("capitalizeFirst", () => {
  it("capitalises the first letter only, including Vietnamese letters", () => {
    expect(capitalizeFirst("chị Thu")).toBe("Chị Thu");
    expect(capitalizeFirst("anh Dũng")).toBe("Anh Dũng");
    expect(capitalizeFirst("ông Đạt")).toBe("Ông Đạt");
    expect(capitalizeFirst("")).toBe("");
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
