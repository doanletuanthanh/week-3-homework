/**
 * Runs `run` on every item, at most `concurrency` at a time, taking items in order, and returns
 * the results in the order of `items` whatever order they finish in. A rejection rejects the
 * whole run, as `Promise.all` does; a caller that must go on after a failure catches inside `run`.
 * Calls queued together are what lets a batch transport put them in one job.
 */
export async function mapPooled<T, R>(items: readonly T[], concurrency: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  return results;
}
