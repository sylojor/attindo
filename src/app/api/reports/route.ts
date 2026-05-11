import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/reports - Generate attendance & salary report
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId") || "";
    const departmentId = searchParams.get("departmentId") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: "dateFrom and dateTo are required" },
        { status: 400 }
      );
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
            OR: [
              { endDate: null },
              { endDate: { gte: periodStart } },
            ],
          },
          include: { shift: true },
          orderBy: { effectiveDate: "desc" },
        },
        salaryStructure: true,
        allowances: {
          where: {
            isRecurring: true,
            effectiveDate: { lte: periodEnd },
            OR: [
              { endDate: null },
              { endDate: { gte: periodStart } },
            ],
          },
        },
        deductions: {
          where: {
            isRecurring: true,
            effectiveDate: { lte: periodEnd },
            OR: [
              { endDate: null },
              { endDate: { gte: periodStart } },
            ],
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
      const scheduleMap = new Map<number, { isOffDay: boolean; shift: { startTime: string; endTime: string; gracePeriod: number; isOvernight: boolean } } | null>();
      for (const schedule of employee.schedules) {
        if (schedule.dayOfWeek !== null) {
          scheduleMap.set(schedule.dayOfWeek, { isOffDay: schedule.isOffDay, shift: schedule.shift });
        }
      }
      const genericSchedule = employee.schedules.find((s) => s.dayOfWeek === null);

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

        // Determine if this is a working day
        const daySchedule = scheduleMap.get(dayOfWeek);
        let isOffDay = false;
        let effectiveShift = employee.shift;

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
          isOffDay = dayOfWeek === 5 || dayOfWeek === 6;
        }

        const dateKey = dayIterator.toISOString().split("T")[0];
        const dayLogs = logsByDate.get(dateKey) || [];

        let status = isOffDay ? "off" : "absent";
        let firstCheckIn: string | null = null;
        let lastCheckOut: string | null = null;
        let lateMinutes = 0;
        let overtimeHours = 0;
        let workedHours = 0;

        if (!isOffDay) {
          workingDays++;

          if (dayLogs.length > 0) {
            presentDays++;
            status = "present";

            const checkIns = dayLogs.filter((l) => l.ioMode === 0);
            const checkOuts = dayLogs.filter((l) => l.ioMode === 1);

            const shiftToUse = effectiveShift || employee.shift;

            if (checkIns.length > 0) {
              firstCheckIn = checkIns[0].timestamp.toISOString();
            }
            if (checkOuts.length > 0) {
              lastCheckOut = checkOuts[checkOuts.length - 1].timestamp.toISOString();
            }

            // Check for late arrival
            if (checkIns.length > 0 && shiftToUse) {
              const firstCheckInTime = checkIns[0].timestamp;
              const [shiftHours, shiftMinutes] = shiftToUse.startTime.split(":").map(Number);
              const shiftStart = new Date(dayIterator);
              shiftStart.setHours(shiftHours, shiftMinutes + shiftToUse.gracePeriod, 0, 0);

              if (firstCheckInTime > shiftStart) {
                lateDays++;
                status = "late";
                const lateMs = firstCheckInTime.getTime() - shiftStart.getTime();
                lateMinutes = Math.round(lateMs / (1000 * 60));
                totalLateMinutes += lateMinutes;
              }
            }

            // Calculate worked hours and overtime
            if (checkIns.length > 0 && checkOuts.length > 0) {
              const firstIn = checkIns[0].timestamp;
              const lastOut = checkOuts[checkOuts.length - 1].timestamp;
              workedHours = (lastOut.getTime() - firstIn.getTime()) / (1000 * 60 * 60);
              totalWorkedHours += workedHours;

              // Overtime
              if (shiftToUse && lastOut) {
                const [endHours, endMinutes] = shiftToUse.endTime.split(":").map(Number);
                const shiftEnd = new Date(dayIterator);
                if (shiftToUse.isOvernight) {
                  shiftEnd.setDate(shiftEnd.getDate() + 1);
                }
                shiftEnd.setHours(endHours, endMinutes, 0, 0);

                if (lastOut > shiftEnd) {
                  const overtimeMs = lastOut.getTime() - shiftEnd.getTime();
                  overtimeHours = overtimeMs / (1000 * 60 * 60);
                  if (overtimeHours >= 0.25) {
                    totalOvertimeHours += overtimeHours;
                  }
                }
              }
            }
          } else {
            absentDays++;
          }
        }

        dailyDetails.push({
          date: dateKey,
          dayOfWeek,
          isOffDay,
          status,
          firstCheckIn,
          lastCheckOut,
          lateMinutes,
          overtimeHours: Math.round(overtimeHours * 100) / 100,
          workedHours: Math.round(workedHours * 100) / 100,
        });

        dayIterator.setDate(dayIterator.getDate() + 1);
      }

      // Salary info
      const struct = employee.salaryStructure;
      let salaryInfo = null;
      if (struct) {
        const fixedAllowances = struct.housingAllowance + struct.transportAllowance + struct.foodAllowance + struct.otherAllowances;
        let customAllowances = 0;
        for (const allowance of employee.allowances) {
          if (allowance.type === "percentage") {
            customAllowances += (struct.basicSalary * allowance.amount) / 100;
          } else {
            customAllowances += allowance.amount;
          }
        }
        let customDeductions = 0;
        for (const deduction of employee.deductions) {
          if (deduction.type === "percentage") {
            customDeductions += (struct.basicSalary * deduction.amount) / 100;
          } else {
            customDeductions += deduction.amount;
          }
        }

        const lateDeductions = lateDays * struct.deductionPerLate;
        const absentDeductions = absentDays * struct.deductionPerAbsent;
        const overtimePay = totalOvertimeHours * struct.overtimeRate;

        let loanDeduction = 0;
        for (const loan of employee.loans) {
          loanDeduction += Math.min(loan.monthlyDeduction, loan.remainingBalance);
        }

        const totalAllowances = fixedAllowances + customAllowances;
        const totalDeductionsAmount = lateDeductions + absentDeductions + customDeductions;
        const netSalary = struct.basicSalary + totalAllowances + overtimePay - totalDeductionsAmount - loanDeduction;

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
          totalLateHours: Math.round((totalLateMinutes / 60) * 100) / 100,
          totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
          totalWorkedHours: Math.round(totalWorkedHours * 100) / 100,
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

    return NextResponse.json({
      period: {
        from: dateFrom,
        to: dateTo,
      },
      employees: reportData,
      totalEmployees: reportData.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
