import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/payroll/process - Process payroll for a period
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { payrollPeriodId } = body;

    if (!payrollPeriodId) {
      return NextResponse.json(
        { error: "payrollPeriodId is required" },
        { status: 400 }
      );
    }

    // Get the payroll period
    const period = await db.payrollPeriod.findUnique({
      where: { id: payrollPeriodId },
    });

    if (!period) {
      return NextResponse.json(
        { error: "Payroll period not found" },
        { status: 404 }
      );
    }

    if (period.status === "completed" || period.status === "approved") {
      return NextResponse.json(
        { error: "Payroll period has already been processed. Delete existing slips first to reprocess." },
        { status: 400 }
      );
    }

    // Mark as processing
    await db.payrollPeriod.update({
      where: { id: payrollPeriodId },
      data: { status: "processing" },
    });

    try {
      // Get all active employees with salary structures
      const employees = await db.employee.findMany({
        where: { isActive: true },
        include: {
          salaryStructure: true,
          shift: true,
          schedules: {
            where: {
              effectiveDate: { lte: period.endDate },
              OR: [
                { endDate: null },
                { endDate: { gte: period.startDate } },
              ],
            },
            include: { shift: true },
            orderBy: { effectiveDate: "desc" },
          },
          allowances: {
            where: {
              isRecurring: true,
              effectiveDate: { lte: period.endDate },
              OR: [
                { endDate: null },
                { endDate: { gte: period.startDate } },
              ],
            },
          },
          deductions: {
            where: {
              isRecurring: true,
              effectiveDate: { lte: period.endDate },
              OR: [
                { endDate: null },
                { endDate: { gte: period.startDate } },
              ],
            },
          },
          loans: {
            where: { status: "active" },
          },
        },
      });

      const periodStart = new Date(period.startDate);
      const periodEnd = new Date(period.endDate);

      let totalGross = 0;
      let totalDeductionsAll = 0;
      let totalNet = 0;
      let processedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];

      for (const employee of employees) {
        // Skip employees without salary structures
        if (!employee.salaryStructure) {
          skippedCount++;
          continue;
        }

        const struct = employee.salaryStructure;

        // Calculate attendance for this employee in the period
        const attendance = await calculateAttendance(
          employee.id,
          periodStart,
          periodEnd,
          employee.shift,
          employee.schedules
        );

        // Calculate custom allowances
        let customAllowances = 0;
        for (const allowance of employee.allowances) {
          if (allowance.type === "percentage") {
            customAllowances += (struct.basicSalary * allowance.amount) / 100;
          } else {
            customAllowances += allowance.amount;
          }
        }

        // Calculate custom deductions
        let customDeductions = 0;
        for (const deduction of employee.deductions) {
          if (deduction.type === "percentage") {
            customDeductions += (struct.basicSalary * deduction.amount) / 100;
          } else {
            customDeductions += deduction.amount;
          }
        }

        // Calculate salary components
        const basicSalary = struct.basicSalary;
        const fixedAllowances = struct.housingAllowance + struct.transportAllowance +
          struct.foodAllowance + struct.otherAllowances;
        const totalAllowances = fixedAllowances + customAllowances;

        const lateDeductions = attendance.lateDays * struct.deductionPerLate;
        const absentDeductions = attendance.absentDays * struct.deductionPerAbsent;
        const overtimePay = attendance.overtimeHours * struct.overtimeRate;

        // Loan deductions: sum of monthlyDeduction from active loans
        let loanDeduction = 0;
        for (const loan of employee.loans) {
          loanDeduction += loan.monthlyDeduction;
          // Don't deduct more than remaining balance
          if (loanDeduction > loan.remainingBalance) {
            loanDeduction = loan.remainingBalance;
          }
        }

        const totalDeductionsAmount = lateDeductions + absentDeductions + customDeductions;

        const netSalary = basicSalary + totalAllowances + overtimePay - totalDeductionsAmount - loanDeduction;

        // Create or update pay slip using upsert
        try {
          await db.paySlip.upsert({
            where: {
              employeeId_payrollPeriodId: {
                employeeId: employee.id,
                payrollPeriodId,
              },
            },
            create: {
              employeeId: employee.id,
              payrollPeriodId,
              basicSalary,
              totalAllowances,
              totalDeductions: totalDeductionsAmount,
              loanDeduction,
              overtimePay,
              netSalary,
              workingDays: attendance.workingDays,
              presentDays: attendance.presentDays,
              absentDays: attendance.absentDays,
              lateDays: attendance.lateDays,
              overtimeHours: attendance.overtimeHours,
            },
            update: {
              basicSalary,
              totalAllowances,
              totalDeductions: totalDeductionsAmount,
              loanDeduction,
              overtimePay,
              netSalary,
              workingDays: attendance.workingDays,
              presentDays: attendance.presentDays,
              absentDays: attendance.absentDays,
              lateDays: attendance.lateDays,
              overtimeHours: attendance.overtimeHours,
            },
          });

          totalGross += basicSalary + totalAllowances + overtimePay;
          totalDeductionsAll += totalDeductionsAmount + loanDeduction;
          totalNet += netSalary;
          processedCount++;
        } catch (slipError: unknown) {
          const errMsg = slipError instanceof Error ? slipError.message : "Unknown error";
          errors.push(`Failed to process pay slip for ${employee.name}: ${errMsg}`);
        }
      }

      // Update loan remainingBalances after processing
      for (const employee of employees) {
        for (const loan of employee.loans) {
          const deduction = Math.min(loan.monthlyDeduction, loan.remainingBalance);
          const newBalance = loan.remainingBalance - deduction;
          await db.loan.update({
            where: { id: loan.id },
            data: {
              remainingBalance: Math.max(0, newBalance),
              ...(newBalance <= 0 && { status: "completed" }),
            },
          });
        }
      }

      // Update payroll period totals
      await db.payrollPeriod.update({
        where: { id: payrollPeriodId },
        data: {
          status: "completed",
          totalGross,
          totalDeductions: totalDeductionsAll,
          totalNet,
          processedAt: new Date(),
        },
      });

      return NextResponse.json({
        message: "Payroll processed successfully",
        summary: {
          totalEmployees: employees.length,
          processedCount,
          skippedCount,
          totalGross,
          totalDeductions: totalDeductionsAll,
          totalNet,
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    } catch (processError: unknown) {
      // Revert status on processing error
      await db.payrollPeriod.update({
        where: { id: payrollPeriodId },
        data: { status: "draft" },
      });
      throw processError;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process payroll";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Helper: Calculate attendance for an employee within a period
async function calculateAttendance(
  employeeId: string,
  periodStart: Date,
  periodEnd: Date,
  shift: {
    id: string;
    startTime: string;
    endTime: string;
    gracePeriod: number;
    isOvernight: boolean;
  } | null,
  schedules: {
    id: string;
    dayOfWeek: number | null;
    isOffDay: boolean;
    shift: {
      id: string;
      startTime: string;
      endTime: string;
      gracePeriod: number;
      isOvernight: boolean;
    };
  }[]
) {
  // Get all attendance logs for this employee in the period
  const logs = await db.attendanceLog.findMany({
    where: {
      employeeId,
      timestamp: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
    orderBy: { timestamp: "asc" },
  });

  // Build a schedule map: dayOfWeek -> schedule info
  const scheduleMap = new Map<number, { isOffDay: boolean; shift: { startTime: string; endTime: string; gracePeriod: number; isOvernight: boolean } } | null>();
  for (const schedule of schedules) {
    if (schedule.dayOfWeek !== null) {
      scheduleMap.set(schedule.dayOfWeek, { isOffDay: schedule.isOffDay, shift: schedule.shift });
    }
  }

  // Check if there's a generic schedule (dayOfWeek = null)
  const genericSchedule = schedules.find((s) => s.dayOfWeek === null);

  // Calculate working days in the period
  let workingDays = 0;
  const current = new Date(periodStart);
  while (current <= periodEnd) {
    const dayOfWeek = current.getDay();

    // Check schedule for this day
    const daySchedule = scheduleMap.get(dayOfWeek);
    if (daySchedule) {
      // Specific day schedule exists
      if (!daySchedule.isOffDay) {
        workingDays++;
      }
    } else if (genericSchedule) {
      // Use generic schedule
      if (!genericSchedule.isOffDay) {
        workingDays++;
      }
    } else {
      // Default: exclude Fridays (5) and Saturdays (6) as off days
      if (dayOfWeek !== 5 && dayOfWeek !== 6) {
        workingDays++;
      }
    }

    current.setDate(current.getDate() + 1);
  }

  // Group logs by date
  const logsByDate = new Map<string, typeof logs>();
  for (const log of logs) {
    const dateKey = log.timestamp.toISOString().split("T")[0];
    if (!logsByDate.has(dateKey)) {
      logsByDate.set(dateKey, []);
    }
    logsByDate.get(dateKey)!.push(log);
  }

  let presentDays = 0;
  let absentDays = 0;
  let lateDays = 0;
  let totalOvertimeHours = 0;

  // Check each day in the period
  const dayIterator = new Date(periodStart);
  while (dayIterator <= periodEnd) {
    const dayOfWeek = dayIterator.getDay();

    // Determine if this is a working day
    const daySchedule = scheduleMap.get(dayOfWeek);
    let isOffDay = false;
    let effectiveShift = shift;

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
      // Default: Friday and Saturday are off days
      isOffDay = dayOfWeek === 5 || dayOfWeek === 6;
    }

    // Skip off days
    if (isOffDay) {
      dayIterator.setDate(dayIterator.getDate() + 1);
      continue;
    }

    const dateKey = dayIterator.toISOString().split("T")[0];
    const dayLogs = logsByDate.get(dateKey) || [];

    if (dayLogs.length === 0) {
      // No attendance record = absent
      absentDays++;
    } else {
      presentDays++;

      // Find first check-in and last check-out
      const checkIns = dayLogs.filter((l) => l.ioMode === 0);
      const checkOuts = dayLogs.filter((l) => l.ioMode === 1);

      // Determine the effective shift for this day
      const shiftToUse = effectiveShift || shift;

      // Check for late arrival
      if (checkIns.length > 0 && shiftToUse) {
        const firstCheckIn = checkIns[0].timestamp;
        const [shiftHours, shiftMinutes] = shiftToUse.startTime.split(":").map(Number);
        const shiftStart = new Date(dayIterator);
        shiftStart.setHours(shiftHours, shiftMinutes + shiftToUse.gracePeriod, 0, 0);

        if (firstCheckIn > shiftStart) {
          lateDays++;
        }
      }

      // Calculate overtime (check-outs after shift end)
      if (checkOuts.length > 0 && shiftToUse) {
        const lastCheckOut = checkOuts[checkOuts.length - 1].timestamp;
        const [endHours, endMinutes] = shiftToUse.endTime.split(":").map(Number);
        const shiftEnd = new Date(dayIterator);

        if (shiftToUse.isOvernight) {
          // Overnight shift: end time is next day
          shiftEnd.setDate(shiftEnd.getDate() + 1);
        }

        shiftEnd.setHours(endHours, endMinutes, 0, 0);

        if (lastCheckOut > shiftEnd) {
          const overtimeMs = lastCheckOut.getTime() - shiftEnd.getTime();
          const overtimeHrs = overtimeMs / (1000 * 60 * 60);
          // Only count overtime if more than 15 minutes
          if (overtimeHrs >= 0.25) {
            totalOvertimeHours += overtimeHrs;
          }
        }
      }
    }

    dayIterator.setDate(dayIterator.getDate() + 1);
  }

  return {
    workingDays,
    presentDays,
    absentDays,
    lateDays,
    overtimeHours: Math.round(totalOvertimeHours * 100) / 100,
  };
}
