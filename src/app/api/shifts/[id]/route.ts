import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/shifts/[id] - Get single shift
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const shift = await db.shift.findUnique({
      where: { id },
      include: {
        employees: {
          where: { isActive: true },
          select: {
            id: true,
            employeeId: true,
            name: true,
            nameAr: true,
            department: true,
            position: true,
          },
        },
        schedules: {
          include: {
            employee: {
              select: { id: true, name: true, employeeId: true },
            },
          },
          orderBy: { effectiveDate: "desc" },
        },
        _count: {
          select: {
            employees: true,
            schedules: true,
          },
        },
      },
    });

    if (!shift) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }

    return NextResponse.json(shift);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch shift";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/shifts/[id] - Update shift
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { name, nameAr, startTime, endTime, gracePeriod, isOvernight, color } = body;

    const existing = await db.shift.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }

    // Validate time format if being changed
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (startTime && !timeRegex.test(startTime)) {
      return NextResponse.json(
        { error: "startTime must be in HH:mm format" },
        { status: 400 }
      );
    }
    if (endTime && !timeRegex.test(endTime)) {
      return NextResponse.json(
        { error: "endTime must be in HH:mm format" },
        { status: 400 }
      );
    }

    const shift = await db.shift.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(nameAr !== undefined && { nameAr }),
        ...(startTime !== undefined && { startTime }),
        ...(endTime !== undefined && { endTime }),
        ...(gracePeriod !== undefined && { gracePeriod }),
        ...(isOvernight !== undefined && { isOvernight }),
        ...(color !== undefined && { color }),
      },
    });

    return NextResponse.json(shift);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update shift";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/shifts/[id] - Delete shift
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.shift.findUnique({
      where: { id },
      include: {
        _count: {
          select: { employees: true, schedules: true },
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }

    // Unassign employees from this shift
    await db.employee.updateMany({
      where: { shiftId: id },
      data: { shiftId: null },
    });

    // Delete schedules for this shift
    await db.schedule.deleteMany({
      where: { shiftId: id },
    });

    // Delete the shift
    await db.shift.delete({ where: { id } });

    return NextResponse.json({
      message: "Shift deleted successfully",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete shift";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
