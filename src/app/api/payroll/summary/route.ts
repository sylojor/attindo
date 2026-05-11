import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/payroll/summary - Get payroll summary/stats
export async function GET() {
  try {
    // Total employees with salary structures
    const employeesWithSalary = await db.salaryStructure.count();

    // Latest completed payroll period
    const latestPeriod = await db.payrollPeriod.findFirst({
      where: {
        status: { in: ["completed", "approved"] },
      },
      include: {
        _count: {
          select: { paySlips: true },
        },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    // Total monthly payroll from latest period
    const totalMonthlyPayroll = latestPeriod?.totalNet ?? 0;
    const totalMonthlyGross = latestPeriod?.totalGross ?? 0;
    const totalMonthlyDeductions = latestPeriod?.totalDeductions ?? 0;

    // Average salary across all salary structures
    const salaryStats = await db.salaryStructure.aggregate({
      _avg: { basicSalary: true, housingAllowance: true, transportAllowance: true },
      _sum: { basicSalary: true },
      _count: true,
    });

    const averageSalary = salaryStats._avg.basicSalary ?? 0;
    const averageHousing = salaryStats._avg.housingAllowance ?? 0;
    const averageTransport = salaryStats._avg.transportAllowance ?? 0;

    // Department salary breakdown
    const salaryStructures = await db.salaryStructure.findMany({
      include: {
        employee: {
          select: {
            department: true,
          },
        },
      },
    });

    const departmentMap = new Map<string, { count: number; totalBasic: number; totalAllowances: number }>();
    for (const ss of salaryStructures) {
      const dept = ss.employee.department || "Unassigned";
      const existing = departmentMap.get(dept) || { count: 0, totalBasic: 0, totalAllowances: 0 };
      existing.count++;
      existing.totalBasic += ss.basicSalary;
      existing.totalAllowances += ss.housingAllowance + ss.transportAllowance +
        ss.foodAllowance + ss.otherAllowances;
      departmentMap.set(dept, existing);
    }

    const departmentBreakdown = Array.from(departmentMap.entries()).map(
      ([department, data]) => ({
        department,
        employeeCount: data.count,
        totalBasic: data.totalBasic,
        totalAllowances: data.totalAllowances,
        totalCompensation: data.totalBasic + data.totalAllowances,
        averageBasic: data.count > 0 ? data.totalBasic / data.count : 0,
      })
    );

    // Recent payroll periods with totals
    const recentPeriods = await db.payrollPeriod.findMany({
      take: 6,
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: {
        _count: {
          select: { paySlips: true },
        },
      },
    });

    // PaySlip status counts for latest period
    let paidCount = 0;
    let pendingCount = 0;
    if (latestPeriod) {
      const payslipStatusCounts = await db.paySlip.groupBy({
        by: ["status"],
        where: { payrollPeriodId: latestPeriod.id },
        _count: { status: true },
      });

      for (const entry of payslipStatusCounts) {
        if (entry.status === "paid") {
          paidCount = entry._count.status;
        } else {
          pendingCount += entry._count.status;
        }
      }
    }

    return NextResponse.json({
      employeesWithSalary,
      totalEmployees: await db.employee.count({ where: { isActive: true } }),
      latestPeriod: latestPeriod
        ? {
            id: latestPeriod.id,
            name: latestPeriod.name,
            month: latestPeriod.month,
            year: latestPeriod.year,
            status: latestPeriod.status,
            totalGross: latestPeriod.totalGross,
            totalDeductions: latestPeriod.totalDeductions,
            totalNet: latestPeriod.totalNet,
            payslipCount: latestPeriod._count.paySlips,
            paidCount,
            pendingCount,
          }
        : null,
      totalMonthlyPayroll,
      totalMonthlyGross,
      totalMonthlyDeductions,
      averageSalary,
      averageHousing,
      averageTransport,
      totalBasicSum: salaryStats._sum.basicSalary ?? 0,
      departmentBreakdown,
      recentPeriods: recentPeriods.map((p) => ({
        id: p.id,
        name: p.name,
        month: p.month,
        year: p.year,
        status: p.status,
        totalGross: p.totalGross,
        totalDeductions: p.totalDeductions,
        totalNet: p.totalNet,
        payslipCount: p._count.paySlips,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch payroll summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
