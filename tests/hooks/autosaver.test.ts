import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaver, type AutosaveState, type SaveOutcome } from "@/hooks/use-autosave";

const DELAY = 800;
const RETRY = 3000;

/** A save whose answer the test gives when it chooses, so text can be typed while it is on its way. */
function controlledSave() {
  const sent: string[] = [];
  const answers: ((outcome: SaveOutcome | Error) => void)[] = [];
  const save = (text: string) => {
    sent.push(text);
    return new Promise<SaveOutcome>((resolve, reject) => {
      answers.push((outcome) => (outcome instanceof Error ? reject(outcome) : resolve(outcome)));
    });
  };
  /** Answers the oldest save still waiting, and lets the autosaver react. */
  const answer = async (outcome: SaveOutcome | Error) => {
    answers.shift()!(outcome);
    await vi.advanceTimersByTimeAsync(0);
  };
  return { save, sent, answer };
}

function setup(initial = "") {
  const { save, sent, answer } = controlledSave();
  const states: AutosaveState[] = [];
  const autosaver = createAutosaver({ initial, save, onState: (state) => states.push(state), delayMs: DELAY, retryMs: RETRY });
  return { autosaver, sent, answer, states };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createAutosaver: saving after a pause", () => {
  it("saves once, 800 ms after the last keystroke, with the newest text", async () => {
    const { autosaver, sent } = setup();

    autosaver.change("k");
    await vi.advanceTimersByTimeAsync(500);
    autosaver.change("kế");
    await vi.advanceTimersByTimeAsync(500);
    autosaver.change("kế toán");
    expect(sent).toEqual([]);

    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual(["kế toán"]);
  });

  it("reports the saved text and no failure", async () => {
    const { autosaver, answer, states } = setup();
    autosaver.change("ghi chú");
    await vi.advanceTimersByTimeAsync(DELAY);
    await answer("saved");
    expect(states).toEqual([{ saved: "ghi chú", failures: 0 }]);
  });

  it("does not save a text the server already has", async () => {
    const { autosaver, sent } = setup("đã lưu");
    autosaver.change("đã lưu thêm");
    autosaver.change("đã lưu");
    await vi.advanceTimersByTimeAsync(DELAY * 3);
    expect(sent).toEqual([]);
  });

  it("saves an emptied canvas", async () => {
    const { autosaver, sent } = setup("có chữ");
    autosaver.change("");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(sent).toEqual([""]);
  });

  it("does nothing until the text changes", async () => {
    const { sent } = setup("đã lưu");
    await vi.advanceTimersByTimeAsync(DELAY * 5);
    expect(sent).toEqual([]);
  });
});

describe("createAutosaver: typing while a save is on its way", () => {
  it("runs one save at a time and follows up with the text typed meanwhile", async () => {
    const { autosaver, sent, answer, states } = setup();
    autosaver.change("một");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(sent).toEqual(["một"]);

    autosaver.change("một hai");
    autosaver.change("một hai ba");
    await vi.advanceTimersByTimeAsync(DELAY * 3);
    expect(sent).toEqual(["một"]);

    await answer("saved");
    expect(states.at(-1)).toEqual({ saved: "một", failures: 0 });
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(sent).toEqual(["một", "một hai ba"]);

    await answer("saved");
    expect(states.at(-1)).toEqual({ saved: "một hai ba", failures: 0 });
    await vi.advanceTimersByTimeAsync(DELAY * 3);
    expect(sent).toHaveLength(2);
  });

  it("does not save again when the text came back to what was just saved", async () => {
    const { autosaver, sent, answer } = setup();
    autosaver.change("một");
    await vi.advanceTimersByTimeAsync(DELAY);
    autosaver.change("một hai");
    autosaver.change("một");
    await answer("saved");
    await vi.advanceTimersByTimeAsync(DELAY * 3);
    expect(sent).toEqual(["một"]);
  });
});

