# Store 22523 BPW Sheet

## Current State
v36/v37 app with direct-to-canister saving, 5s polling. The sync indicator had 4 states: syncing (yellow), live (green), error (red - Save Error), load-error (orange - Offline). Any transient load failure set 'Offline' permanently until page reload. Save failures showed alarming 'Save Error' red dot and toast.error messages. guardedSave had no retry logic.

## Requested Changes (Diff)

### Add
- Auto-retry logic in guardedSave: up to 5 attempts with 2s delay between each before throwing
- On load failure: keep dot yellow (Connecting...) instead of turning red/orange, rely on 5s poll to recover

### Modify
- syncStatus type: remove 'load-error' state entirely (merged into 'syncing')
- Status dot: 'error' state now shows yellow pulsing 'Retrying...' instead of red 'Save Error'
- All setSyncStatus('error') → setSyncStatus('syncing') in catch blocks
- All alarming toast.error for save failures → gentle toast.warning (retrying automatically)
- Version label: v36 → v38

### Remove
- 'Offline' text from header
- 'Save Error' text from header
- Red/orange dot states

## Implementation Plan
1. Fix syncStatus type union (remove load-error)
2. Replace guardedSave with retry-capable version (5 retries, 2s delay)
3. All catch blocks: setSyncStatus syncing instead of error
4. Soften toast messages to warning instead of error
5. Status indicator: yellow = connecting/retrying, green = live, never shows red
6. Version bump to v38
