function validTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/** Preserve a durable browser save when shared sync failed after the edit. */
export function localStateIsNewer(localUpdatedAt: string | null, sharedUpdatedAt: string | null) {
  const localTimestamp = validTimestamp(localUpdatedAt);
  const sharedTimestamp = validTimestamp(sharedUpdatedAt);
  if (localTimestamp === null) return false;
  if (sharedTimestamp === null) return true;
  return localTimestamp > sharedTimestamp;
}
