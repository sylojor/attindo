import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const BACKUP_VERSION = "2.0.0";

// GET /api/backup — Create a backup of the entire database as JSON
export async function GET() {
  try {
    const [
      settings,
      departments,
      shifts,
      devices,
      employees,
      deviceEmployees,
      salaryStructures,
      schedules,
      holidays,
      attendanceLogs,
      syncLogs,
      payrollPeriods,
      paySlips,
      allowances,
      deductions,
      loans,
    ] = await Promise.all([
      db.settings.findMany(),
      db.department.findMany(),
      db.shift.findMany(),
      db.device.findMany(),
      db.employee.findMany(),
      db.deviceEmployee.findMany(),
      db.salaryStructure.findMany(),
      db.schedule.findMany(),
      db.holiday.findMany(),
      db.attendanceLog.findMany(),
      db.syncLog.findMany(),
      db.payrollPeriod.findMany(),
      db.paySlip.findMany(),
      db.allowance.findMany(),
      db.deduction.findMany(),
      db.loan.findMany(),
    ]);

    const recordCounts: Record<string, number> = {
      settings: settings.length,
      departments: departments.length,
      shifts: shifts.length,
      devices: devices.length,
      employees: employees.length,
      deviceEmployees: deviceEmployees.length,
      salaryStructures: salaryStructures.length,
      schedules: schedules.length,
      holidays: holidays.length,
      attendanceLogs: attendanceLogs.length,
      syncLogs: syncLogs.length,
      payrollPeriods: payrollPeriods.length,
      paySlips: paySlips.length,
      allowances: allowances.length,
      deductions: deductions.length,
      loans: loans.length,
    };

    const backup = {
      _meta: {
        version: BACKUP_VERSION,
        timestamp: new Date().toISOString(),
        app: "Attindo HR/Payroll/Attendance",
        recordCounts,
      },
      data: {
        settings,
        departments,
        shifts,
        devices,
        employees,
        deviceEmployees,
        salaryStructures,
        schedules,
        holidays,
        attendanceLogs,
        syncLogs,
        payrollPeriods,
        paySlips,
        allowances,
        deductions,
        loans,
      },
    };

    const filename = `attindo-backup-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Backup creation failed:", error);
    return NextResponse.json(
      { error: "Failed to create backup" },
      { status: 500 }
    );
  }
}

// POST /api/backup — Restore from a backup file
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate backup format
    if (!body._meta || !body._meta.version || !body.data) {
      return NextResponse.json(
        { error: "Invalid backup file format" },
        { status: 400 }
      );
    }

    if (!body._meta.app || !body._meta.app.includes("Attindo")) {
      return NextResponse.json(
        { error: "Invalid backup file: not an Attindo backup" },
        { status: 400 }
      );
    }

    const data = body.data;

    // Use a transaction for atomicity
    await db.$transaction(async (tx) => {
      // Delete existing data in reverse dependency order (children first)
      // 1. PaySlips (depends on Employees, PayrollPeriods)
      await tx.paySlip.deleteMany();
      // 2. Allowances (depends on Employees)
      await tx.allowance.deleteMany();
      // 3. Deductions (depends on Employees)
      await tx.deduction.deleteMany();
      // 4. Loans (depends on Employees)
      await tx.loan.deleteMany();
      // 5. PayrollPeriods
      await tx.payrollPeriod.deleteMany();
      // 6. AttendanceLogs (depends on Employees, Devices)
      await tx.attendanceLog.deleteMany();
      // 7. SyncLogs (depends on Devices)
      await tx.syncLog.deleteMany();
      // 8. Schedules (depends on Employees, Shifts)
      await tx.schedule.deleteMany();
      // 9. SalaryStructures (depends on Employees)
      await tx.salaryStructure.deleteMany();
      // 10. DeviceEmployees (depends on Devices, Employees)
      await tx.deviceEmployee.deleteMany();
      // 11. Employees (depends on Departments, Shifts)
      await tx.employee.deleteMany();
      // 12. Devices
      await tx.device.deleteMany();
      // 13. Shifts
      await tx.shift.deleteMany();
      // 14. Departments
      await tx.department.deleteMany();
      // 15. Holidays
      await tx.holiday.deleteMany();
      // 16. Settings
      await tx.settings.deleteMany();

      // Insert data in dependency order (parents first)
      // 1. Settings
      if (data.settings?.length) {
        for (const item of data.settings) {
          await tx.settings.create({ data: sanitize(item) });
        }
      }

      // 2. Departments
      if (data.departments?.length) {
        for (const item of data.departments) {
          await tx.department.create({ data: sanitize(item) });
        }
      }

      // 3. Shifts
      if (data.shifts?.length) {
        for (const item of data.shifts) {
          await tx.shift.create({ data: sanitize(item) });
        }
      }

      // 4. Devices
      if (data.devices?.length) {
        for (const item of data.devices) {
          await tx.device.create({ data: sanitize(item) });
        }
      }

      // 5. Employees (depends on Departments, Shifts)
      if (data.employees?.length) {
        for (const item of data.employees) {
          await tx.employee.create({ data: sanitize(item) });
        }
      }

      // 6. DeviceEmployees (depends on Devices, Employees)
      if (data.deviceEmployees?.length) {
        for (const item of data.deviceEmployees) {
          await tx.deviceEmployee.create({ data: sanitize(item) });
        }
      }

      // 7. SalaryStructures (depends on Employees)
      if (data.salaryStructures?.length) {
        for (const item of data.salaryStructures) {
          await tx.salaryStructure.create({ data: sanitize(item) });
        }
      }

      // 8. Schedules (depends on Employees, Shifts)
      if (data.schedules?.length) {
        for (const item of data.schedules) {
          await tx.schedule.create({ data: sanitize(item) });
        }
      }

      // 9. Holidays
      if (data.holidays?.length) {
        for (const item of data.holidays) {
          await tx.holiday.create({ data: sanitize(item) });
        }
      }

      // 10. AttendanceLogs (depends on Employees, Devices)
      if (data.attendanceLogs?.length) {
        for (const item of data.attendanceLogs) {
          await tx.attendanceLog.create({ data: sanitize(item) });
        }
      }

      // 11. SyncLogs (depends on Devices)
      if (data.syncLogs?.length) {
        for (const item of data.syncLogs) {
          await tx.syncLog.create({ data: sanitize(item) });
        }
      }

      // 12. PayrollPeriods
      if (data.payrollPeriods?.length) {
        for (const item of data.payrollPeriods) {
          await tx.payrollPeriod.create({ data: sanitize(item) });
        }
      }

      // 13. PaySlips (depends on Employees, PayrollPeriods)
      if (data.paySlips?.length) {
        for (const item of data.paySlips) {
          await tx.paySlip.create({ data: sanitize(item) });
        }
      }

      // 14. Allowances (depends on Employees)
      if (data.allowances?.length) {
        for (const item of data.allowances) {
          await tx.allowance.create({ data: sanitize(item) });
        }
      }

      // 15. Deductions (depends on Employees)
      if (data.deductions?.length) {
        for (const item of data.deductions) {
          await tx.deduction.create({ data: sanitize(item) });
        }
      }

      // 16. Loans (depends on Employees)
      if (data.loans?.length) {
        for (const item of data.loans) {
          await tx.loan.create({ data: sanitize(item) });
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: "Backup restored successfully",
      recordCounts: body._meta.recordCounts,
    });
  } catch (error) {
    console.error("Backup restore failed:", error);
    return NextResponse.json(
      { error: "Failed to restore backup: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}

// Sanitize data by removing relation fields that Prisma doesn't expect on create
function sanitize(item: any): any {
  if (!item || typeof item !== "object") return item;

  // List of known relation field names to strip from all models
  const relationFields = [
    "department", "shift", "employee", "device", "payrollPeriod",
    "employees", "attendanceLogs", "schedules", "deviceAssignments",
    "salaryStructure", "paySlips", "allowances", "deductions", "loans",
    "syncLogs", "deviceEmployees",
  ];

  const result = { ...item };
  for (const field of relationFields) {
    delete result[field];
  }
  return result;
}
