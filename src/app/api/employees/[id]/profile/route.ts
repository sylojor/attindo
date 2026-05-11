import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/employees/[id]/profile - Comprehensive employee profile
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch employee with all relations
    const employee = await db.employee.findUnique({
      where: { id },
      include: {
        department: true,
        shift: true,
        salaryStructure: true,
        schedules: {
          include: { shift: true },
          orderBy: { effectiveDate: "desc" },
          take: 5,
        },
        loans: {
          where: { status: "active" },
          orderBy: { issueDate: "desc" },
        },
        allowances: {
          where: {
            isRecurring: true,
            OR: [
              { endDate: null },
              { endDate: { gte: new Date() } },
            ],
          },
        },
        deductions: {
          where: {
            isRecurring: true,
            OR: [
              { endDate: null },
              { endDate: { gte: new Date() } },
            ],
          },
        },
      },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Fetch last 30 days attendance logs
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const attendanceLogs = await db.attendanceLog.findMany({
      where: {
        employeeId: id,
        timestamp: { gte: thirtyDaysAgo },
      },
      include: {
        device: {
          select: { id: true, name: true },
        },
      },
      orderBy: { timestamp: "desc" },
    });

    // Calculate attendance summary
    const attendanceSummary = calculateAttendanceSummary(
      attendanceLogs,
      employee.shift
    );

    // Recent 10 attendance records
    const recentAttendance = attendanceLogs.slice(0, 10).map((log) => ({
      id: log.id,
      timestamp: log.timestamp,
      verifyMode: log.verifyMode,
      ioMode: log.ioMode,
      status: log.status,
      device: log.device,
    }));

    // Salary info
    const salaryInfo = employee.salaryStructure
      ? {
          basicSalary: employee.salaryStructure.basicSalary,
          housingAllowance: employee.salaryStructure.housingAllowance,
          transportAllowance: employee.salaryStructure.transportAllowance,
          foodAllowance: employee.salaryStructure.foodAllowance,
          otherAllowances: employee.salaryStructure.otherAllowances,
          grossSalary:
            employee.salaryStructure.basicSalary +
            employee.salaryStructure.housingAllowance +
            employee.salaryStructure.transportAllowance +
            employee.salaryStructure.foodAllowance +
            employee.salaryStructure.otherAllowances,
          overtimeRate: employee.salaryStructure.overtimeRate,
          deductionPerLate: employee.salaryStructure.deductionPerLate,
          deductionPerAbsent: employee.salaryStructure.deductionPerAbsent,
          currency: employee.salaryStructure.currency,
          effectiveDate: employee.salaryStructure.effectiveDate,
        }
      : null;

    // Active loans
    const activeLoans = employee.loans.map((loan) => ({
      id: loan.id,
      type: loan.type,
      amount: loan.amount,
      monthlyDeduction: loan.monthlyDeduction,
      remainingBalance: loan.remainingBalance,
      issueDate: loan.issueDate,
      notes: loan.notes,
    }));

    // Current shift info
    const shiftInfo = employee.shift
      ? {
          id: employee.shift.id,
          name: employee.shift.name,
          nameAr: employee.shift.nameAr,
          startTime: employee.shift.startTime,
          endTime: employee.shift.endTime,
          gracePeriod: employee.shift.gracePeriod,
          isOvernight: employee.shift.isOvernight,
          color: employee.shift.color,
        }
      : null;

    return NextResponse.json({
      employee: {
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        nameAr: employee.nameAr,
        department: employee.department,
        position: employee.position,
        phone: employee.phone,
        email: employee.email,
        fingerprintId: employee.fingerprintId,
        isActive: employee.isActive,
        hireDate: employee.hireDate,
        createdAt: employee.createdAt,
      },
      salaryInfo,
      activeLoans,
      shiftInfo,
      attendanceSummary,
      recentAttendance,
      customAllowances: employee.allowances.map((a) => ({
        id: a.id,
        name: a.name,
        nameAr: a.nameAr,
        amount: a.amount,
        type: a.type,
      })),
      customDeductions: employee.deductions.map((d) => ({
        id: d.id,
        name: d.name,
        nameAr: d.nameAr,
        amount: d.amount,
        type: d.type,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch employee profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Calculate attendance summary from logs
function calculateAttendanceSummary(
  logs: {
    id: string;
    timestamp: Date;
    verifyMode: string;
    ioMode: number;
    status: string;
    device: { id: string; name: string };
  }[],
  shift: {
    startTime: string;
    endTime: string;
    gracePeriod: number;
    isOvernight: boolean;
  } | null
) {
  // Group logs by date
  const logsByDate = new Map<string, typeof logs>();
  for (const log of logs) {
    const dateKey = new Date(log.timestamp).toISOString().split("T")[0];
    if (!logsByDate.has(dateKey)) {
      logsByDate.set(dateKey, []);
    }
    logsByDate.get(dateKey)!.push(log);
  }

  let presentDays = 0;
  let lateDays = 0;
  let absentDays = 0;
  let totalWorkedMinutes = 0;
  let overtimeMinutes = 0;

  // Calculate working days in the last 30 days (excluding Fridays and Saturdays as common weekend)
  const now = new Date();
  let totalWorkingDays = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dayOfWeek = d.getDay();
    // Count Sunday-Thursday as working days (common in Saudi Arabia)
    if (dayOfWeek !== 5 && dayOfWeek !== 6) {
      totalWorkingDays++;
    }
  }

  const shiftStartMinutes = shift
    ? parseTimeToMinutes(shift.startTime)
    : parseTimeToMinutes("08:00");
  const shiftEndMinutes = shift
    ? parseTimeToMinutes(shift.endTime)
    : parseTimeToMinutes("17:00");
  const graceMinutes = shift?.gracePeriod ?? 15;
  const expectedWorkMinutes = shiftEndMinutes > shiftStartMinutes
    ? shiftEndMinutes - shiftStartMinutes
    : (24 * 60 - shiftStartMinutes) + shiftEndMinutes;

  for (const [dateKey, dayLogs] of logsByDate) {
    // Sort logs by timestamp
    dayLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Find first check-in and last check-out
    const checkIns = dayLogs.filter((l) => l.ioMode === 0);
    const checkOuts = dayLogs.filter((l) => l.ioMode === 1);

    if (checkIns.length > 0 || checkOuts.length > 0) {
      presentDays++;

      // Check if late
      if (checkIns.length > 0) {
        const firstCheckIn = new Date(checkIns[0].timestamp);
        const checkInMinutes = firstCheckIn.getHours() * 60 + firstCheckIn.getMinutes();
        if (checkInMinutes > shiftStartMinutes + graceMinutes) {
          lateDays++;
        }
      }

      // Calculate worked hours
      const firstIn = checkIns.length > 0
        ? new Date(checkIns[0].timestamp)
        : null;
      const lastOut = checkOuts.length > 0
        ? new Date(checkOuts[checkOuts.length - 1].timestamp)
        : null;

      if (firstIn && lastOut) {
        const workedMs = lastOut.getTime() - firstIn.getTime();
        const workedMin = Math.max(0, Math.round(workedMs / (1000 * 60)));
        totalWorkedMinutes += workedMin;

        // Calculate overtime (worked more than expected)
        if (workedMin > expectedWorkMinutes) {
          overtimeMinutes += workedMin - expectedWorkMinutes;
        }
      }
    }
  }

  // Absent days = working days - present days (but not less than 0)
  absentDays = Math.max(0, totalWorkingDays - presentDays);

  return {
    presentDays,
    lateDays,
    absentDays,
    totalWorkingDays,
    totalWorkedHours: Math.round((totalWorkedMinutes / 60) * 100) / 100,
    overtimeHours: Math.round((overtimeMinutes / 60) * 100) / 100,
  };
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
