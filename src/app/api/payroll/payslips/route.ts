import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/payroll/payslips - List payslips with filters and pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const payrollPeriodId = searchParams.get("payrollPeriodId") || "";
    const employeeId = searchParams.get("employeeId") || "";
    const status = searchParams.get("status") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (payrollPeriodId) {
      where.payrollPeriodId = payrollPeriodId;
    }

    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (status) {
      where.status = status;
    }

    const [payslips, total] = await Promise.all([
      db.paySlip.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              name: true,
              nameAr: true,
              department: { select: { id: true, name: true, nameAr: true } },
              position: true,
              isActive: true,
            },
          },
          payrollPeriod: {
            select: {
              id: true,
              name: true,
              month: true,
              year: true,
              status: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      db.paySlip.count({ where }),
    ]);

    return NextResponse.json({
      payslips,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch payslips";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
