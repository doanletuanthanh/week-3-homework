const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids from URLs and cookies are checked before they reach a uuid column, which would reject the cast. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
