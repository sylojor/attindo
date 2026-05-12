import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/dashboard - Get dashboard statistics
export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Total active employees
    const totalEmployees = await db.employee.count({
      where: { isActive: true },
    });

    // Total devices
    const totalDevices = await db.device.count();

    // Online devices
    const onlineDevices = await db.device.count({
      where: { status: "online" },
    });

    // Today's attendance count
    const todayAttendance = await db.attendanceLog.count({
      where: {
        timestamp: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    // Today's check-ins specifically
    const todayCheckIns = await db.attendanceLog.count({
      where: {
        timestamp: {
          gte: today,
          lt: tomorrow,
        },
        ioMode: 0, // check-in
      },
    });

    // Calculate late arrivals today
    // An employee is "late" if their first check-in is after their shift start + grace period
    const todayLogs = await db.attendanceLog.findMany({
      where: {
        timestamp: {
          gte: today,
          lt: tomorrow,
        },
        ioMode: 0, // check-ins only
        employeeId: { not: null },
      },
      include: {
        employee: {
          include: { shift: true },
        },
      },
      orderBy: { timestamp: "asc" },
    });

    // Track first check-in per employee
    const firstCheckIns = new Map<
      string,
      { timestamp: Date; shiftStartTime: string | null; gracePeriod: number }
    >();

    for (const log of todayLogs) {
      if (!log.employeeId) continue;
      if (firstCheckIns.has(log.employeeId)) continue;

      firstCheckIns.set(log.employeeId, {
        timestamp: log.timestamp,
        shiftStartTime: log.employee?.shift?.startTime || null,
        gracePeriod: log.employee?.shift?.gracePeriod ?? 15,
      });
    }

    let lateArrivals = 0;
    for (const [, checkIn] of firstCheckIns) {
      if (checkIn.shiftStartTime) {
        const [hours, minutes] = checkIn.shiftStartTime.split(":").map(Number);
        const shiftStart = new Date(today);
        shiftStart.setHours(hours, minutes, 0, 0);
        shiftStart.setMinutes(shiftStart.getMinutes() + checkIn.gracePeriod);

        if (checkIn.timestamp > shiftStart) {
          lateArrivals++;
        }
      }
    }

    // Recent sync logs (last 10)
    const recentSyncLogs = await db.syncLog.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        device: {
          select: { id: true, name: true, status: true },
        },
      },
    });

    // Attendance chart data for last 7 days
    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(today);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayCheckIns = await db.attendanceLog.count({
        where: {
          timestamp: {
            gte: dayStart,
            lt: dayEnd,
          },
          ioMode: 0,
        },
      });

      const dayCheckOuts = await db.attendanceLog.count({
        where: {
          timestamp: {
            gte: dayStart,
            lt: dayEnd,
          },
          ioMode: 1,
        },
      });

      chartData.push({
        date: dayStart.toISOString().split("T")[0],
        dayName: dayStart.toLocaleDateString("en-US", { weekday: "short" }),
        checkIns: dayCheckIns,
        checkOuts: dayCheckOuts,
        total: dayCheckIns + dayCheckOuts,
      });
    }

    // Department breakdown
    const departmentRecords = await db.department.findMany({
      include: {
        _count: {
          select: { employees: true },
        },
      },
    });

    const departments = departmentRecords.map((d) => ({
      id: d.id,
      name: d.name,
      nameAr: d.nameAr,
      count: d._count.employees,
    }));

    // Check ZK service health with 3-second timeout
    let zkServiceStatus = "offline";
    try {
      const zkHealthRes = await fetch("http://127.0.0.1:3003/api/health", {
        signal: AbortSignal.timeout(3000),
      });
      if (zkHealthRes.ok) {
        zkServiceStatus = "online";
      }
    } catch {
      zkServiceStatus = "offline";
    }

    return NextResponse.json({
      totalEmployees,
      totalDevices,
      onlineDevices,
      todayAttendance,
      todayCheckIns,
      lateArrivals,
      recentSyncLogs,
      chartData,
      departments,
      zkServiceStatus,
      supportedProtocol: "ZKTeco ZK TCP (port 4370)",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch dashboard data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
