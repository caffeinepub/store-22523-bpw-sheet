# Store 22523 BPW Sheet — Version 21 Fix

## Current State
- Version 20 deployed with Delivery/Transfer columns locked (entries via windows only)
- Database backup (download) and restore (upload) in sidebar panel
- All data stored on ICP blockchain canister
- App loads sheet data from canister on every date change

## Requested Changes (Diff)

### Add
- Nothing new

### Modify
- **Fix backup download**: The `downloadBackup` function in `backendStorage.ts` casts actor to `backendWithBackup` unnecessarily — `exportAllData` is already declared in `backend.d.ts` on `backendInterface`. The BigInt replacer in JSON.stringify works but the restore path needs to properly convert numeric values back to BigInt for `productIndex` and `cellIndex` fields in `NegativeEntry`.
- **Fix restore**: When restoring a JSON backup, `productIndex` and `cellIndex` in `NegativeEntry` are stored as numbers in JSON but the canister expects `bigint`. The `convert` function in `restoreBackup` does not convert them to BigInt. This causes the restore call to fail silently or throw.
- **Fix slow loading / buffering**: The sheet load `useEffect` in `BPWSheet.tsx` calls `loadProductNamesFromBackend` AND `loadAllSheetsFromBackend` on every date change. This is 3 separate canister round-trips per date change. Optimize by: (1) only loading product names once (already done in the product names effect), passing them to getOrCreateSheet instead of re-fetching; (2) caching the list of all sheet dates in a ref after first fetch so `loadAllSheetsFromBackend` is not called every time a date is selected — only dates list needs refreshing, not all sheet data.

### Remove
- Redundant `backendWithBackup` interface in `backendStorage.ts` (use `backendInterface` directly which already has those methods)

## Implementation Plan
1. In `backendStorage.ts`: remove `backendWithBackup` interface, use `backendInterface` directly in `downloadBackup` and `restoreBackup`. Fix the restore `convert` function to correctly convert `productIndex` and `cellIndex` to `BigInt`.
2. In `BPWSheet.tsx`: fix the sheet load `useEffect` to NOT re-call `loadProductNamesFromBackend` — use the already-loaded `productNames` state. Also add a `refreshDatesFromBackend` helper that only fetches dates+locked status, not full sheet data. Reduce canister calls on date change from 3 down to 1-2.
