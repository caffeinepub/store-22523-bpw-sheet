# Store 22523 BPW Sheet

## Current State
The app stores all data (daily sheets, product names) in an ICP backend canister. The frontend has a Sidebar with calendar and historical entries. There is no mechanism to export or import the full database.

## Requested Changes (Diff)

### Add
- Backend: `exportAllData()` query that returns all sheets + product names as a single serializable object.
- Backend: `importAllData(data)` update that overwrites all sheets and product names from an import payload.
- Frontend: "Database Backup" section at the bottom of the Sidebar with two buttons:
  - **Download Backup** — exports all data as a JSON file (timestamped filename like `bpw-backup-2026-04-04.json`).
  - **Restore Backup** — file picker accepting `.json` only; after selecting, shows a confirmation dialog (with admin password 9924827787) before overwriting backend data.
- Mobile: ensure sidebar is accessible on mobile (collapsible drawer/panel) so the backup/restore buttons are reachable on small screens.

### Modify
- Sidebar: add the new Database Backup card below the Historical Entries section.
- BPWSheet: if sidebar is already collapsible on mobile, wire backup/restore there too.

### Remove
- Nothing removed.

## Implementation Plan
1. Add `exportAllData` and `importAllData` to `src/backend/main.mo`.
2. Regenerate / manually update `src/frontend/src/backend.d.ts` to expose the new functions.
3. Add `downloadBackup` and `restoreBackup` helper functions in `src/frontend/src/lib/backendStorage.ts`.
4. Update `Sidebar.tsx` to include Database Backup card with Download and Restore buttons.
5. Add admin-password confirmation dialog before restore.
6. Ensure mobile layout has access to sidebar via a menu/drawer button in the sticky header.
