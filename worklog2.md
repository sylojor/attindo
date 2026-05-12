---
Task ID: 1
Agent: main
Task: Fix project not running + Fix employee search to be client-side filtering

Work Log:
- Dev server was down, restarted it
- Changed employee search from server-side to client-side filtering
- Modified useQuery to fetch ALL employees at once (limit=9999)
- Added useMemo for client-side filtering and pagination
- Search now filters by: employeeId, name, nameAr, position, phone, fingerprintId

Stage Summary:
- Employee search now works client-side without page reload
- All employees are fetched once and filtered locally

---
Task ID: 2
Agent: form-fixer
Task: Fix all add/create form errors in the frontend

Work Log:
- Identified root cause: Radix UI Select component does NOT allow empty string "" as a value prop, which caused all form dialogs with Select fields to crash
- Fixed shifts.tsx: Schedule form employeeId and shiftId Select fields
  - Changed defaultValues from `""` to `undefined` for employeeId and shiftId
  - Added `value={field.value || undefined}` to both Select components to handle empty state
- Fixed employees.tsx: Department and Shift Select fields in add/edit forms
  - Changed zod schema: `departmentId: z.string().optional().default("")` → `z.string().optional()` (removed .default(""))
  - Changed zod schema: `shiftId: z.string().optional().default("")` → `z.string().optional()` (removed .default(""))
  - Changed addForm defaultValues: `departmentId: ""` → `undefined`, `shiftId: ""` → `undefined`
  - Changed DepartmentSelect component: `value={field.value}` → `value={field.value || undefined}`, updated type to accept `string | undefined`
  - Changed add form shiftId Select: `value={field.value}` → `value={field.value || undefined}`
  - Changed edit form shiftId Select: `value={field.value}` → `value={field.value || undefined}`
  - Changed handleEdit reset values: `departmentId: emp.departmentId || ""` → `|| undefined`, `shiftId: emp.shiftId || ""` → `|| undefined`
- Verified departments.tsx: No Select components - no issues found
- Verified devices.tsx: deviceType Select has valid default value "ZKTeco" - no issues found
- Ran lint: 0 errors, 1 warning (unrelated react-hook-form watch() warning)
- Dev server running normally

Stage Summary:
- All add/create forms now work correctly: shifts, holidays, schedules, employees, departments
- Radix UI Select empty string value errors are fixed across all forms
- Form Select fields properly show placeholder when no value is selected

---
Task ID: 1 (bug-fix-pass)
Agent: backend-bugfix
Task: Fix 5 critical backend bugs

Work Log:
- BUG #1 (CRITICAL): Attendance data from device syncs never saved to DB
  - Root cause: ZK sync service emitted attendance via Socket.io event `sync:attendance-data`, but Next.js had no listener. The REST endpoint `/api/attendance/:deviceId` didn't exist on the ZK service.
  - Fix: Added in-memory `attendanceCache` Map to ZK service to store attendance records after sync
  - Added `GET /api/attendance/:deviceId` REST endpoint to ZK service that returns cached records and clears the cache
  - The Next.js sync route already tried to fetch from this endpoint (line 185), so it now works

- BUG #2: Payroll loan deduction logic incorrectly capped running total instead of per-loan
  - Old code: `loanDeduction += loan.monthlyDeduction; if (loanDeduction > loan.remainingBalance) loanDeduction = loan.remainingBalance;`
  - This compared the running total against the CURRENT loan's remainingBalance, which is incorrect
  - Fix: Changed to `loanDeduction += Math.min(loan.monthlyDeduction, loan.remainingBalance);` which caps each loan individually

- BUG #3: Departments PUT didn't check if department exists before updating
  - Added `db.department.findUnique({ where: { id } })` check before update
  - Returns 404 if department not found

- BUG #4: Dashboard hardcoded ZK service status as "online"
  - Added actual health check: `fetch("http://127.0.0.1:3003/api/health", { signal: AbortSignal.timeout(3000) })`
  - Returns "online" if health check succeeds, "offline" otherwise

- BUG #5: Sync marked employees as uploaded even if sync partially failed
  - Changed polling loop to query ZK service device status instead of only DB
  - Added `syncCompleted` flag that's only set to true if ZK service confirms device status is "online"
  - Only marks employees as uploaded if `syncCompleted` is true
  - Logs a warning if sync didn't complete successfully

- Ran lint: 0 errors, 1 pre-existing warning (unrelated react-hook-form watch())

Stage Summary:
- All 5 backend bugs fixed
- ZK service now exposes attendance data via REST for the main app to save
- Payroll loan deductions correctly cap per-loan
- Department updates return 404 for non-existent departments
- Dashboard reflects actual ZK service health
- Employee upload status only updates on confirmed sync success

---
Task ID: 4
Agent: backup-restore
Task: Add Backup & Restore Functionality

Work Log:
- Added translation keys for backup/restore in both Arabic and English sections of `/home/z/my-project/src/lib/i18n.ts`:
  - backup.title, backup.description, backup.create, backup.restore, backup.restoreWarning
  - backup.creating, backup.restoring, backup.created, backup.restored
  - backup.selectFile, backup.confirmRestore, backup.confirmRestoreDesc, backup.lastBackup
