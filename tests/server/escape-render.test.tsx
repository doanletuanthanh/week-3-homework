import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FailedEvalScreen } from "@/components/custom/failed-eval-screen";
import { TranscriptList } from "@/components/interview/transcript-list";
import { NotesReview } from "@/components/reveal/notes-review";
import { SessionRow } from "@/components/sessions/session-row";
import { TranscriptTurn } from "@/components/transcript-turn";
import { WithdrawnScreen } from "@/components/withdrawn-screen";

/** What a learner could type hoping the page runs it: a script, and an image whose error handler is one. */
const SCRIPT = "<script>window.__xss = 1</script>";
const IMAGE = '<img src=x onerror="window.__xss = 1">';
const HOSTILE = `${SCRIPT}${IMAGE}`;
const ESCAPED = "&lt;script&gt;window.__xss = 1&lt;/script&gt;&lt;img src=x onerror=&quot;window.__xss = 1&quot;&gt;";

/** The text is on the page as text, whole, and brought no element with it. */
function expectEscaped(markup: string, times = 1): void {
  expect(markup.split(ESCAPED)).toHaveLength(times + 1);
  expect(markup).not.toMatch(/<script|<img|onerror="/iu);
}

const PERSONA = { displayName: "chị Thu", displayNameCapitalized: "Chị Thu" };

describe("learner text with HTML in it is rendered as text", () => {
  it("a question in the interview: sent, and still waiting for its answer", () => {
    const markup = renderToStaticMarkup(
      <TranscriptList
        personaName="Chị Thu"
        turns={[
          { index: 0, learnerText: null, personaText: "Chào em." },
          { index: 1, learnerText: HOSTILE, personaText: "Chị chưa hiểu ý em." },
        ]}
        pending={{ index: 2, text: HOSTILE, reply: "" }}
      />,
    );
    expectEscaped(markup, 2);
  });

  it("a question in a transcript that is read back, with its leading words underlined", () => {
    const underlined = (
      <>
        {HOSTILE.slice(0, 8)}
        <span className="uline">{HOSTILE.slice(8, 20)}</span>
        {HOSTILE.slice(20)}
      </>
    );
    const plain = renderToStaticMarkup(<TranscriptTurn index={1} personaName="Chị Thu" learnerText={HOSTILE} personaText="Ừ em." />);
    const marked = renderToStaticMarkup(<TranscriptTurn index={1} personaName="Chị Thu" learnerText={underlined} personaText="Ừ em." leading />);

    expectEscaped(plain);
    // Cut in three by the underline: no cut puts a tag back together.
    expect(marked).not.toMatch(/<script|<img|onerror="/iu);
    expect(marked).toContain('<span class="uline">');
    expect(marked.replace(/<span class="uline">|<\/span>/gu, "")).toContain(ESCAPED);
  });

  it("a question in the transcript of a session whose persona was pulled", () => {
    const markup = renderToStaticMarkup(
      <WithdrawnScreen
        personaName="Chị Thu"
        topicTitle="Thói quen ghi chép chi tiêu"
        date="09/10"
        turnCount={1}
        turns={[
          { index: 0, learnerText: null, personaText: "Chào em." },
          { index: 1, learnerText: HOSTILE, personaText: "Chị chưa hiểu ý em." },
        ]}
      />,
    );
    expectEscaped(markup);
  });

  it("the notes on the result: a plain line and a marked stretch", () => {
    const markup = renderToStaticMarkup(
      <NotesReview
        ungraded={false}
        persona={PERSONA}
        notes={[
          { text: HOSTILE, match: null },
          { text: HOSTILE, match: { kind: "never_said", turn: null, itemContent: null, openedInReplay: false } },
        ]}
      />,
    );
    expectEscaped(markup, 2);
  });

  it("the notes when they could not be judged", () => {
    expectEscaped(renderToStaticMarkup(<NotesReview ungraded persona={PERSONA} notes={[{ text: HOSTILE, match: null }]} />));
  });

  it("a custom topic as the name of its row in 'Buổi của tôi'", () => {
    const markup = renderToStaticMarkup(
      <SessionRow item={{ id: "0b0e6c0e-1111-4222-8333-444455556666", personaName: HOSTILE, displayName: null, avatarKey: null, topicTitle: HOSTILE, date: "09/10", state: "preparing", result: null }} />,
    );
    expectEscaped(markup, 2);
  });

  it("a custom topic on the screen of a scenario that did not pass", () => {
    const markup = renderToStaticMarkup(
      <FailedEvalScreen sessionId="0b0e6c0e-1111-4222-8333-444455556666" topicText={HOSTILE} failureCode="invalid" block={null} freeLeft={1} attemptsLeftToday={2} />,
    );
    expectEscaped(markup);
  });
});

describe("no component writes markup from a string", () => {
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.tsx?$/u.test(entry.name) ? [path] : [];
    });

  it("nothing under src/ uses dangerouslySetInnerHTML, innerHTML or document.write", () => {
    const offenders = sourceFiles("src").filter((path) => /dangerouslySetInnerHTML|\.(?:inner|outer)HTML\b|insertAdjacentHTML|document\.write/u.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});
