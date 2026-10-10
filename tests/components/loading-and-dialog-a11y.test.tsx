import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dialog } from "@/components/ui/dialog";
import { PrepSkeleton, SessionListSkeleton, SessionSkeleton } from "@/components/ui/page-skeletons";

const SKELETONS: [name: string, element: ReactElement, label: string][] = [
  ["Buổi của tôi", <SessionListSkeleton key="list" />, "Đang tải Buổi của tôi"],
  ["the prep screen", <PrepSkeleton key="prep" />, "Đang tải màn chuẩn bị"],
  ["a session", <SessionSkeleton key="session" />, "Đang tải buổi luyện"],
];

describe("the loading state of a page", () => {
  it.each(SKELETONS)("%s: says what is loading in an element with the status role", (_name, element, label) => {
    const markup = renderToStaticMarkup(element);

    expect(markup.match(/role="status"/gu)).toHaveLength(1);
    expect(markup).toContain(`<p class="sr" role="status">${label}</p>`);
  });

  it.each(SKELETONS)("%s: the status line comes first, nothing marks it busy, and the blocks are hidden", (_name, element) => {
    const markup = renderToStaticMarkup(element);

    expect(markup).toMatch(/^<(?:div|main)[^>]*><p class="sr" role="status">/u);
    // A busy region holds its announcements back until it is no longer busy, and a fallback never is.
    expect(markup).not.toContain("aria-busy");
    const blocks = markup.match(/<span class="skel[^>]*>/gu) ?? [];
    expect(blocks.length).toBeGreaterThan(2);
    expect(blocks.every((block) => block.includes('aria-hidden="true"'))).toBe(true);
  });

  it.each(SKELETONS)("%s: keeps no label on an element that has no role to carry it", (_name, element) => {
    expect(renderToStaticMarkup(element)).not.toContain("aria-label=");
  });

  it("a session and the prep screen stay inside the main landmark", () => {
    expect(renderToStaticMarkup(<PrepSkeleton />)).toMatch(/^<main /u);
    expect(renderToStaticMarkup(<SessionSkeleton />)).toMatch(/^<main /u);
  });
});

describe("Dialog", () => {
  const render = (describedBy?: string) =>
    renderToStaticMarkup(
      <Dialog open={false} onClose={() => {}} labelledBy="title" describedBy={describedBy} role="alertdialog">
        <h2 id="title">Xóa?</h2>
        <p id="consequence">Không khôi phục được.</p>
      </Dialog>,
    );

  it("ties the sentence that says what its action does to the dialog", () => {
    expect(render("consequence")).toMatch(/^<dialog class="dlg" role="alertdialog" aria-labelledby="title" aria-describedby="consequence">/u);
  });

  it("has no description when it is given none", () => {
    expect(render()).not.toContain("aria-describedby");
  });
});
