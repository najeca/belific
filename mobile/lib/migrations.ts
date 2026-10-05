// Pure, storage-agnostic backfill logic for migrateToSyncableSchema
// (storage.ts). Deliberately has zero AsyncStorage/React Native
// dependency so it can be unit-tested directly with plain arrays. No test
// file exists for it yet; tests run with `node --test` (Node 26+ runs .ts
// natively, no test runner needed).

// Backfills `updatedAt` from `createdAt` (falling back to a shared
// migration timestamp when neither exists) — used for types that
// already had a real createdAt before this migration (BrainDumpItem,
// Routine, Task). Never touches a row that already has updatedAt.
export function backfillUpdatedAt<T extends { updatedAt?: string; createdAt?: string }>(
  items: T[],
  migrationTimestamp: string,
): T[] {
  return items.map((item) =>
    item.updatedAt ? item : { ...item, updatedAt: item.createdAt ?? migrationTimestamp },
  );
}

// Same, but for types with no createdAt to fall back to at all
// (CustomEvent never had one; Project/CustomCategory had no timestamps
// whatsoever) — both createdAt and updatedAt get the same shared
// migration timestamp. Never touches a row that already has updatedAt.
export function backfillCreatedAndUpdatedAt<T extends { updatedAt?: string; createdAt?: string }>(
  items: T[],
  migrationTimestamp: string,
): T[] {
  return items.map((item) =>
    item.updatedAt ? item : { ...item, createdAt: migrationTimestamp, updatedAt: migrationTimestamp },
  );
}
