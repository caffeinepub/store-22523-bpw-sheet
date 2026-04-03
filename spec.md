# Store 22523 BPW Sheet

## Current State
The app is a fully functional inventory daily sheet with:
- 13-column layout: Product Name, Opening, Delivery, Transfer, Total BA, Open Counter, Physical, Additional, Total Counter, Store Closing, POS Count, Variance
- Manual entry directly in SheetTable cells for Delivery, Transfer, Physical, Additional, POS Count
- Sticky header with Calendar, Run Report, Default Qty Set, Admin Edit, Reset Day, Admin Reset, Close Day buttons
- Sheet locking (day close), Admin Edit unlock, Reset Day, Admin Reset dialogs
- Run Report pop-up with category-based variance/status and finalized report below sheet
- Product name inline editing, calendar slicer overlay

## Requested Changes (Diff)

### Add
- **Delivery Window button**: A small clickable button/icon in the Delivery column header (or near it) that opens a dedicated modal for entering delivery quantities. The modal lists all product names with a number input next to each. The modal pre-fills with current delivery values so existing entries are visible. Saving the modal writes all values back to the sheet. The modal is disabled (view-only or not openable) when the day is locked; it can be re-opened via Admin Edit.
- **Transfer Window button**: Same pattern as Delivery Window but for the Transfer column.
- Both windows should clearly show the product name and a qty input field for each product.
- Both windows should have a Save button to commit entries and a Cancel button to discard changes.
- When re-opened on the same day, the entered values must be visible and editable.
- When the day is locked, the window is read-only (open but inputs disabled) OR the button is disabled.
- Admin Edit unlocking the day re-enables the windows.

### Modify
- `SheetTable.tsx`: Add a small "open window" icon button in the Delivery and Transfer column headers to trigger the respective modal.
- `BPWSheet.tsx`: Add state and handlers for Delivery Window and Transfer Window modals; wire them to save entries back to the sheet rows.

### Remove
- Nothing removed.

## Implementation Plan
1. In `BPWSheet.tsx`:
   - Add `showDeliveryWindow` and `showTransferWindow` state booleans.
   - Add draft state arrays for delivery and transfer qty values (pre-filled from current sheet rows).
   - Add handlers: `openDeliveryWindow`, `openTransferWindow`, `saveDeliveryWindow`, `saveTransferWindow`.
   - Render two new Dialog components: Delivery Entry Window and Transfer Entry Window.
   - Each dialog lists all product names with a number input per row.
   - On Save: update all delivery (or transfer) values in `sheet.rows`, persist to localStorage.
   - On Cancel: discard draft changes.
   - If day is locked: show dialog in read-only mode (inputs disabled, Save button hidden, just a Close button).
2. In `SheetTable.tsx`:
   - Add `onOpenDeliveryWindow` and `onOpenTransferWindow` optional callback props.
   - Add a small icon button (e.g., `ExternalLink` or `LayoutList` icon) in the Delivery and Transfer column headers that calls the respective callback.
   - Button is hidden or disabled if `locked` is true (matching the sheet's locked state).
