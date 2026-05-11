import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/schedules - List schedules with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId") || "";
    const shiftId = searchParams.get("shiftId") || "";

    const where: Record<string, unknown> = {};

    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (shiftId) {
      where.shiftId = shiftId;
    }

    const schedules = await db.schedule.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            name: true,
            nameAr: true,
            department: true,
          },
        },
        shift: true,
      },
      orderBy: { effectiveDate: "desc" },
    });

    return NextResponse.json(schedules);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch schedules";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/schedules - Create a schedule
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employeeId, shiftId, effectiveDate, dayOfWeek, isOffDay, endDate } = body;

    // Validate required fields
    if (!employeeId || !shiftId || !effectiveDate) {
      return NextResponse.json(
        { error: "employeeId, shiftId, and effectiveDate are required" },
        { status: 400 }
      );
    }

    // Validate employee exists
    const employee = await db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Validate shift exists
    const shift = await db.shift.findUnique({ where: { id: shiftId } });
    if (!shift) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }

    // Validate dayOfWeek if provided
    if (dayOfWeek !== undefined && dayOfWeek !== null && (dayOfWeek < 0 || dayOfWeek > 6)) {
      return NextResponse.json(
        { error: "dayOfWeek must be between 0 (Sunday) and 6 (Saturday)" },
        { status: 400 }
      );
    }

    const schedule = await db.schedule.create({
      data: {
        employeeId,
        shiftId,
        effectiveDate: new Date(effectiveDate),
        dayOfWeek: dayOfWeek !== undefined ? dayOfWeek : null,
        isOffDay: isOffDay === true,
        endDate: endDate ? new Date(endDate) : null,
      },
      include: {
        employee: {
          select: { id: true, name: true, employeeId: true },
        },
        shift: true,
      },
    });

    return NextResponse.json(schedule, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create schedule";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
