# Store 38517 BPW Daily Sheet

## Current State
New project. No existing application files beyond scaffolding.

## Requested Changes (Diff)

### Add
- Full BPW Daily Sheet app for Store 38517, cloned from Store 22523 v39
- All features identical to 22523 except store ID, branding, and passwords

### Modify
- N/A (new project)

### Remove
- N/A (new project)

## Implementation Plan

### Store Identity
- Store ID: 38517
- App branding: "38517 BPW"
- Report filename: store_closing_report_38517_YYYY-MM-DD.csv
- Branch Name in CSV: 38517 BPW, Branch Code: 38517

### Passwords
- Reset Day: 385171
- Admin Reset & Admin Edit: 9924827787

### Backend (Motoko)
- Store daily sheet data per date key
- Store product names (editable, persisted)
- Store delivery/transfer entries (up to 3 per product per day)
- Store physical/pos count entries (1 per product per day)
- Store additional entries
- Store day closed status
- Store day report/finalize status
- Store CSV template (uploaded by user)
- Carry-forward logic: next day Opening = Total BA, Open Counter = Total Counter
- All CRUD operations for daily entries

### Frontend
- Header (2 rows, sticky):
  - Row 1: Logo "38517 BPW", date picker, Delivery (blue), Transfer (purple), Physical (green), POS Count (sky blue) buttons
  - Row 2: Print, Download Report, Run Report, Default Qty Set, Close Day / Admin Edit, More dropdown (Reset Day, Admin Reset)
  - Sync dot: yellow=saving, green=live
- 13-column sheet: Product Name (editable pencil), Opening, Delivery, Transfer, Total BA, Open Counter, Physical, Additional, Total Counter, Store Closing, POS Count, Variance
- Columns locked for direct edit: Delivery, Transfer, Physical, POS Count
- 22 products (editable)
- Entry windows (popup dialogs):
  - Delivery: 3 cells + total, negative reason prompt
  - Transfer: 3 cells + total, negative reason prompt
  - Physical: 1 cell per product
  - POS Count: 1 cell per product
- Admin features (password protected):
  - Reset Day (385171): clears Physical, Additional, POS Count
  - Admin Reset (9924827787): zeros all columns for open day
  - Admin Edit (9924827787): unlocks closed day
- Run Report popup: Categories, Variance, Status (Excess/Short/Tally); Finalize closes day
- Default Qty Set: restore Opening from prev day Total BA, Open Counter from prev day Total Counter
- CSV Report: 19-column template, QUANTITY from Store Closing, Mango Smoothie excluded
- CSV Template Upload in sidebar
- Calendar slicer in sidebar (overlay)
- Data sync: direct-to-canister, 5s polling, instant refresh on focus/open, auto-retry x5
- Sheet always loads immediately (never blocked)
- PWA: installable, branded 38517 BPW
- Print/PDF: A4 landscape with logo
- Mobile friendly: compact header, always-visible Save/Cancel in entry windows
- Version label: v1 (Store 38517 initial build)
