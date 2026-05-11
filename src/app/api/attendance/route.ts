import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/attendance - List attendance logs with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const employeeId = searchParams.get("employeeId") || "";
    const deviceId = searchParams.get("deviceId") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";
    const verifyMode = searchParams.get("verifyMode") || "";

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (deviceId) {
      where.deviceId = deviceId;
    }

    if (verifyMode) {
      where.verifyMode = verifyMode;
    }

    // Date range filter
    if (dateFrom || dateTo) {
      const timestampFilter: Record<string, Date> = {};
      if (dateFrom) {
        timestampFilter.gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Add one day to include the end date fully
        const endDate = new Date(dateTo);
        endDate.setDate(endDate.getDate() + 1);
        timestampFilter.lt = endDate;
      }
      where.timestamp = timestampFilter;
    }

    const [logs, total] = await Promise.all([
      db.attendanceLog.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              name: true,
              nameAr: true,
              department: true,
              position: true,
            },
          },
          device: {
            select: {
              id: true,
              name: true,
              ip: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { timestamp: "desc" },
      }),
      db.attendanceLog.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch attendance logs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
