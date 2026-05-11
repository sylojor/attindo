import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/shifts - List all shifts
export async function GET() {
  try {
    const shifts = await db.shift.findMany({
      include: {
        _count: {
          select: {
            employees: true,
            schedules: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(shifts);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch shifts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/shifts - Create a new shift
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, nameAr, startTime, endTime, gracePeriod, isOvernight, color } = body;

    // Validate required fields
    if (!name || !startTime || !endTime) {
      return NextResponse.json(
        { error: "name, startTime, and endTime are required" },
        { status: 400 }
      );
    }

    // Validate time format (HH:mm)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return NextResponse.json(
        { error: "startTime and endTime must be in HH:mm format" },
        { status: 400 }
      );
    }

    const shift = await db.shift.create({
      data: {
        name,
        nameAr: nameAr || null,
        startTime,
        endTime,
        gracePeriod: gracePeriod !== undefined ? gracePeriod : 15,
        isOvernight: isOvernight || false,
        color: color || "#10b981",
      },
    });

    return NextResponse.json(shift, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create shift";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
