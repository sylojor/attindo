import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const ZK_SERVICE_URL = "http://127.0.0.1:3003";
const ZK_TIMEOUT = 10000; // 10 seconds timeout for ZK service calls

// POST /api/sync - Trigger sync operations (NON-BLOCKING)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, deviceId } = body;

    if (!type || !["device", "all"].includes(type)) {
      return NextResponse.json(
        { error: "type must be 'device' or 'all'" },
        { status: 400 }
      );
    }

    if (type === "device") {
      if (!deviceId) {
        return NextResponse.json(
          { error: "deviceId is required for device sync" },
          { status: 400 }
        );
      }

      const device = await db.device.findUnique({ where: { id: deviceId } });
      if (!device) {
        return NextResponse.json({ error: "Device not found" }, { status: 404 });
      }

      const syncLog = await db.syncLog.create({
        data: { deviceId, syncType: "full", status: "pending" },
      });

      // Start sync in background - NON-BLOCKING
      performDeviceSync(deviceId, syncLog.id).catch((err) => {
        console.error("[Sync] Background sync failed:", err);
      });

      return NextResponse.json(
        { message: "Device sync started in background", deviceId, syncLogId: syncLog.id, status: "syncing" },
        { status: 202 }
      );
    }

    if (type === "all") {
      const devices = await db.device.findMany({ where: { isActive: true } });

      if (devices.length === 0) {
        return NextResponse.json({ message: "No active devices to sync", deviceCount: 0 }, { status: 200 });
      }

      // First, ensure all devices are registered with the ZK service
      await registerDevicesWithZKService(devices);

      const syncLogs = await Promise.all(
        devices.map((device) =>
          db.syncLog.create({ data: { deviceId: device.id, syncType: "full", status: "pending" } })
        )
      );

      // Start sync for all devices in background - NON-BLOCKING
      performAllDevicesSync(
        devices.map((d) => d.id),
        syncLogs.map((sl) => sl.id)
      ).catch((err) => {
        console.error("[Sync] Background sync-all failed:", err);
      });

      return NextResponse.json(
        { message: "Sync started for all devices in background", deviceCount: devices.length, syncLogIds: syncLogs.map((sl) => sl.id) },
        { status: 202 }
      );
    }

    return NextResponse.json({ error: "Invalid sync type" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to trigger sync";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Register all DB devices with the ZK service
async function registerDevicesWithZKService(devices: Array<{ id: string; name: string; ip: string; port: number }>) {
  try {
    // Get current ZK service device list
    const res = await fetch(`${ZK_SERVICE_URL}/api/devices`, {
      signal: AbortSignal.timeout(ZK_TIMEOUT),
    });
    if (!res.ok) return;

    const zkDevices: Array<{ id: string }> = await res.json();
    const zkDeviceIds = new Set(zkDevices.map((d) => d.id));

    // Register any devices that aren't in the ZK service yet
    for (const device of devices) {
      if (!zkDeviceIds.has(device.id)) {
        try {
          await fetch(`${ZK_SERVICE_URL}/api/devices`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: device.id, name: device.name, ip: device.ip, port: device.port }),
            signal: AbortSignal.timeout(ZK_TIMEOUT),
          });
        } catch {
          // Ignore registration failures
        }
      }
    }
  } catch {
    // ZK service may be down
  }
}

