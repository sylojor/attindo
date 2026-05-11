import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// GET /api/payroll/periods - List payroll periods
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";
    const year = searchParams.get("year") || "";

    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }

    if (year) {
      where.year = parseInt(year, 10);
    }

    const periods = await db.payrollPeriod.findMany({
      where,
      include: {
        _count: {
          select: { paySlips: true },
        },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    return NextResponse.json(periods);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch payroll periods";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/payroll/periods - Create a new payroll period
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { month, year, name } = body;

    if (!month || !year) {
      return NextResponse.json(
        { error: "month and year are required" },
        { status: 400 }
      );
    }

    if (month < 1 || month > 12) {
      return NextResponse.json(
        { error: "month must be between 1 and 12" },
        { status: 400 }
      );
    }

    // Check for duplicate month/year
    const existing = await db.payrollPeriod.findUnique({
      where: { month_year: { month, year } },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Payroll period for ${MONTH_NAMES[month - 1]} ${year} already exists` },
        { status: 409 }
      );
    }

    // Calculate start and end dates
    const startDate = new Date(year, month - 1, 1);
    // Last day of the month: day 0 of next month
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const periodName = name || `${MONTH_NAMES[month - 1]} ${year}`;

    const period = await db.payrollPeriod.create({
      data: {
        name: periodName,
        month,
        year,
        startDate,
        endDate,
      },
      include: {
        _count: {
          select: { paySlips: true },
        },
      },
    });

    return NextResponse.json(period, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create payroll period";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