describe("createAutosaver: failed saves", () => {
  it("tries again after 3 s and counts failures in a row", async () => {
    const { autosaver, sent, answer, states } = setup();
    autosaver.change("ghi chú");
    await vi.advanceTimersByTimeAsync(DELAY);

    await answer("retry");
    expect(states.at(-1)).toEqual({ saved: "", failures: 1 });
    await vi.advanceTimersByTimeAsync(RETRY - 1);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual(["ghi chú", "ghi chú"]);

    await answer("retry");
    expect(states.at(-1)).toEqual({ saved: "", failures: 2 });
  });

  it("treats a save that throws as a failed save", async () => {
    const { autosaver, sent, answer, states } = setup();
    autosaver.change("ghi chú");
    await vi.advanceTimersByTimeAsync(DELAY);
    await answer(new Error("network down"));
    expect(states.at(-1)).toEqual({ saved: "", failures: 1 });
    await vi.advanceTimersByTimeAsync(RETRY);
    expect(sent).toHaveLength(2);
  });

  it("goes back to no failures as soon as one save succeeds", async () => {
    const { autosaver, answer, states } = setup();
    autosaver.change("ghi chú");
    await vi.advanceTimersByTimeAsync(DELAY);
    await answer("retry");
    await vi.advanceTimersByTimeAsync(RETRY);
    await answer("retry");
    await vi.advanceTimersByTimeAsync(RETRY);
    await answer("saved");
    expect(states.map((state) => state.failures)).toEqual([1, 2, 0]);
    expect(states.at(-1)?.saved).toBe("ghi chú");
  });

  it("retries with the newest text, and sooner when the learner keeps typing", async () => {
    const { autosaver, sent, answer } = setup();
    autosaver.change("bản một");
    await vi.advanceTimersByTimeAsync(DELAY);
    await answer("retry");

    autosaver.change("bản hai");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(sent).toEqual(["bản một", "bản hai"]);
  });

  it("stops for good when the server says nothing will be saved again", async () => {
    const { autosaver, sent, answer, states } = setup();
    autosaver.change("ghi chú");
    await vi.advanceTimersByTimeAsync(DELAY);
    await answer("stop");

    autosaver.change("gõ tiếp sau khi đóng băng");
    await vi.advanceTimersByTimeAsync(DELAY + RETRY);
    expect(sent).toEqual(["ghi chú"]);
    expect(states).toEqual([]);
  });
});

describe("createAutosaver: flush and stop", () => {
  it("flush saves at once instead of waiting for the pause", async () => {
    const { autosaver, sent } = setup();
    autosaver.change("đóng tab ngay");
    autosaver.flush();
    expect(sent).toEqual(["đóng tab ngay"]);
    // The pending timer was used up: no second save of the same text.
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(sent).toHaveLength(1);
  });

  it("flush during a save sends the newer text at once, and only once", async () => {
    const { autosaver, sent } = setup();
    autosaver.change("một");
    await vi.advanceTimersByTimeAsync(DELAY);
    autosaver.change("một hai");

    autosaver.flush();
    expect(sent).toEqual(["một", "một hai"]);
  });

  it("flush during a save of the same text sends nothing more", async () => {
    const { autosaver, sent } = setup();
    autosaver.change("một");
    await vi.advanceTimersByTimeAsync(DELAY);
    autosaver.flush();
    expect(sent).toEqual(["một"]);
  });

  it("flush with nothing new sends nothing", () => {
    const { autosaver, sent } = setup("đã lưu");
    autosaver.flush();
    expect(sent).toEqual([]);
  });

  it("stop cancels the pending save", async () => {
    const { autosaver, sent } = setup();
    autosaver.change("sắp kết thúc buổi");
    autosaver.stop();
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    autosaver.flush();
    expect(sent).toEqual([]);
  });

  it("stop during a save reports nothing afterwards and sends nothing more", async () => {
    const { autosaver, sent, answer, states } = setup();
    autosaver.change("một");
    await vi.advanceTimersByTimeAsync(DELAY);
    autosaver.change("một hai");
    autosaver.stop();
    await answer("saved");
    await vi.advanceTimersByTimeAsync(DELAY + RETRY);
    expect(sent).toEqual(["một"]);
    expect(states).toEqual([]);
  });
});
