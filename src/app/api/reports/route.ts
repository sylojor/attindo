import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ─── Helper: Check if a date is a holiday ───
async function isHoliday(dateStr: string): Promise<{
  isHoliday: boolean;
  holiday: { id: string; name: string; nameAr: string | null } | null;
}> {
  const targetDateStr = dateStr.split("T")[0]; // YYYY-MM-DD
  const month = parseInt(targetDateStr.split("-")[1], 10);
  const day = parseInt(targetDateStr.split("-")[2], 10);

  // Get all holidays and filter in JS to avoid DateTime comparison issues
  const allHolidays = await db.holiday.findMany({
    select: { id: true, name: true, nameAr: true, date: true, isRecurring: true },
  });

  // Check for exact date match
  const exactHoliday = allHolidays.find((h) => {
    const hDateStr = new Date(h.date).toISOString().split("T")[0];
    return hDateStr === targetDateStr;
  });

  if (exactHoliday) {
    return { isHoliday: true, holiday: { id: exactHoliday.id, name: exactHoliday.name, nameAr: exactHoliday.nameAr } };
  }

  // Check for recurring holidays (same month and day)
  const recurringHoliday = allHolidays.find((h) => {
    if (!h.isRecurring) return false;
    const hDate = new Date(h.date);
    return hDate.getMonth() + 1 === month && hDate.getDate() === day;
  });

  if (recurringHoliday) {
    return { isHoliday: true, holiday: { id: recurringHoliday.id, name: recurringHoliday.name, nameAr: recurringHoliday.nameAr } };
  }

  return { isHoliday: false, holiday: null };
}

// ─── Helper: Determine schedule for a given day ───
function getDaySchedule(
  dayOfWeek: number,
  scheduleMap: Map<
    number,
    | {
        isOffDay: boolean;
        shift: {
          startTime: string;
          endTime: string;
          gracePeriod: number;
          isOvernight: boolean;
        };
      }
    | null
  >,
  genericSchedule: {
    isOffDay: boolean;
    shift: {
      startTime: string;
      endTime: string;
      gracePeriod: number;
      isOvernight: boolean;
    };
  } | null,
  defaultShift: {
    startTime: string;
    endTime: string;
    gracePeriod: number;
    isOvernight: boolean;
  } | null
): { isOffDay: boolean; effectiveShift: typeof defaultShift } {
  const daySchedule = scheduleMap.get(dayOfWeek);
  let isOffDay = false;
  let effectiveShift = defaultShift;

  if (daySchedule) {
    isOffDay = daySchedule.isOffDay;
    if (!isOffDay) {
      effectiveShift = daySchedule.shift;
    }
  } else if (genericSchedule) {
    isOffDay = genericSchedule.isOffDay;
    if (!isOffDay) {
      effectiveShift = genericSchedule.shift;
    }
  } else {
    // Default: Friday (5) and Saturday (6) are off
    isOffDay = dayOfWeek === 5 || dayOfWeek === 6;
  }

  return { isOffDay, effectiveShift };
}

