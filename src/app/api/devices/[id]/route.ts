import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const ZK_SERVICE = "http://127.0.0.1:3003";

// GET /api/devices/[id] - Get single device with full details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const device = await db.device.findUnique({
      where: { id },
      include: {
        deviceEmployees: {
          include: {
            employee: {
              select: { id: true, employeeId: true, name: true, fingerprintId: true, department: true, isActive: true },
            },
          },
        },
        syncLogs: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            attendanceLogs: true,
            syncLogs: true,
            deviceEmployees: true,
          },
        },
      },
    });

    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    // Try to get live info from ZK service
    let liveInfo = null;
    try {
      const zkRes = await fetch(`${ZK_SERVICE}/api/devices`, { signal: AbortSignal.timeout(3000) });
      if (zkRes.ok) {
        const zkDevices: any[] = await zkRes.json();
        const zkDevice = zkDevices.find((d: any) => d.id === id);
        if (zkDevice) {
          liveInfo = {
            status: zkDevice.status,
            lastSyncAt: zkDevice.lastSyncAt,
            serialNumber: zkDevice.serialNumber,
            firmware: zkDevice.firmware,
            userCount: zkDevice.userCount,
            logCount: zkDevice.logCount,
            deviceName: zkDevice.deviceName,
          };
        }
      }
    } catch {
      // ZK service might not be running, that's ok
    }

    return NextResponse.json({ ...device, liveInfo });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch device";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/devices/[id] - Update device
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { name, ip, port, deviceType, serialNumber, firmware, status, isActive, action } = body;

    const existing = await db.device.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    // Handle special actions
    if (action === "test-connection") {
      try {
        const zkRes = await fetch(`${ZK_SERVICE}/api/test-connection`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: id }),
          signal: AbortSignal.timeout(15000),
        });
        const zkData = await zkRes.json();

        // Update device info if connection successful
        if (zkData.success && zkData.info) {
          await db.device.update({
            where: { id },
            data: {
              status: "online",
              serialNumber: zkData.info.serialNumber || existing.serialNumber,
              firmware: zkData.info.firmware || existing.firmware,
            },
          });
        } else {
          await db.device.update({
            where: { id },
            data: { status: "offline" },
          });
        }

        return NextResponse.json(zkData);
      } catch (err: any) {
        await db.device.update({ where: { id }, data: { status: "error" } });
        return NextResponse.json(
          { success: false, message: `ZK service error: ${err.message}` },
          { status: 502 }
        );
      }
    }

    if (action === "restart") {
      try {
        const zkRes = await fetch(`${ZK_SERVICE}/api/restart/${id}`, {
          method: "POST",
          signal: AbortSignal.timeout(15000),
        });
        const zkData = await zkRes.json();

        await db.device.update({ where: { id }, data: { status: "offline" } });
        return NextResponse.json(zkData);
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 502 });
      }
    }

    if (action === "sync-time") {
      try {
        const zkRes = await fetch(`${ZK_SERVICE}/api/sync-time/${id}`, {
          method: "POST",
          signal: AbortSignal.timeout(15000),
        });
        const zkData = await zkRes.json();
        return NextResponse.json(zkData);
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 502 });
      }
    }

    if (action === "get-users") {
      try {
        const zkRes = await fetch(`${ZK_SERVICE}/api/users/${id}`, {
          signal: AbortSignal.timeout(15000),
        });
        const zkData = await zkRes.json();
        return NextResponse.json(zkData);
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 502 });
      }
    }

    if (action === "delete-user") {
      const { fingerprintId } = body;
      if (!fingerprintId) {
        return NextResponse.json({ error: "fingerprintId required" }, { status: 400 });
      }
      try {
        const zkRes = await fetch(`${ZK_SERVICE}/api/user/${id}/${fingerprintId}`, {
          method: "DELETE",
          signal: AbortSignal.timeout(15000),
        });
        const zkData = await zkRes.json();
        return NextResponse.json(zkData);
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 502 });
      }
    }

    // Regular update
    // Check for duplicate IP+port if being changed
    if ((ip && ip !== existing.ip) || (port && port !== existing.port)) {
      const newIp = ip || existing.ip;
      const newPort = port || existing.port;
      const duplicate = await db.device.findFirst({
        where: { ip: newIp, port: newPort, id: { not: id } },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: "A device with this IP and port already exists" },
          { status: 409 }
        );
      }
    }

    const device = await db.device.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(ip !== undefined && { ip }),
        ...(port !== undefined && { port }),
        ...(deviceType !== undefined && { deviceType }),
        ...(serialNumber !== undefined && { serialNumber }),
        ...(firmware !== undefined && { firmware }),
        ...(status !== undefined && { status }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json(device);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update device";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/devices/[id] - Delete device (also remove from ZK sync service)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.device.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    // Delete related records first
    await db.deviceEmployee.deleteMany({ where: { deviceId: id } });
    await db.syncLog.deleteMany({ where: { deviceId: id } });
    await db.attendanceLog.deleteMany({ where: { deviceId: id } });

    // Delete the device
    await db.device.delete({ where: { id } });

    // Remove from ZK sync service (non-blocking)
    removeDeviceFromZK(id).catch((err) => {
      console.error("[Devices] Failed to remove from ZK sync service:", err);
    });

    return NextResponse.json({
      message: "Device deleted successfully",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete device";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Remove device from ZK sync service
async function removeDeviceFromZK(deviceId: string) {
  try {
    await fetch(`${ZK_SERVICE}/api/devices/${deviceId}`, {
      method: "DELETE",
    });
    console.log(`[Devices] Removed device ${deviceId} from ZK sync service`);
  } catch (err) {
    console.error("[Devices] ZK removal error:", err);
  }
}
