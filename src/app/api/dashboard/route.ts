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
    }).catch(() => 0);

    // Total devices
    const totalDevices = await db.device.count().catch(() => 0);

    // Online devices
    const onlineDevices = await db.device.count({
      where: { status: "online" },
    }).catch(() => 0);

    // Today's attendance count
    const todayAttendance = await db.attendanceLog.count({
      where: {
        timestamp: {
          gte: today,
          lt: tomorrow,
        },
      },
    }).catch(() => 0);

    // Today's check-ins specifically
    const todayCheckIns = await db.attendanceLog.count({
      where: {
        timestamp: {
          gte: today,
          lt: tomorrow,
        },
        ioMode: 0,
      },
    }).catch(() => 0);

    // Calculate late arrivals today
    let lateArrivals = 0;
    try {
      const todayLogs = await db.attendanceLog.findMany({
        where: {
          timestamp: {
            gte: today,
            lt: tomorrow,
          },
          ioMode: 0,
          employeeId: { not: null },
        },
        include: {
          employee: {
            include: { shift: true },
          },
        },
        orderBy: { timestamp: "asc" },
      });

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
    } catch (e) {
      console.error("[Dashboard] Late arrivals calc error:", e);
      lateArrivals = 0;
    }

    // Recent sync logs (last 10)
    let recentSyncLogs: Array<{
      id: string;
      syncType: string;
      status: string;
      recordsFetched: number;
      recordsUploaded: number;
      startedAt: string;
      completedAt: string | null;
      error: string | null;
      device: { id: string; name: string; status: string };
    }> = [];
    try {
      recentSyncLogs = await db.syncLog.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          device: {
            select: { id: true, name: true, status: true },
          },
        },
      });
    } catch (e) {
      console.error("[Dashboard] Sync logs fetch error:", e);
    }

    // Attendance chart data for last 7 days
    const chartData: Array<{
      date: string;
      dayName: string;
      checkIns: number;
      checkOuts: number;
      total: number;
    }> = [];
    try {
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(today);
        dayStart.setDate(dayStart.getDate() - i);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const dayCheckIns = await db.attendanceLog.count({
          where: {
            timestamp: { gte: dayStart, lt: dayEnd },
            ioMode: 0,
          },
        }).catch(() => 0);

        const dayCheckOuts = await db.attendanceLog.count({
          where: {
            timestamp: { gte: dayStart, lt: dayEnd },
            ioMode: 1,
          },
        }).catch(() => 0);

        chartData.push({
          date: dayStart.toISOString().split("T")[0],
          dayName: dayStart.toLocaleDateString("en-US", { weekday: "short" }),
          checkIns: dayCheckIns,
          checkOuts: dayCheckOuts,
          total: dayCheckIns + dayCheckOuts,
        });
      }
    } catch (e) {
      console.error("[Dashboard] Chart data error:", e);
    }

    // Department breakdown
    let departments: Array<{ id: string; name: string; nameAr: string | null; count: number }> = [];
    try {
      const departmentRecords = await db.department.findMany({
        include: {
          _count: {
            select: { employees: true },
          },
        },
      });

      departments = departmentRecords.map((d) => ({
        id: d.id,
        name: d.name,
        nameAr: d.nameAr,
        count: d._count.employees,
      }));
    } catch (e) {
      console.error("[Dashboard] Departments fetch error:", e);
    }

    // Check ZK service health with 2-second timeout (non-blocking)
    let zkServiceStatus = "offline";
    try {
      const zkHealthRes = await fetch("http://127.0.0.1:3003/api/health", {
        signal: AbortSignal.timeout(2000),
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
    console.error("[Dashboard] Fatal error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