// ─── Helper: Calculate attendance details for an employee on a date ───
function calculateDayAttendance(
  dayLogs: Array<{
    id: string;
    timestamp: Date;
    ioMode: number;
    verifyMode: string;
    device: { id: string; name: string } | null;
  }>,
  effectiveShift: {
    startTime: string;
    endTime: string;
    gracePeriod: number;
    isOvernight: boolean;
  } | null,
  dayDate: Date,
  isOffDay: boolean
): {
  status: string;
  firstCheckIn: string | null;
  lastCheckOut: string | null;
  lateMinutes: number;
  overtimeHours: number;
  workedHours: number;
} {
  let status = isOffDay ? "off" : "absent";
  let firstCheckIn: string | null = null;
  let lastCheckOut: string | null = null;
  let lateMinutes = 0;
  let overtimeHours = 0;
  let workedHours = 0;

  if (!isOffDay && dayLogs.length > 0) {
    status = "present";

    const checkIns = dayLogs.filter((l) => l.ioMode === 0);
    const checkOuts = dayLogs.filter((l) => l.ioMode === 1);

    if (checkIns.length > 0) {
      firstCheckIn = checkIns[0].timestamp.toISOString();
    }
    if (checkOuts.length > 0) {
      lastCheckOut = checkOuts[checkOuts.length - 1].timestamp.toISOString();
    }

    // Check for late arrival
    if (checkIns.length > 0 && effectiveShift) {
      const firstCheckInTime = checkIns[0].timestamp;
      const [shiftHours, shiftMinutes] = effectiveShift.startTime
        .split(":")
        .map(Number);
      const shiftStart = new Date(dayDate);
      shiftStart.setHours(shiftHours, shiftMinutes + effectiveShift.gracePeriod, 0, 0);

      if (firstCheckInTime > shiftStart) {
        status = "late";
        const lateMs = firstCheckInTime.getTime() - shiftStart.getTime();
        lateMinutes = Math.round(lateMs / (1000 * 60));
      }
    }

    // Calculate worked hours and overtime
    if (checkIns.length > 0 && checkOuts.length > 0 && effectiveShift) {
      const firstIn = checkIns[0].timestamp;
      const lastOut = checkOuts[checkOuts.length - 1].timestamp;
      workedHours = (lastOut.getTime() - firstIn.getTime()) / (1000 * 60 * 60);

      // Overtime
      if (lastOut) {
        const [endHours, endMinutes] = effectiveShift.endTime
          .split(":")
          .map(Number);
        const shiftEnd = new Date(dayDate);
        if (effectiveShift.isOvernight) {
          shiftEnd.setDate(shiftEnd.getDate() + 1);
        }
        shiftEnd.setHours(endHours, endMinutes, 0, 0);

        if (lastOut > shiftEnd) {
          const overtimeMs = lastOut.getTime() - shiftEnd.getTime();
          overtimeHours = overtimeMs / (1000 * 60 * 60);
        }
      }
    }
  }

  return {
    status,
    firstCheckIn,
    lastCheckOut,
    lateMinutes,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    workedHours: Math.round(workedHours * 100) / 100,
  };
}

