# Store 22523 BPW Daily Sheet

## Current State
All data (daily sheets, product names, locked status, delivery/transfer entries, finalized reports, negative entry reasons) is stored in browser localStorage. This means data is device-specific -- changes on one device are never visible on another. The app is a PWA used on multiple devices by multiple staff members.

Key localStorage keys:
- `bpw_sheets`: Array of DailySheet objects (full sheet data per date)
- `bpw_product_names`: Array of 22 product name strings
- `pwa-banner-dismissed`: UI-only flag (can stay in localStorage)

The data model in use (sheetStorage.ts):
- `DailySheet`: date, rows[], locked, finalizedReport?, negativeReasons?, negativeEntries?
- `ProductRow`: productName, opening, delivery, deliveryCells[3], transfer, transferCells[3], openCounter, physical, additional, posCount
- `FinalizedReportRow`: label, variance, status
- `NegativeEntry`: type, productIdx, cellIdx, qty, reason

## Requested Changes (Diff)

### Add
- Backend Motoko canister with stable storage for all BPW sheet data
- Backend API functions to CRUD sheets, product names, and all related data
- Frontend backend API integration layer replacing localStorage calls
- Loading states while data is being fetched from the canister

### Modify
- `sheetStorage.ts`: Replace localStorage read/write functions with backend canister calls
- `BPWSheet.tsx`: All save/load operations switch from localStorage to backend API calls
- Data is now shared: any device opening the app reads the same canister state

### Remove
- `localStorage.getItem/setItem` calls for sheet and product data (keep only `pwa-banner-dismissed`)

## Implementation Plan

### Backend (Motoko)
Create a new main.mo with stable storage for:
1. `stableSheets`: stable HashMap<Text, DailySheet> keyed by date string (YYYY-MM-DD)
2. `stableProductNames`: stable Array<Text> of 22 product names

Data types matching frontend exactly:
- `ProductRow`: productName, opening, delivery, deliveryCells([3] of Float), transfer, transferCells([3] of Float), openCounter, physical, additional, posCount
- `FinalizedReportRow`: label, variance, status
- `NegativeEntry`: type ("delivery"/"transfer"), productIdx, cellIdx, qty, reason
- `DailySheet`: date, rows, locked, finalizedReport (optional), negativeReasons (as [(Text,Text)]), negativeEntries (optional)

API functions:
- `saveSheet(sheet: DailySheet): async ()` -- upsert a sheet
- `loadSheet(date: Text): async ?DailySheet` -- get sheet by date
- `loadAllSheets(): async [DailySheet]` -- get all sheets
- `saveProductNames(names: [Text]): async ()` -- save product name list
- `loadProductNames(): async [Text]` -- get product names

### Frontend
- Create `src/frontend/src/lib/backendStorage.ts` -- async wrappers matching the current sync sheetStorage API, but calling the backend canister
- Update `BPWSheet.tsx` to:
  - Use async functions for all data access (useEffect with await, or loading states)
  - Show a loading spinner while data loads from canister on mount
  - All save operations call backend
- Product name changes persist to backend immediately
- Keep `pwa-banner-dismissed` in localStorage (UI-only, per-device preference is fine)
