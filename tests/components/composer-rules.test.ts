import { describe, expect, it } from "vitest";
import { canSend, enterSends } from "@/components/interview/composer";
import { MAX_CANVAS_CHARS, MAX_QUESTION_CHARS } from "@/config/limits";
import { canvasInputSchema, endInputSchema } from "@/server/canvas";
import { turnInputSchema } from "@/server/turns";

const key = (overrides: Partial<{ key: string; shiftKey: boolean; isComposing: boolean }> = {}) => ({
  key: "Enter",
  shiftKey: false,
  isComposing: false,
  ...overrides,
});

describe("the Enter key in the question box", () => {
  it("sends on desktop", () => {
    expect(enterSends(key(), false)).toBe(true);
  });

  it("breaks the line with Shift on desktop", () => {
    expect(enterSends(key({ shiftKey: true }), false)).toBe(false);
  });

  it("never sends on mobile, where the send button does", () => {
    expect(enterSends(key(), true)).toBe(false);
    expect(enterSends(key({ shiftKey: true }), true)).toBe(false);
  });

  it("does not send while a Vietnamese input method is still composing the word", () => {
    expect(enterSends(key({ isComposing: true }), false)).toBe(false);
  });

  it("ignores every other key", () => {
    for (const other of ["a", " ", "Tab", "Escape"]) expect(enterSends(key({ key: other }), false)).toBe(false);
  });
});

describe("an empty question cannot be sent", () => {
  it.each([[""], [" "], ["\n\n"], ["\t  \n"]])("refuses %j", (text) => {
    expect(canSend(text)).toBe(false);
  });

  it.each([["Chị ơi?"], ["  a  "], ["\nb"]])("allows %j", (text) => {
    expect(canSend(text)).toBe(true);
  });
});

describe("length limits the server checks itself", () => {
  const turn = (text: string) => turnInputSchema.safeParse({ text, turnKey: "0b0f6c1e-2f55-4f0a-9d0c-6f1d0f8d2a10", expectedIndex: 1 }).success;

  it("holds a question to 500 characters", () => {
    expect(MAX_QUESTION_CHARS).toBe(500);
    expect(turn("a".repeat(500))).toBe(true);
    expect(turn("a".repeat(501))).toBe(false);
    expect(turn("   ")).toBe(false);
  });

  it("holds the notes to 5,000 characters in the autosave and in the end request", () => {
    expect(MAX_CANVAS_CHARS).toBe(5000);
    expect(canvasInputSchema.safeParse({ text: "a".repeat(5000) }).success).toBe(true);
    expect(canvasInputSchema.safeParse({ text: "a".repeat(5001) }).success).toBe(false);
    expect(endInputSchema.safeParse({ canvasText: "a".repeat(5000) }).success).toBe(true);
    expect(endInputSchema.safeParse({ canvasText: "a".repeat(5001) }).success).toBe(false);
  });

  it("allows empty notes, and does not trim what was typed", () => {
    expect(canvasInputSchema.parse({ text: "" })).toEqual({ text: "" });
    expect(endInputSchema.parse({ canvasText: "  có khoảng trắng  \n" })).toEqual({ canvasText: "  có khoảng trắng  \n" });
  });

  it("refuses notes that are not text", () => {
    expect(canvasInputSchema.safeParse({ text: "a\u0000b" }).success).toBe(false);
    for (const bad of [null, 5, ["a"], undefined]) {
      expect(canvasInputSchema.safeParse({ text: bad }).success).toBe(false);
      expect(endInputSchema.safeParse({ canvasText: bad }).success).toBe(false);
    }
  });
});