// Perform device sync in background
async function performDeviceSync(deviceId: string, syncLogId: string) {
  try {
    await db.syncLog.update({ where: { id: syncLogId }, data: { status: "running" } });
    await db.device.update({ where: { id: deviceId }, data: { status: "syncing" } });

    // Get employees to upload
    const employeesToUpload = await db.deviceEmployee.findMany({
      where: { deviceId, isUploaded: false },
      include: { employee: { select: { id: true, employeeId: true, name: true, fingerprintId: true } } },
    });

    const employeeData = employeesToUpload.map((de) => ({
      employeeId: de.employee.employeeId,
      name: de.employee.name,
      fingerprintId: de.fingerprintId,
    }));

    // Get device info for ZK service
    const device = await db.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error("Device not found");

    // Ensure device is registered with ZK service
    await registerDevicesWithZKService([device]);

    // Call ZK sync service with timeout
    let zkSyncStarted = false;
    try {
      const response = await fetch(`${ZK_SERVICE_URL}/api/sync/${deviceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employees: employeeData, clearAfterRead: true }),
        signal: AbortSignal.timeout(ZK_TIMEOUT),
      });

      if (response.status === 404) {
        throw new Error("Device not found in ZK service - may need re-registration");
      }
      if (!response.ok && response.status !== 202) {
        throw new Error(`ZK sync service returned ${response.status}`);
      }
      zkSyncStarted = true;
    } catch (zkErr: any) {
      // If ZK service is unreachable, fail fast
      const errMsg = zkErr.name === "TimeoutError"
        ? "Connection to device timed out (device may be offline)"
        : `ZK service: ${zkErr.message}`;
      throw new Error(errMsg);
    }

    // Wait for sync to complete - poll with timeout (max 30 seconds)
    if (zkSyncStarted) {
      const pollStart = Date.now();
      while (Date.now() - pollStart < 30000) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const dev = await db.device.findUnique({ where: { id: deviceId } });
        if (dev && dev.status !== "syncing") break;
      }
    }

    // Mark employees as uploaded
    await db.deviceEmployee.updateMany({
      where: { deviceId, isUploaded: false },
      data: { isUploaded: true, lastSyncAt: new Date() },
    });

    // Try to fetch and save attendance data
    try {
      const attendanceRes = await fetch(`${ZK_SERVICE_URL}/api/attendance/${deviceId}`, {
        signal: AbortSignal.timeout(ZK_TIMEOUT),
      });
      if (attendanceRes.ok) {
        const attendanceRecords = await attendanceRes.json();
        if (Array.isArray(attendanceRecords) && attendanceRecords.length > 0) {
          await saveAttendanceRecords(deviceId, attendanceRecords);
        }
      }
    } catch {
      // Attendance fetch failed, but sync itself may have worked
    }

    // Update device status to online and sync device info from ZK service
    try {
      const deviceInfoRes = await fetch(`${ZK_SERVICE_URL}/api/devices`, {
        signal: AbortSignal.timeout(ZK_TIMEOUT),
      });
      if (deviceInfoRes.ok) {
        const zkDevices: any[] = await deviceInfoRes.json();
        const zkDevice = zkDevices.find((d: any) => d.id === deviceId);
        if (zkDevice) {
          // Convert capabilities array to comma-separated string for Prisma
          const capabilitiesStr = Array.isArray(zkDevice.capabilities)
            ? zkDevice.capabilities.join(",")
            : zkDevice.capabilities;
          await db.device.update({
            where: { id: deviceId },
            data: {
              status: "online",
              lastSyncAt: new Date(),
              ...(zkDevice.deviceModel && { deviceModel: zkDevice.deviceModel }),
              ...(capabilitiesStr && { capabilities: capabilitiesStr }),
              ...(zkDevice.fingerCount !== undefined && { fingerCount: zkDevice.fingerCount }),
              ...(zkDevice.faceCount !== undefined && { faceCount: zkDevice.faceCount }),
              ...(zkDevice.palmCount !== undefined && { palmCount: zkDevice.palmCount }),
              ...(zkDevice.userCount !== undefined && { userCount: zkDevice.userCount }),
              ...(zkDevice.logCount !== undefined && { logCount: zkDevice.logCount }),
            },
          });
        } else {
          await db.device.update({
            where: { id: deviceId },
            data: { status: "online", lastSyncAt: new Date() },
          });
        }
      } else {
        await db.device.update({
          where: { id: deviceId },
          data: { status: "online", lastSyncAt: new Date() },
        });
      }
    } catch {
      await db.device.update({
        where: { id: deviceId },
        data: { status: "online", lastSyncAt: new Date() },
      }).catch(() => {});
    }

    // Count saved records
    const savedCount = await db.attendanceLog.count({
      where: { deviceId, syncedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } },
    });

    await db.syncLog.update({
      where: { id: syncLogId },
      data: { status: "completed", recordsFetched: savedCount, recordsUploaded: employeeData.length, completedAt: new Date() },
    });

    console.log(`[Sync] Device ${deviceId} sync completed: ${savedCount} attendance records`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await db.syncLog.update({
      where: { id: syncLogId },
      data: { status: "failed", error: errorMessage.substring(0, 500), completedAt: new Date() },
    }).catch(() => {});

    await db.device.update({
      where: { id: deviceId },
      data: { status: "error" },
    }).catch(() => {});

    console.error(`[Sync] Device ${deviceId} sync failed:`, errorMessage);
  }
}

// Save attendance records from ZK device to database
async function saveAttendanceRecords(deviceId: string, records: Array<{
  userId: number; timestamp: string; verifyMode: number; ioMode: number; workCode: number;
}>) {
  let saved = 0;
  let skipped = 0;

  const verifyModeMap: Record<number, string> = {
    0: "fingerprint", 1: "fingerprint", 2: "card", 3: "password",
    4: "face", 5: "palm", 6: "iris", 7: "vein",
    8: "face+password", 9: "palm+password", 10: "finger+password",
    11: "face+finger", 12: "card+password", 13: "finger+card",
  };
  const ioModeMap: Record<number, string> = {
    0: "check-in", 1: "check-out", 4: "check-in", 5: "check-out",
  };

  for (const record of records) {
    try {
      const employee = await db.employee.findFirst({
        where: { fingerprintId: record.userId, isActive: true },
      });
      const timestamp = new Date(record.timestamp);

      const existing = await db.attendanceLog.findFirst({
        where: {
          deviceId,
          timestamp: { gte: new Date(timestamp.getTime() - 1000), lte: new Date(timestamp.getTime() + 1000) },
          ...(employee ? { employeeId: employee.id } : {}),
        },
      });

      if (existing) { skipped++; continue; }

      await db.attendanceLog.create({
        data: {
          employeeId: employee?.id || null, deviceId, timestamp,
          verifyMode: verifyModeMap[record.verifyMode] || "fingerprint",
          status: ioModeMap[record.ioMode] || "check-in",
          ioMode: record.ioMode, workCode: record.workCode, syncedAt: new Date(),
        },
      });
      saved++;
    } catch (err: any) {
      console.warn(`[Sync] Failed to save attendance (userId:${record.userId}):`, err.message);
    }
  }
  console.log(`[Sync] Attendance save: ${saved} saved, ${skipped} skipped`);
}

// Perform sync for all devices in background
async function performAllDevicesSync(deviceIds: string[], syncLogIds: string[]) {
  for (let i = 0; i < deviceIds.length; i++) {
    await performDeviceSync(deviceIds[i], syncLogIds[i]);
  }
}

// GET /api/sync - Get sync status
export async function GET() {
  try {
    const recentSyncs = await db.syncLog.findMany({
      take: 20, orderBy: { startedAt: "desc" },
      include: { device: { select: { name: true, ip: true, status: true } } },
    });
    const activeSyncs = recentSyncs.filter((s) => s.status === "running" || s.status === "pending");
    return NextResponse.json({ activeSyncs: activeSyncs.length, recentSyncs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch sync status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