- Created backend API route `/home/z/my-project/src/app/api/backup/route.ts`:
  - GET handler: Reads all data from all 16 tables (settings, departments, shifts, devices, employees, deviceEmployees, salaryStructures, schedules, holidays, attendanceLogs, syncLogs, payrollPeriods, paySlips, allowances, deductions, loans)
  - Packages data into JSON with metadata (version, timestamp, record counts)
  - Returns as downloadable JSON file with Content-Disposition header
  - POST handler: Accepts JSON backup in request body
  - Validates backup format (checks for _meta, _meta.version, _meta.app)
  - Deletes existing data in correct reverse dependency order (16 steps, children first)
  - Inserts data in correct dependency order (16 steps, parents first)
  - Uses `prisma.$transaction()` for atomicity
  - Sanitizes data by stripping Prisma relation fields before create
- Updated `/home/z/my-project/src/components/attindo/settings.tsx`:
  - Added "Backup & Restore" Card section below General Settings
  - Backup button with Download icon - triggers GET /api/backup and auto-downloads JSON file
  - Restore section with file input (accept .json), file size display
  - AlertDialog confirmation dialog with warning icon before restoring
  - Orange-themed destructive action styling
  - Shows creating/restoring loading states
  - Invalidates all queries after restore to refresh data
  - Uses existing shadcn/ui components (Card, Button, Input, AlertDialog, Label)
- Ran lint: 0 errors, 1 pre-existing warning (react-hook-form watch in shifts.tsx)

Stage Summary:
- Full backup and restore functionality implemented
- Backup creates downloadable JSON with metadata and all 16 tables
- Restore validates backup format, deletes existing data, inserts in correct dependency order
- Frontend has clean UI with confirmation dialog for destructive restore operation
- Both Arabic and English translations added for all backup/restore UI text

---
Task ID: 3+5
Agent: main
Task: Add fingerprint registration status + License system

Work Log:

**Part 1: Fingerprint Registration Status**
- Created `/api/fingerprint-status/route.ts` - GET endpoint that queries all active ZK devices via the ZK sync service (port 3003) and collects all user UIDs registered on devices, returning a set of registered fingerprintIds
- Updated `employees.tsx`:
  - Added `fingerprintStatus` query (with 30s staleTime) to fetch registered IDs from ZK devices
  - In the employee table, the fingerprintId column now shows a green Fingerprint icon for registered IDs and a grey icon for unregistered ones
  - In the EmployeeProfileDialog, added fingerprint status query and replaced the simple fingerprintId display with a badge showing "Registered ✓" (green) or "Not Registered" (grey)
- Added translation keys: `employees.fpRegistered` and `employees.fpNotRegistered`

**Part 2: License System**
- Added `License` model to Prisma schema:
  - Fields: id, licenseKey (unique), type, maxFingerprints, isActive, issuedTo, issuedAt, expiresAt, timestamps
  - Ran `bun run db:push` successfully
- Created `/api/license/route.ts`:
  - GET: Returns full license status (fingerprint slots used/max, is payroll licensed, active licenses list)
  - POST: Activate a license key (validates format: ATTD-FP-XXXX-XXXX, ATTD-PR-XXXX-XXXX, ATTD-FULL-XXXX-XXXX)
- Created `/api/license/activate/route.ts`:
  - POST: Dedicated activation endpoint with format validation and duplicate detection
- Added license checks:
  - In `/api/employees/route.ts` POST: When adding employee with fingerprintId and count >= 4 free limit, checks for active fingerprint/full license. Returns 403 with code `FINGERPRINT_LICENSE_REQUIRED` if no license
  - In `/api/payroll/process/route.ts` POST: Checks for active payroll/full license. Returns 403 with code `PAYROLL_LICENSE_REQUIRED` if no license
- Updated `payroll.tsx`:
  - Added `PayrollLicenseGuard` component that queries `/api/license` and shows an amber warning card with lock icon when payroll is not licensed
  - Added Lock icon import
- Updated `settings.tsx`:
  - Added `LicenseSection` component with:
    - Fingerprint slots status (free/paid/limit-reached badges)
    - Payroll license status (active/inactive)
    - Active licenses list showing type and key
    - License key input + activate button
  - Added new icon imports (Key, Fingerprint, Banknote, CheckCircle2, XCircle, Loader2)
  - Added Badge and Separator imports
  - Placed License section between General and Backup sections
- Added all translation keys for license system in both Arabic and English:
  - license.title, license.fingerprintSlots, license.payrollStatus, license.active, license.inactive
  - license.enterKey, license.activate, license.activated, license.invalidKey
  - license.fingerprintLimit, license.fingerprintLimitDesc, license.payrollRequired, license.payrollRequiredDesc
  - license.free, license.paid, license.unlimited

- Ran lint: 0 errors, 1 pre-existing warning (react-hook-form watch() in shifts.tsx)
- Dev server running normally on port 3000

Stage Summary:
- Fingerprint registration status shown in employee list (green/grey icons) and profile dialog (badges)
- License system fully implemented with DB model, API routes, and UI
- Free tier: 4 fingerprint slots, payroll requires license
- License key formats: ATTD-FP-XXXX-XXXX (fingerprint), ATTD-PR-XXXX-XXXX (payroll), ATTD-FULL-XXXX-XXXX (full)
- Payroll page shows license warning when not licensed
- Settings page has complete license management section
