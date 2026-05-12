# Attindo Work Log

---
Task ID: 1
Agent: Main
Task: Fix currency not reflecting when changed in settings

Work Log:
- Added `currency` field to `AppState` interface in app-store.ts
- Added `setCurrency` action to Zustand store
- Added `useCurrency()` and `useFormatCurrency()` hooks in payroll.tsx
- Updated `SalaryGrossPreview`, `LoansTab`, and `PayrollView` to use `useCurrency()` hook
- Replaced all `formatCurrency(amount)` calls with `formatCurrency(amount, currency)` throughout payroll.tsx
- Updated settings.tsx to sync currency to global store on save and on data load
- Added settings initialization in layout.tsx to load currency/lang from server on mount
- Exported CURRENCIES constant from settings.tsx for reuse in reports

Stage Summary:
- Currency is now reactive across the app - changing it in settings updates all payroll displays
- Store currency is initialized from server settings on app mount

---
Task ID: 2
Agent: Main
Task: Build Reports module with attendance details, salary info, and export

Work Log:
- Created `/api/reports/route.ts` - comprehensive report API with:
  - Filter by departmentId or employeeId
  - Date range (dateFrom, dateTo)
  - Per-employee attendance calculation (working days, present, absent, late, overtime, worked hours)
  - Daily detail with check-in/out times, late minutes, overtime hours
  - Salary breakdown with all deductions, allowances, loan deductions, net salary
- Created `src/components/attindo/reports.tsx` - Reports frontend with:
  - Filter by department or employee
  - Date range picker
  - Department summary table
  - Employee detail cards with summary grid (present/late/absent/overtime)
  - Salary breakdown section
  - Expandable daily attendance details table
  - Export to Excel (using xlsx library)
  - Export to PDF (using jspdf + jspdf-autotable)
- Added Reports tab to layout.tsx navigation
- Added i18n translations (Arabic + English) for all report strings
- Installed xlsx, jspdf, jspdf-autotable packages

Stage Summary:
- Full Reports module with attendance details, salary breakdown, and export functionality
- Bilingual (Arabic/English) support throughout
- Department-level and employee-level filtering
- PDF and Excel export capabilities

---
Task ID: 3
Agent: Main
Task: Fix device addition bug and currency auto-save

Work Log:
- Identified root cause: ZK sync service returns `capabilities` as an array (e.g., `["fingerprint"]`) but Prisma schema expects a comma-separated String. This caused Prisma errors during device sync that corrupted device state.
- Fixed capabilities array→string conversion in `/api/sync/route.ts` (line 207-210)
- Fixed capabilities array→string conversion in `/api/devices/[id]/route.ts` for both `test-connection` (line 106-109) and `detect-capabilities` (line 156-159) actions
- Cleaned up orphaned device (cmp1gv8ij000tknl26wwdiero) from ZK service
- Fixed currency auto-save: changed settings.tsx to immediately save currency and language changes on Select change, instead of requiring a separate Save button click. This ensures the store and backend stay in sync.
- Also added auto-save for language changes
- Tested device creation and sync - no more Prisma errors

Stage Summary:
- Device addition now works correctly - capabilities are properly converted from array to string
- Currency changes are now auto-saved immediately on selection (no need to click Save button)
- Language changes are also auto-saved immediately
- ZK sync service orphaned device cleaned up

---
Task ID: 4
Agent: Main
Task: Add Holidays, Reports filters, and Employee profile search

Work Log:
- Added Holiday model to Prisma schema (date, name, nameAr, isRecurring)
- Created /api/holidays routes (GET, POST) and /api/holidays/[id] (PUT, DELETE)
- Fixed DateTime comparison issues in Prisma queries (used findMany + JS filter instead of findFirst with date range)
- Added Holidays tab to shifts.tsx with add/delete UI, bilingual labels
- Updated reports API with two new report types:
  - absent-on-date: Shows all absent/off employees for a specific date
  - working-by-shift: Shows all employees working a shift on a specific date
- Fixed server crash issues by simplifying Prisma queries (using select instead of include, separate attendance log queries)
- Added Reports UI for new filter types (absent on date, working by shift)
- Added Employee profile dialog with full info (salary, loans, attendance, overtime)
- Added search by fingerprint ID and employee ID in employee search
- Created /api/employees/[id]/profile route for comprehensive employee data
- Added bilingual translations for all new features

Stage Summary:
- Holidays: Can add/delete specific date holidays with recurring option
- Reports: Can filter by absent-on-date and working-by-shift with date/shift selectors
- Employee Profile: Click employee to see full profile with salary, loans, attendance summary
- Search: Enhanced to search by name, employee ID, or fingerprint ID
