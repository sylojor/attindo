import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/holidays - List all holidays, ordered by date desc
export async function GET() {
  try {
    const holidays = await db.holiday.findMany({
      orderBy: { date: "desc" },
    });

    return NextResponse.json(holidays);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch holidays";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/holidays - Create a new holiday
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, name, nameAr, isRecurring } = body;

    // Validate required fields
    if (!date || !name) {
      return NextResponse.json(
        { error: "date and name are required" },
        { status: 400 }
      );
    }

    // Parse and validate date
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 }
      );
    }

    // Check for duplicate date
    const dateStr = parsedDate.toISOString().split("T")[0];
    const allHolidays = await db.holiday.findMany();
    const existing = allHolidays.find((h) => {
      const hDateStr = new Date(h.date).toISOString().split("T")[0];
      return hDateStr === dateStr;
    });
    if (existing) {
      return NextResponse.json(
        { error: "A holiday on this date already exists" },
        { status: 409 }
      );
    }

    const holiday = await db.holiday.create({
      data: {
        date: parsedDate,
        name,
        nameAr: nameAr || null,
        isRecurring: typeof isRecurring === "boolean" ? isRecurring : false,
      },
    });

    return NextResponse.json(holiday, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create holiday";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
