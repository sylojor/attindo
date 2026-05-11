import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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

      // Verify device exists
      const device = await db.device.findUnique({ where: { id: deviceId } });
      if (!device) {
        return NextResponse.json({ error: "Device not found" }, { status: 404 });
      }

      // Create sync log entry
      const syncLog = await db.syncLog.create({
        data: {
          deviceId,
          syncType: "full",
          status: "pending",
        },
      });

      // Start sync in background - NON-BLOCKING
      performDeviceSync(deviceId, syncLog.id).catch((err) => {
        console.error("[Sync] Background sync failed:", err);
      });

      return NextResponse.json(
        {
          message: "Device sync started in background",
          deviceId,
          syncLogId: syncLog.id,
          status: "syncing",
        },
        { status: 202 }
      );
    }

    if (type === "all") {
      const devices = await db.device.findMany({
        where: { isActive: true },
      });

      if (devices.length === 0) {
        return NextResponse.json(
          { error: "No active devices to sync" },
          { status: 400 }
        );
      }

      // Create sync logs for all devices
      const syncLogs = await Promise.all(
        devices.map((device) =>
          db.syncLog.create({
            data: {
              deviceId: device.id,
              syncType: "full",
              status: "pending",
            },
          })
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
        {
          message: "Sync started for all devices in background",
          deviceCount: devices.length,
          syncLogIds: syncLogs.map((sl) => sl.id),
        },
        { status: 202 }
      );
    }

    return NextResponse.json({ error: "Invalid sync type" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to trigger sync";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Perform device sync in background
async function performDeviceSync(deviceId: string, syncLogId: string) {
  try {
    // Update sync log to running
    await db.syncLog.update({
      where: { id: syncLogId },
      data: { status: "running" },
    });

    // Update device status
    await db.device.update({
      where: { id: deviceId },
      data: { status: "syncing" },
    });

    // Get employees to upload
    const employeesToUpload = await db.deviceEmployee.findMany({
      where: { deviceId, isUploaded: false },
      include: {
        employee: {
          select: { id: true, employeeId: true, name: true, fingerprintId: true },
        },
      },
    });

    const employeeData = employeesToUpload.map((de) => ({
      employeeId: de.employee.employeeId,
      name: de.employee.name,
      fingerprintId: de.fingerprintId,
    }));

    // Call ZK sync service (server-to-server, use 127.0.0.1 directly)
    const response = await fetch(`http://127.0.0.1:3003/api/sync/${deviceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employees: employeeData }),
    });

    if (!response.ok && response.status !== 202) {
      throw new Error(`ZK sync service returned ${response.status}`);
    }

    // Simulate waiting for sync completion (in production, this would be handled via socket.io events)
    // For now, we'll update the sync log after a brief delay
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Mark employees as uploaded
    await db.deviceEmployee.updateMany({
      where: { deviceId, isUploaded: false },
      data: { isUploaded: true, lastSyncAt: new Date() },
    });

    // Update sync log to completed
    await db.syncLog.update({
      where: { id: syncLogId },
      data: {
        status: "completed",
        recordsFetched: employeeData.length > 0 ? 50 : 0, // Simulated
        recordsUploaded: employeeData.length,
        completedAt: new Date(),
      },
    });

    // Update device status
    await db.device.update({
      where: { id: deviceId },
      data: {
        status: "online",
        lastSyncAt: new Date(),
      },
    });

    console.log(`[Sync] Device ${deviceId} sync completed`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Update sync log to failed
    await db.syncLog
      .update({
        where: { id: syncLogId },
        data: {
          status: "failed",
          error: errorMessage,
          completedAt: new Date(),
        },
      })
      .catch(() => {});

    // Update device status to error
    await db.device
      .update({
        where: { id: deviceId },
        data: { status: "error" },
      })
      .catch(() => {});

    console.error(`[Sync] Device ${deviceId} sync failed:`, errorMessage);
  }
}

// Perform sync for all devices in background
async function performAllDevicesSync(deviceIds: string[], syncLogIds: string[]) {
  // Sync devices sequentially to avoid overwhelming the network
  for (let i = 0; i < deviceIds.length; i++) {
    await performDeviceSync(deviceIds[i], syncLogIds[i]);
  }
}
