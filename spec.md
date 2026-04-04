# Store 22523 BPW Sheet

## Current State
Data is saved directly to the ICP canister (update calls). Reading is done via ICP `query` calls which are fast but non-certified — they hit a single replica node that may lag behind the latest committed state. The polling interval is 15 seconds. There is no refresh triggered when the user returns to the app on their device.

## Requested Changes (Diff)

### Add
- `visibilitychange` event listener: when the user returns to the tab/app (document becomes visible), immediately re-fetch the sheet and product names from the canister so the phone always shows fresh data the moment staff open the app
- `focus` event listener on window for the same reason

### Modify
- Reduce poll interval from 15 seconds to 5 seconds so cross-device updates appear faster
- After any successful save, trigger an immediate re-fetch (to confirm data round-trips correctly and update the local state with the canonical canister version)

### Remove
- Nothing removed

## Implementation Plan
1. In `BPWSheet.tsx`, reduce `POLL_INTERVAL` from `15_000` to `5_000`
2. Add a `useEffect` that listens to `document.addEventListener('visibilitychange', ...)` and `window.addEventListener('focus', ...)` — when triggered and `document.visibilityState === 'visible'`, call `loadSheetFromBackend` and update state immediately
3. After each successful `guardedSave`, re-fetch the sheet and update state to confirm the canister round-trip
