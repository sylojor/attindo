import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT /api/holidays/[id] - Update a holiday
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, nameAr, isRecurring, date } = body;

    // Check if holiday exists
    const existing = await db.holiday.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
    }

    // If date is being changed, validate and check for duplicates
    if (date !== undefined) {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid date format" },
          { status: 400 }
        );
      }

      // Check for duplicate date (excluding current record)
      const dateStr = parsedDate.toISOString().split("T")[0];
      const allHolidays = await db.holiday.findMany();
      const duplicate = allHolidays.find((h) => {
        if (h.id === id) return false;
        const hDateStr = new Date(h.date).toISOString().split("T")[0];
        return hDateStr === dateStr;
      });
      if (duplicate && duplicate.id !== id) {
        return NextResponse.json(
          { error: "A holiday on this date already exists" },
          { status: 409 }
        );
      }
    }

    const holiday = await db.holiday.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(nameAr !== undefined && { nameAr }),
        ...(isRecurring !== undefined && { isRecurring }),
        ...(date !== undefined && { date: new Date(date) }),
      },
    });

    return NextResponse.json(holiday);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update holiday";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/holidays/[id] - Delete a holiday
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if holiday exists
    const existing = await db.holiday.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
    }

    await db.holiday.delete({ where: { id } });

    return NextResponse.json({ message: "Holiday deleted successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete holiday";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
