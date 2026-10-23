import { describe, expect, it } from "vitest";
import { mapPooled } from "@/eval/pool";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapPooled", () => {
  it("returns results in the order of the items, whatever order they finish in", async () => {
    const delays = [30, 5, 20, 1, 10];
    const results = await mapPooled(delays, 3, async (ms) => {
      await wait(ms);
      return ms * 2;
    });
    expect(results).toEqual([60, 10, 40, 2, 20]);
  });

  it("never runs more than the given number at once, and starts the items in order", async () => {
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    await mapPooled([1, 2, 3, 4, 5, 6, 7], 2, async (item) => {
      started.push(item);
      running += 1;
      peak = Math.max(peak, running);
      await wait(5);
      running -= 1;
    });
    expect(peak).toBe(2);
    expect(started).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("runs one at a time at concurrency 1, and returns nothing for no items", async () => {
    const order: string[] = [];
    await mapPooled(["a", "b"], 1, async (item) => {
      order.push(`start ${item}`);
      await wait(1);
      order.push(`end ${item}`);
    });
    expect(order).toEqual(["start a", "end a", "start b", "end b"]);
    expect(await mapPooled([], 4, async () => 1)).toEqual([]);
  });

  it("rejects when one item fails", async () => {
    await expect(
      mapPooled([1, 2, 3], 2, async (item) => {
        if (item === 2) throw new Error("item 2 failed");
        return item;
      }),
    ).rejects.toThrow("item 2 failed");
  });
});
