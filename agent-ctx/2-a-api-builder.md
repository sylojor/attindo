# Task 2-a: Build All New/Updated API Routes

## Summary
Built all new and updated API routes for the Attindo HR/Payroll project, including Settings, Departments, Loans APIs, and updated Employees, Payroll Process, and Seed APIs. Also fixed department string→relation migration across 15 existing API routes.

## Files Created
- `/src/app/api/settings/route.ts` - Settings singleton CRUD (GET, PUT)
- `/src/app/api/departments/route.ts` - Departments list/create (GET, POST)
- `/src/app/api/departments/[id]/route.ts` - Department update/delete (PUT, DELETE)
- `/src/app/api/payroll/loans/route.ts` - Loans list/create (GET, POST)
- `/src/app/api/payroll/loans/[id]/route.ts` - Loan update/delete (PUT, DELETE)

## Files Updated
- `/src/app/api/employees/route.ts` - department string → departmentId relation
- `/src/app/api/employees/[id]/route.ts` - departmentId relation + department in response
- `/src/app/api/payroll/process/route.ts` - Enhanced attendance calc + loan deductions
- `/src/app/api/seed/route.ts` - Creates departments, settings, loans

## Files Fixed (department relation compatibility)
- `/src/app/api/dashboard/route.ts`
- `/src/app/api/attendance/route.ts`
- `/src/app/api/devices/[id]/route.ts`
- `/src/app/api/shifts/[id]/route.ts`
- `/src/app/api/schedules/route.ts`
- `/src/app/api/payroll/salary-structures/route.ts`
- `/src/app/api/payroll/salary-structures/[employeeId]/route.ts`
- `/src/app/api/payroll/summary/route.ts`
- `/src/app/api/payroll/payslips/route.ts`
- `/src/app/api/payroll/payslips/[id]/route.ts`
- `/src/app/api/payroll/allowances/route.ts`
- `/src/app/api/payroll/allowances/[id]/route.ts`
- `/src/app/api/payroll/deductions/route.ts`
- `/src/app/api/payroll/deductions/[id]/route.ts`
- `/src/app/api/payroll/periods/[id]/route.ts`

## Key Implementation Details
- Settings uses singleton pattern with id="default", auto-creates on first GET
- Departments include employee count via Prisma _count
- Department deletion blocked if employees assigned
- Loans set remainingBalance = amount on creation
- Payroll Process uses Schedule data for working day calculation
- Payroll deducts loan monthlyDeduction and updates remainingBalance
- Loans auto-marked "completed" when remainingBalance reaches 0
- All department: true in select clauses updated to proper Prisma relation syntax