// ─── Report Type: absent-on-date ───
async function getAbsentOnDate(dateStr: string) {
  const targetDate = new Date(dateStr + "T00:00:00.000Z");
  const dayOfWeek = targetDate.getDay();

  // End of the target date for query range
  const dayEnd = new Date(dateStr + "T23:59:59.999Z");

  // Check if date is a holiday
  const { isHoliday: dateIsHoliday, holiday } = await isHoliday(dateStr);

  // If it's a holiday, everyone is off
  if (dateIsHoliday) {
    const employees = await db.employee.findMany({
      where: { isActive: true },
      select: {
        id: true, employeeId: true, name: true, nameAr: true, position: true, fingerprintId: true,
        department: { select: { id: true, name: true, nameAr: true } },
      },
      orderBy: { name: "asc" },
    });
    return {
      date: dateStr,
      dayOfWeek,
      isHoliday: true,
      holiday: { id: holiday!.id, name: holiday!.name, nameAr: holiday!.nameAr },
      absentCount: employees.length,
      employees: employees.map((emp) => ({
        employee: emp,
        absenceType: "holiday" as const,
        holidayInfo: { id: holiday!.id, name: holiday!.name, nameAr: holiday!.nameAr },
        schedule: { isOffDay: true, shiftName: null, startTime: null, endTime: null },
        attendanceLogs: [],
      })),
    };
  }

  // Not a holiday - find employees who don't have attendance on this date
  // Get all active employees
  const employees = await db.employee.findMany({
    where: { isActive: true },
    select: {
      id: true, employeeId: true, name: true, nameAr: true, position: true, fingerprintId: true,
      department: { select: { id: true, name: true, nameAr: true } },
      shift: { select: { id: true, name: true, startTime: true, endTime: true, gracePeriod: true, isOvernight: true } },
      schedules: {
        where: {
          effectiveDate: { lte: dayEnd },
          OR: [{ endDate: null }, { endDate: { gte: targetDate } }],
        },
        select: { id: true, dayOfWeek: true, isOffDay: true, shift: { select: { id: true, name: true, startTime: true, endTime: true, gracePeriod: true, isOvernight: true } } },
        orderBy: { effectiveDate: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  // Get all attendance logs for this date
  const allLogs = await db.attendanceLog.findMany({
    where: { timestamp: { gte: targetDate, lte: dayEnd } },
    select: { id: true, employeeId: true, timestamp: true, ioMode: true, verifyMode: true, device: { select: { name: true } } },
  });

  // Group logs by employee
  const logsByEmployee = new Map<string, typeof allLogs>();
  for (const log of allLogs) {
    if (log.employeeId) {
      if (!logsByEmployee.has(log.employeeId)) logsByEmployee.set(log.employeeId, []);
      logsByEmployee.get(log.employeeId)!.push(log);
    }
  }

  const absentEmployees: Array<{
    employee: typeof employees[0];
    absenceType: "scheduled_off" | "holiday" | "actual_absence";
    holidayInfo: null;
    schedule: { isOffDay: boolean; shiftName: string | null; startTime: string | null; endTime: string | null };
    attendanceLogs: Array<{ id: string; timestamp: Date; ioMode: number; verifyMode: string; device: string }>;
  }> = [];

  for (const employee of employees) {
    const empLogs = logsByEmployee.get(employee.id) || [];

    // Check if this day is an off day for this employee
    const daySchedule = employee.schedules.find((s) => s.dayOfWeek === dayOfWeek);
    const genericSchedule = employee.schedules.find((s) => s.dayOfWeek === null);

    let isOffDay = false;
    let shiftName: string | null = null;
    let startTime: string | null = null;
    let endTime: string | null = null;

    if (daySchedule) {
      isOffDay = daySchedule.isOffDay;
      if (!isOffDay && daySchedule.shift) {
        shiftName = daySchedule.shift.name;
        startTime = daySchedule.shift.startTime;
        endTime = daySchedule.shift.endTime;
      }
    } else if (genericSchedule) {
      isOffDay = genericSchedule.isOffDay;
      if (!isOffDay && genericSchedule.shift) {
        shiftName = genericSchedule.shift.name;
        startTime = genericSchedule.shift.startTime;
        endTime = genericSchedule.shift.endTime;
      }
    } else {
      // Default: Friday (5) and Saturday (6) are off
      isOffDay = dayOfWeek === 5 || dayOfWeek === 6;
      if (!isOffDay && employee.shift) {
        shiftName = employee.shift.name;
        startTime = employee.shift.startTime;
        endTime = employee.shift.endTime;
      }
    }

    // If employee has attendance logs, they're not absent
    if (empLogs.length > 0) continue;

    // Employee is absent or off
    const absenceType = isOffDay ? "scheduled_off" : "actual_absence";

    absentEmployees.push({
      employee,
      absenceType,
      holidayInfo: null,
      schedule: { isOffDay, shiftName, startTime, endTime },
      attendanceLogs: empLogs.map((l) => ({
        id: l.id,
        timestamp: l.timestamp,
        ioMode: l.ioMode,
        verifyMode: l.verifyMode,
        device: l.device?.name || "Unknown",
      })),
    });
  }

  return {
    date: dateStr,
    dayOfWeek,
    isHoliday: false,
    holiday: null,
    absentCount: absentEmployees.length,
    employees: absentEmployees,
  };
}

// ─── Report Type: working-by-shift ───
async function getWorkingByShift(shiftId: string, dateStr: string) {
  const targetDate = new Date(dateStr + "T00:00:00.000Z");
  const dayOfWeek = targetDate.getDay();
  const dayEnd = new Date(dateStr + "T23:59:59.999Z");

  // Verify shift exists
  const shift = await db.shift.findUnique({ where: { id: shiftId } });
  if (!shift) {
    return { error: "Shift not found", status: 404 };
  }

  // Find employees assigned to this shift - simple approach
  const directEmployees = await db.employee.findMany({
    where: { isActive: true, shiftId: shiftId },
    select: {
      id: true, employeeId: true, name: true, nameAr: true, position: true, fingerprintId: true,
      department: { select: { id: true, name: true, nameAr: true } },
      shift: { select: { id: true, name: true, startTime: true, endTime: true, gracePeriod: true, isOvernight: true } },
      schedules: {
        select: { id: true, dayOfWeek: true, isOffDay: true, shift: { select: { name: true, startTime: true, endTime: true, gracePeriod: true, isOvernight: true } } },
        orderBy: { effectiveDate: "desc" },
        take: 7,
      },
    },
    orderBy: { name: "asc" },
  });

  // Get all attendance logs for this date
  const allLogs = await db.attendanceLog.findMany({
    where: { timestamp: { gte: targetDate, lte: dayEnd } },
    select: { id: true, employeeId: true, timestamp: true, ioMode: true, verifyMode: true, device: { select: { name: true } } },
  });

  const logsByEmployee = new Map<string, typeof allLogs>();
  for (const log of allLogs) {
    if (log.employeeId) {
      if (!logsByEmployee.has(log.employeeId)) logsByEmployee.set(log.employeeId, []);
      logsByEmployee.get(log.employeeId)!.push(log);
    }
  }

  const workingEmployees: Array<{
    employee: { id: string; employeeId: string; name: string; nameAr: string | null; department: { id: string; name: string; nameAr: string | null } | null; fingerprintId: number | null; position: string | null };
    shift: { id: string; name: string; startTime: string; endTime: string; gracePeriod: number; isOvernight: boolean };
    isOffDay: boolean;
    checkIn: string | null;
    checkOut: string | null;
    status: string;
    lateMinutes: number;
    overtimeHours: number;
    workedHours: number;
  }> = [];

  for (const employee of directEmployees) {
    const empLogs = logsByEmployee.get(employee.id) || [];
    const daySchedule = employee.schedules.find((s) => s.dayOfWeek === dayOfWeek);
    const genericSchedule = employee.schedules.find((s) => s.dayOfWeek === null);

    let isOffDay = false;
    let effectiveShift = employee.shift;

    if (daySchedule) {
      isOffDay = daySchedule.isOffDay;
      if (!isOffDay && daySchedule.shift) effectiveShift = daySchedule.shift;
    } else if (genericSchedule) {
      isOffDay = genericSchedule.isOffDay;
      if (!isOffDay && genericSchedule.shift) effectiveShift = genericSchedule.shift;
    } else {
      isOffDay = dayOfWeek === 5 || dayOfWeek === 6;
    }

    const checkIns = empLogs.filter((l) => l.ioMode === 0);
    const checkOuts = empLogs.filter((l) => l.ioMode === 1);

    let status = isOffDay ? "off" : "absent";
    let checkIn: string | null = null;
    let checkOut: string | null = null;
    let lateMinutes = 0;
    let overtimeHours = 0;
    let workedHours = 0;

    if (!isOffDay && empLogs.length > 0) {
      status = "present";
      if (checkIns.length > 0) checkIn = checkIns[0].timestamp.toISOString();
      if (checkOuts.length > 0) checkOut = checkOuts[checkOuts.length - 1].timestamp.toISOString();

      // Late check
      if (checkIns.length > 0 && effectiveShift) {
        const firstIn = checkIns[0].timestamp;
        const [sh, sm] = effectiveShift.startTime.split(":").map(Number);
        const shiftStart = new Date(targetDate);
        shiftStart.setHours(sh, sm + effectiveShift.gracePeriod, 0, 0);
        if (firstIn > shiftStart) {
          status = "late";
          lateMinutes = Math.round((firstIn.getTime() - shiftStart.getTime()) / 60000);
        }
      }

      // Worked hours + overtime
      if (checkIns.length > 0 && checkOuts.length > 0) {
        workedHours = (checkOuts[checkOuts.length - 1].timestamp.getTime() - checkIns[0].timestamp.getTime()) / 3600000;
        if (effectiveShift) {
          const [eh, em] = effectiveShift.endTime.split(":").map(Number);
          const shiftEnd = new Date(targetDate);
          if (effectiveShift.isOvernight) shiftEnd.setDate(shiftEnd.getDate() + 1);
          shiftEnd.setHours(eh, em, 0, 0);
          if (checkOuts[checkOuts.length - 1].timestamp > shiftEnd) {
            overtimeHours = (checkOuts[checkOuts.length - 1].timestamp.getTime() - shiftEnd.getTime()) / 3600000;
          }
        }
      }
    }

    workingEmployees.push({
      employee: { id: employee.id, employeeId: employee.employeeId, name: employee.name, nameAr: employee.nameAr, department: employee.department, fingerprintId: employee.fingerprintId, position: employee.position },
      shift: { id: shift.id, name: shift.name, startTime: shift.startTime, endTime: shift.endTime, gracePeriod: shift.gracePeriod, isOvernight: shift.isOvernight },
      isOffDay,
      checkIn,
      checkOut,
      status,
      lateMinutes,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      workedHours: Math.round(workedHours * 100) / 100,
    });
  }

  return {
    date: dateStr,
    shift: { id: shift.id, name: shift.name, nameAr: shift.nameAr, startTime: shift.startTime, endTime: shift.endTime, isOvernight: shift.isOvernight },
    totalEmployees: workingEmployees.length,
    presentCount: workingEmployees.filter((e) => e.status === "present" || e.status === "late").length,
    absentCount: workingEmployees.filter((e) => e.status === "absent").length,
    offDayCount: workingEmployees.filter((e) => e.status === "off").length,
    employees: workingEmployees,
  };
}

// ─── Default Report (existing functionality) ───
async function getDefaultReport(
  employeeId: string,
  departmentId: string,
  dateFrom: string,
  dateTo: string
) {
  if (!dateFrom || !dateTo) {
    return {
      error: "dateFrom and dateTo are required",
      status: 400,
    };
  }

  const periodStart = new Date(dateFrom);
  const periodEnd = new Date(dateTo);
  // Include the full end date
  periodEnd.setDate(periodEnd.getDate() + 1);
  periodEnd.setMilliseconds(periodEnd.getMilliseconds() - 1);

  // Build employee filter
  const employeeWhere: Record<string, unknown> = { isActive: true };
  if (employeeId) {
    employeeWhere.id = employeeId;
  }
  if (departmentId) {
    employeeWhere.departmentId = departmentId;
  }

  // Fetch employees with their data
  const employees = await db.employee.findMany({
    where: employeeWhere,
    include: {
      department: { select: { id: true, name: true, nameAr: true } },
      shift: true,
      schedules: {
        where: {
          effectiveDate: { lte: periodEnd },
          OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
        },
        include: { shift: true },
        orderBy: { effectiveDate: "desc" },
      },
      salaryStructure: true,
      allowances: {
        where: {
          isRecurring: true,
          effectiveDate: { lte: periodEnd },
          OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
        },
      },
      deductions: {
        where: {
          isRecurring: true,
          effectiveDate: { lte: periodEnd },
          OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
        },
      },
      loans: {
        where: { status: "active" },
      },
    },
    orderBy: { name: "asc" },
  });

  // For each employee, get attendance logs and calculate stats
  const reportData = [];

  for (const employee of employees) {
    const logs = await db.attendanceLog.findMany({
      where: {
        employeeId: employee.id,
        timestamp: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      include: {
        device: { select: { id: true, name: true } },
      },
      orderBy: { timestamp: "asc" },
    });

    // Build schedule map
    const scheduleMap = new Map<
      number,
      | {
          isOffDay: boolean;
          shift: {
            startTime: string;
            endTime: string;
            gracePeriod: number;
            isOvernight: boolean;
          };
        }
      | null
    >();
    for (const schedule of employee.schedules) {
      if (schedule.dayOfWeek !== null) {
        scheduleMap.set(schedule.dayOfWeek, {
          isOffDay: schedule.isOffDay,
          shift: schedule.shift,
        });
      }
    }
    const genericSchedule = employee.schedules.find(
      (s) => s.dayOfWeek === null
    );

    // Group logs by date
    const logsByDate = new Map<string, typeof logs>();
    for (const log of logs) {
      const dateKey = log.timestamp.toISOString().split("T")[0];
      if (!logsByDate.has(dateKey)) {
        logsByDate.set(dateKey, []);
      }
      logsByDate.get(dateKey)!.push(log);
    }

    // Calculate daily details
    let workingDays = 0;
    let presentDays = 0;
    let absentDays = 0;
    let lateDays = 0;
    let totalLateMinutes = 0;
    let totalOvertimeHours = 0;
    let totalWorkedHours = 0;

    const dailyDetails: Array<{
      date: string;
      dayOfWeek: number;
      isOffDay: boolean;
      status: string;
      firstCheckIn: string | null;
      lastCheckOut: string | null;
      lateMinutes: number;
      overtimeHours: number;
      workedHours: number;
    }> = [];

    const dayIterator = new Date(periodStart);
    while (dayIterator <= periodEnd) {
      const dayOfWeek = dayIterator.getDay();

      const { isOffDay, effectiveShift } = getDaySchedule(
        dayOfWeek,
        scheduleMap,
        genericSchedule
          ? {
              isOffDay: genericSchedule.isOffDay,
              shift: genericSchedule.shift,
            }
          : null,
        employee.shift
      );

      const dateKey = dayIterator.toISOString().split("T")[0];
      const dayLogs = logsByDate.get(dateKey) || [];

      const dayAttendance = calculateDayAttendance(
        dayLogs,
        effectiveShift,
        dayIterator,
        isOffDay
      );

      if (!isOffDay) {
        workingDays++;
        if (dayLogs.length > 0) {
          presentDays++;
          if (dayAttendance.status === "late") {
            lateDays++;
            totalLateMinutes += dayAttendance.lateMinutes;
          }
          totalWorkedHours += dayAttendance.workedHours;
          totalOvertimeHours += dayAttendance.overtimeHours;
        } else {
          absentDays++;
        }
      }

      dailyDetails.push({
        date: dateKey,
        dayOfWeek,
        isOffDay,
        status: dayAttendance.status,
        firstCheckIn: dayAttendance.firstCheckIn,
        lastCheckOut: dayAttendance.lastCheckOut,
        lateMinutes: dayAttendance.lateMinutes,
        overtimeHours: dayAttendance.overtimeHours,
        workedHours: dayAttendance.workedHours,
      });

      dayIterator.setDate(dayIterator.getDate() + 1);
    }

    // Salary info
    const struct = employee.salaryStructure;
    let salaryInfo = null;
    if (struct) {
      const fixedAllowances =
        struct.housingAllowance +
        struct.transportAllowance +
        struct.foodAllowance +
        struct.otherAllowances;
      let customAllowances = 0;
      for (const allowance of employee.allowances) {
        if (allowance.type === "percentage") {
          customAllowances +=
            (struct.basicSalary * allowance.amount) / 100;
        } else {
          customAllowances += allowance.amount;
        }
      }
      let customDeductions = 0;
      for (const deduction of employee.deductions) {
        if (deduction.type === "percentage") {
          customDeductions +=
            (struct.basicSalary * deduction.amount) / 100;
        } else {
          customDeductions += deduction.amount;
        }
      }

      const lateDeductions = lateDays * struct.deductionPerLate;
      const absentDeductions = absentDays * struct.deductionPerAbsent;
      const overtimePay = totalOvertimeHours * struct.overtimeRate;

      let loanDeduction = 0;
      for (const loan of employee.loans) {
        loanDeduction += Math.min(
          loan.monthlyDeduction,
          loan.remainingBalance
        );
      }

      const totalAllowances = fixedAllowances + customAllowances;
      const totalDeductionsAmount =
        lateDeductions + absentDeductions + customDeductions;
      const netSalary =
        struct.basicSalary +
        totalAllowances +
        overtimePay -
        totalDeductionsAmount -
        loanDeduction;

      salaryInfo = {
        basicSalary: struct.basicSalary,
        housingAllowance: struct.housingAllowance,
        transportAllowance: struct.transportAllowance,
        foodAllowance: struct.foodAllowance,
        otherAllowances: struct.otherAllowances,
        totalFixedAllowances: fixedAllowances,
        customAllowances,
        totalAllowances,
        lateDeductions,
        absentDeductions,
        customDeductions,
        totalDeductions: totalDeductionsAmount,
        overtimePay,
        loanDeduction,
        netSalary,
        currency: struct.currency,
      };
    }

    reportData.push({
      employee: {
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        nameAr: employee.nameAr,
        department: employee.department,
        position: employee.position,
      },
      summary: {
        workingDays,
        presentDays,
        absentDays,
        lateDays,
        totalLateMinutes,
        totalLateHours:
          Math.round((totalLateMinutes / 60) * 100) / 100,
        totalOvertimeHours:
          Math.round(totalOvertimeHours * 100) / 100,
        totalWorkedHours:
          Math.round(totalWorkedHours * 100) / 100,
      },
      dailyDetails,
      salaryInfo,
      attendanceLogs: logs.map((l) => ({
        id: l.id,
        timestamp: l.timestamp,
        verifyMode: l.verifyMode,
        ioMode: l.ioMode,
        device: l.device?.name || "Unknown",
      })),
    });
  }

  return {
    period: {
      from: dateFrom,
      to: dateTo,
    },
    employees: reportData,
    totalEmployees: reportData.length,
  };
}

// GET /api/reports - Generate attendance & salary report
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get("reportType") || "";

    // ─── Report: absent-on-date ───
    if (reportType === "absent-on-date") {
      const date = searchParams.get("date") || "";
      if (!date) {
        return NextResponse.json(
          { error: "date parameter is required (YYYY-MM-DD)" },
          { status: 400 }
        );
      }

      // Validate date format
      const parsed = new Date(date);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "Invalid date format. Use YYYY-MM-DD" },
          { status: 400 }
        );
      }

      const result = await getAbsentOnDate(date);
      return NextResponse.json(result);
    }

    // ─── Report: working-by-shift ───
    if (reportType === "working-by-shift") {
      const shiftId = searchParams.get("shiftId") || "";
      const date = searchParams.get("date") || "";

      if (!shiftId) {
        return NextResponse.json(
          { error: "shiftId parameter is required" },
          { status: 400 }
        );
      }
      if (!date) {
        return NextResponse.json(
          { error: "date parameter is required (YYYY-MM-DD)" },
          { status: 400 }
        );
      }

      // Validate date format
      const parsed = new Date(date);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "Invalid date format. Use YYYY-MM-DD" },
          { status: 400 }
        );
      }

      const result = await getWorkingByShift(shiftId, date);
      if ("error" in result) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }
      return NextResponse.json(result);
    }

    // ─── Default Report (existing functionality) ───
    const employeeId = searchParams.get("employeeId") || "";
    const departmentId = searchParams.get("departmentId") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    const result = await getDefaultReport(
      employeeId,
      departmentId,
      dateFrom,
      dateTo
    );

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to generate report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
