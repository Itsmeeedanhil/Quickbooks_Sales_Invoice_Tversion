# Custom-QBSI (Tauri + React Edition)

A complete recreation of **Custom-QBSI** built with **Tauri v2 (Rust)** and **React 18 + TypeScript + Vite**.

## Included Clients & Form Layouts

All 6 client configurations from the original C# WinForms application are unified into a single desktop app with a client selector in the top bar:

1. **Enclosure** (*Enclosure Systems Specialists, Inc.*)
   - **Form**: Sales Invoice (`850 × 1100` custom print sheet)
   - **Features**: Series Number counter (`000001` format with `-` / `+` and auto-increment after print), BIR Permit No. & Date Issued persistence, 3-column Signatory (`Prepared By`, `Approved By`, `Received By`), EWT 1%, EWT 2%, Manual EWT Amount override, VAT Inclusive / Exclusive calculation, 12-row bordered items table + 5-row VAT summary, Amount in Words (`Pesos and Centavos Only`), and `---REPRINT---` toggle.
2. **FP** (*FP Philippines, Inc.*)
   - **Form**: Sales Invoice (`Poppins` font, `#00ade6` header, `NO. INV. <Series>`)
   - **Features**: Underlined customer fields, `For the Kind Attention` (`CustomFieldATTENTION`) & `PO #`, Series Number counter, BIR Permit No. & Date Issued, EWT 1%, VAT Inclusive / Exclusive, 3-column Signatory, and Reprint marker.
3. **PBS** (*Plan B Solutions Inc.*)
   - **Form**: Sales Invoice (`logo-plan-b.jpg`)
   - **Features**: Underlined customer fields, Series Number counter, BIR Permit No. & Date Issued, EWT 1%, VAT Inclusive / Exclusive, and 3-column Signatory.
4. **NHC** (*Nature's Harvest Corp.*)
   - **Forms**: Sales Invoice & Delivery Receipt
   - **Features**: Year-filtered QuickBooks Data Sync (`2025`–`2020`), pre-printed form coordinate layout with optional preview template overlay (`NATURE SI.jpg` / `NATURE DR.jpg`), Delivery Receipt override fields persisted per Reference Number in `HistoryDRDetails`, and interactive Edit Mode for Delivery Receipt line items (`Price` & `Expiration Date`).
5. **MET** (*MET*)
   - **Forms**: Sales Invoice & Delivery Receipt
   - **Features**: Year-filtered QuickBooks Data Sync (`2025`–`2020`), pre-printed form coordinate layout with optional preview template overlay (`MET Invoice.jpg`), SKU & Expiration Date toggle, EWT 1%, and Cashier Signatory persistence.
6. **IVP** (*QuickBooks Collection Receipt*)
   - **Form**: Collection Receipt
   - **Features**: QuickBooks Permission Reset (`QBSessionManager` reauthorization), pre-printed Collection Receipt coordinate layout (`Collection_Receipt_page-0001.jpg`), Authorize Signature persistence, and `-90°` rotated receipt printer mode.

## Database & QuickBooks Integration

- **Dual Storage Engine**:
  - Connects to the existing `CustomQBSIDatabase.accdb` via `Microsoft.ACE.OLEDB.12.0` and mirrors all tables into a fast local SQLite database (`qbsi_local.sqlite`).
  - Falls back to `qbsi_local.sqlite` automatically if MS Access OLEDB is unavailable.
- **QuickBooks Desktop Support**:
  - **Sync Data**: Connects to `DSN=QuickBooks Data;` via ODBC (with optional Year filter for `NHC` and `MET`) and refreshes local database tables.
  - **Permission Reset**: Uses `Interop.QBFC16Lib.dll` (`QBSessionManager`) to trigger QuickBooks Integrated Application reauthorization.

## Commands

```powershell
# Install frontend dependencies
npm install

# Run in Tauri desktop development mode
npm run tauri dev

# Build production Windows installer / executable
npm run tauri build
```
