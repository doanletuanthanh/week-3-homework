/** One field that differs between two versions: absent on one side when it was added or removed. */
export type FieldChange = { path: string; before?: string; after?: string };

/** Every leaf of a JSON value by its path (`items[2].content`), as JSON text. */
function leaves(value: unknown, path: string, into: Map<string, string>): Map<string, string> {
  if (Array.isArray(value) && value.length > 0) {
    value.forEach((entry, index) => leaves(entry, `${path}[${index}]`, into));
  } else if (value !== null && typeof value === "object" && Object.keys(value).length > 0) {
    for (const [key, entry] of Object.entries(value)) leaves(entry, path === "" ? key : `${path}.${key}`, into);
  } else {
    into.set(path, JSON.stringify(value));
  }
  return into;
}

/**
 * The fields that changed from one scenario version to the next, in the order of the newer one
 * (removed fields last). `version` is left out: it always changes.
 */
export function diffScenario(before: unknown, after: unknown): FieldChange[] {
  const old = leaves(before, "", new Map());
  const now = leaves(after, "", new Map());
  old.delete("version");
  now.delete("version");
  const changes: FieldChange[] = [];
  for (const [path, value] of now) {
    const was = old.get(path);
    if (was === undefined) changes.push({ path, after: value });
    else if (was !== value) changes.push({ path, before: was, after: value });
  }
  for (const [path, value] of old) if (!now.has(path)) changes.push({ path, before: value });
  return changes;
}
