# Store 22523 BPW Sheet

## Current State
The app has a Database Backup / Restore section in BPWSheet.tsx sidebar panel including a Download Backup button, Restore Backup file input, confirmation dialog with admin password, and related state/imports.

## Requested Changes (Diff)

### Add
- Nothing

### Modify
- BPWSheet.tsx: Remove all backup/restore UI, state variables, and imports

### Remove
- Database Backup card JSX block (lines ~1073-1140)
- Restore Backup Confirmation Dialog JSX block (lines ~2440-2565)
- State variables: backupLoading, restoreDialogOpen, restoreFile, restorePassword, restoreLoading
- Imports: downloadBackup, restoreBackup

## Implementation Plan
1. Remove downloadBackup and restoreBackup imports
2. Remove 5 backup/restore state variable declarations
3. Remove Database Backup Card JSX from sidebar panel
4. Remove Restore Backup Confirmation Dialog JSX near bottom of component
5. Validate
