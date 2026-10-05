import { describe, expect, it } from "vitest";
import { containsTerm, normalizeText, tokenize } from "@/scenario/text-normalize";

describe("normalizeText", () => {
  it("lower-cases and removes Vietnamese diacritics, including đ", () => {
    expect(normalizeText("Đám Cưới bạn thân")).toBe("dam cuoi ban than");
    expect(normalizeText("TRẢ GÓP qua thẻ tín dụng")).toBe("tra gop qua the tin dung");
  });

  it("gives the same result for composed and decomposed input", () => {
    expect(normalizeText("trả phí".normalize("NFD"))).toBe(normalizeText("trả phí".normalize("NFC")));
  });
});

describe("tokenize", () => {
  it("splits on spaces and punctuation and keeps numbers", () => {
    expect(tokenize("Ghi được 19 ngày, rồi... dừng!")).toEqual(["ghi", "duoc", "19", "ngay", "roi", "dung"]);
  });

  it("returns nothing for text without letters or digits", () => {
    expect(tokenize("  …?! ")).toEqual([]);
  });
});

describe("containsTerm", () => {
  it("finds a term whatever its case, diacritics and the punctuation around it", () => {
    expect(containsTerm("Chị đang TRẢ PHÍ hằng tháng.", "trả phí")).toBe(true);
    expect(containsTerm("chi dang tra phi hang thang", "Trả Phí")).toBe(true);
    expect(containsTerm("(trả-phí)", "trả phí")).toBe(true);
  });

  it("needs the words next to each other and in order", () => {
    expect(containsTerm("trả tiền rồi tính phí sau", "trả phí")).toBe(false);
    expect(containsTerm("phí trả", "trả phí")).toBe(false);
  });

  it("matches whole words only", () => {
    expect(containsTerm("Excellence", "Excel")).toBe(false);
    expect(containsTerm("file Excel tự làm", "excel")).toBe(true);
  });

  it("finds a term at the start and at the end of the text", () => {
    expect(containsTerm("đám cưới bạn thân", "đám cưới")).toBe(true);
    expect(containsTerm("tuần có đám cưới", "đám cưới")).toBe(true);
  });

  it("never matches an empty term or a term longer than the text", () => {
    expect(containsTerm("bất kỳ câu nào", "")).toBe(false);
    expect(containsTerm("bất kỳ câu nào", "?!")).toBe(false);
    expect(containsTerm("trả", "trả phí hằng tháng")).toBe(false);
  });
});
