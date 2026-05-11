import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT /api/schedules/[id] - Update schedule
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { employeeId, shiftId, effectiveDate, dayOfWeek, endDate } = body;

    const existing = await db.schedule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Validate employee if being changed
    if (employeeId) {
      const employee = await db.employee.findUnique({ where: { id: employeeId } });
      if (!employee) {
        return NextResponse.json({ error: "Employee not found" }, { status: 404 });
      }
    }

    // Validate shift if being changed
    if (shiftId) {
      const shift = await db.shift.findUnique({ where: { id: shiftId } });
      if (!shift) {
        return NextResponse.json({ error: "Shift not found" }, { status: 404 });
      }
    }

    // Validate dayOfWeek if provided
    if (dayOfWeek !== undefined && dayOfWeek !== null && (dayOfWeek < 0 || dayOfWeek > 6)) {
      return NextResponse.json(
        { error: "dayOfWeek must be between 0 (Sunday) and 6 (Saturday)" },
        { status: 400 }
      );
    }

    const schedule = await db.schedule.update({
      where: { id },
      data: {
        ...(employeeId !== undefined && { employeeId }),
        ...(shiftId !== undefined && { shiftId }),
        ...(effectiveDate !== undefined && { effectiveDate: new Date(effectiveDate) }),
        ...(dayOfWeek !== undefined && { dayOfWeek }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      },
      include: {
        employee: {
          select: { id: true, name: true, employeeId: true },
        },
        shift: true,
      },
    });

    return NextResponse.json(schedule);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update schedule";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/schedules/[id] - Delete schedule
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.schedule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    await db.schedule.delete({ where: { id } });

    return NextResponse.json({
      message: "Schedule deleted successfully",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete schedule";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
