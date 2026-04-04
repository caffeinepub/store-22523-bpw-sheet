# Store 22523 BPW Sheet

## Current State
The app uses an offline-first architecture:
- `offlineStorage.ts` — IndexedDB layer with `bpw_offline_v1` database storing sheets, product names, and a `pendingWrites` sync queue
- `backendStorage.ts` — Orchestration layer: all reads return IndexedDB cache immediately, canister is updated asynchronously in background; all writes go to IndexedDB first, then attempt canister, and on failure enqueue to the pending-writes queue
- `BPWSheet.tsx` — Imports `cacheSheet` and `hasPendingWrites` from `offlineStorage`; has a `flushPendingWrites` effect that runs on mount and on `online` events; all save operations check pending-write queue and show a `"queued"` sync status

## Requested Changes (Diff)

### Add
- Immediate error feedback on the specific save operation that fails (cell shows saving indicator; on failure shows inline error)
- Simplified sync status: only `"syncing"` (in-flight), `"live"` (success), `"offline"` (error)

### Modify
- `backendStorage.ts` — Completely rewrite all async functions to call `actor.*()` directly, with no IndexedDB reads or writes. Keep type-conversion helpers (`toBackendSheet`, `convertBackendSheet`, etc.) unchanged. All functions are now direct await calls that throw on failure.
- `BPWSheet.tsx` — Remove all `offlineStorage` imports, remove `flushPendingWrites` useEffect, remove all `hasPendingWrites()` calls, remove all `else { cacheSheet() }` fallbacks, remove `"queued"` sync state, simplify sync status to three states.

### Remove
- `offlineStorage.ts` — Entire IndexedDB layer deleted
- `pendingWrites` sync queue logic throughout `BPWSheet.tsx` and `backendStorage.ts`
- `flushPendingWrites` function and its `useEffect` in `BPWSheet.tsx`

## Implementation Plan
1. Delete `src/frontend/src/lib/offlineStorage.ts`
2. Rewrite `src/frontend/src/lib/backendStorage.ts`:
   - Keep all type-conversion helpers
   - `saveSheetToBackend(actor, sheet)` → `await actor.saveSheet(toBackendSheet(sheet))`
   - `loadSheetFromBackend(actor, date)` → `await actor.loadSheet(date)` + convert
   - `loadAllSheetsFromBackend(actor)` → `await actor.loadAllSheets()` + convert
   - `saveProductNamesToBackend(actor, names)` → `await actor.saveProductNames(names)`
   - `loadProductNamesFromBackend(actor)` → `await actor.loadProductNames()` + convert
   - `getOrCreateSheetFromBackend(actor, date, names)` → canister-only: load sheet, if not found create from previous locked sheet, save to canister
   - `getMostRecentLockedSheetFromBackend(actor, date)` → load all from canister, filter
   - Remove `flushPendingWrites`, `syncFromCanister` (no longer needed)
3. Edit `BPWSheet.tsx`:
   - Remove `import { cacheSheet, hasPendingWrites } from "../lib/offlineStorage"`
   - Remove `flushPendingWrites` from backendStorage imports
   - Remove the `flushPendingWrites` useEffect block
   - Remove all `hasPendingWrites()` calls
   - Remove all `else { await cacheSheet(updated) }` fallbacks on all save handlers
   - Remove `"queued"` from `SyncStatus` type
   - Update sync status indicator: yellow = syncing, green = live, red = offline/error
   - On save failure: set `syncStatus = "offline"` and show a brief toast/alert so staff know to retry
