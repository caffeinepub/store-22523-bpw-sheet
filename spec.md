# Store 22523 BPW Sheet

## Current State
The app uses the ICP blockchain canister as its sole data store. Every read/write goes directly to the canister via the actor. If the canister is unreachable (network offline, canister busy, cold-start latency), the sheet cannot save, and the user sees a "server down" / toast error. There is no local persistence layer between the UI and the canister.

## Requested Changes (Diff)

### Add
- **IndexedDB offline cache** (`offlineStorage.ts`): stores sheets and product names locally in the browser's IndexedDB so the app works fully offline.
- **Pending-writes queue** in IndexedDB: every save that fails or is done offline is queued. When connectivity returns, queued writes are flushed to the canister automatically.
- **Sync status indicator** (already partially present): Yellow dot = syncing/offline write queued; Green dot = live and confirmed synced; Red dot = offline (working from local cache). Text next to dot shows status.
- **Auto-retry background sync**: on regaining connectivity (`online` event), pending writes are flushed automatically.
- **Graceful degradation**: reads first check IndexedDB cache; if canister fails, the cached version is used seamlessly without any error shown to user.

### Modify
- `backendStorage.ts`: wrap all `saveSheet` / `saveProductNames` calls to write to IndexedDB first (optimistic), then attempt canister write; if canister write fails, enqueue the save for later retry.
- `backendStorage.ts`: wrap all `loadSheet` / `loadAllSheets` / `loadProductNames` calls to return from IndexedDB cache immediately, then update from canister in the background.
- `BPWSheet.tsx`: update sync status display to reflect offline-first states (offline, queued, live). Remove any blocking error states.

### Remove
- The toast error "Could not reach server. Using local defaults." — replace with silent fallback to cache + status indicator update.

## Implementation Plan
1. Create `src/frontend/src/lib/offlineStorage.ts` — IndexedDB wrapper using idb-like pattern (native IndexedDB API) for:
   - `getSheet(date)` / `setSheet(sheet)`
   - `getAllSheets()` / `setAllSheets(sheets[])`  
   - `getProductNames()` / `setProductNames(names[])`
   - `getPendingWrites()` / `addPendingWrite(op)` / `removePendingWrite(id)`
2. Update `backendStorage.ts`:
   - `saveSheetToBackend`: write to IndexedDB immediately, then try canister; on failure queue the operation
   - `loadSheetFromBackend`: return IndexedDB cache immediately; refresh from canister in background
   - `loadAllSheetsFromBackend`: same pattern
   - `loadProductNamesFromBackend`: same pattern
   - `saveProductNamesToBackend`: same pattern
   - Add `flushPendingWrites(actor)`: attempt to push all pending writes to canister
3. Update `BPWSheet.tsx`:
   - On mount and `online` event, call `flushPendingWrites`
   - Update sync dot: yellow=queued pending writes or syncing, green=live+no pending, red=canister unreachable (but still working offline)
   - Remove the blocking error toast for server failures
