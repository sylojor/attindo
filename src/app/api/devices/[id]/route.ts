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
              select: { id: true, employeeId: true, name: true, fingerprintId: true, department: { select: { id: true, name: true, nameAr: true } }, isActive: true },
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
            deviceModel: zkDevice.deviceModel,
            capabilities: zkDevice.capabilities,
            fingerCount: zkDevice.fingerCount,
            faceCount: zkDevice.faceCount,
            palmCount: zkDevice.palmCount,
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

    const { name, ip, port, deviceType, deviceModel, capabilities, serialNumber, firmware, status, isActive, action } = body;

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
          // Convert capabilities array to comma-separated string for Prisma
          const capabilitiesStr = Array.isArray(zkData.info.capabilities)
            ? zkData.info.capabilities.join(",")
            : zkData.info.capabilities;
          await db.device.update({
            where: { id },
            data: {
              status: "online",
              serialNumber: zkData.info.serialNumber || existing.serialNumber,
              firmware: zkData.info.firmware || existing.firmware,
              // Update capabilities and counts from ZK service if available
              ...(zkData.info.deviceModel && { deviceModel: zkData.info.deviceModel }),
              ...(capabilitiesStr && { capabilities: capabilitiesStr }),
              ...(zkData.info.fingerCount !== undefined && { fingerCount: zkData.info.fingerCount }),
              ...(zkData.info.faceCount !== undefined && { faceCount: zkData.info.faceCount }),
              ...(zkData.info.palmCount !== undefined && { palmCount: zkData.info.palmCount }),
              ...(zkData.info.userCount !== undefined && { userCount: zkData.info.userCount }),
              ...(zkData.info.logCount !== undefined && { logCount: zkData.info.logCount }),
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
        const isZKDown = err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed');
        return NextResponse.json(
          { success: false, message: isZKDown ? "ZK service is not running. Start the fingerprint device service first." : `Connection error: ${err.message}` },
          { status: 503 }
        );
      }
    }

    if (action === "detect-capabilities") {
      try {
        const zkRes = await fetch(`${ZK_SERVICE}/api/test-connection`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: id }),
          signal: AbortSignal.timeout(15000),
        });
        const zkData = await zkRes.json();

        if (zkData.success && zkData.info) {
          const detectedModel = zkData.info.deviceModel || existing.deviceModel;
          const detectedCapabilities = zkData.info.capabilities || existing.capabilities;
          // Convert capabilities array to comma-separated string for Prisma
          const capabilitiesStr = Array.isArray(detectedCapabilities)
            ? detectedCapabilities.join(",")
            : detectedCapabilities;

          // Update device with detected capabilities and model
          await db.device.update({
            where: { id },
            data: {
              status: "online",
              serialNumber: zkData.info.serialNumber || existing.serialNumber,
              firmware: zkData.info.firmware || existing.firmware,
              ...(detectedModel && { deviceModel: detectedModel }),
              ...(capabilitiesStr && { capabilities: capabilitiesStr }),
              ...(zkData.info.fingerCount !== undefined && { fingerCount: zkData.info.fingerCount }),
              ...(zkData.info.faceCount !== undefined && { faceCount: zkData.info.faceCount }),
              ...(zkData.info.palmCount !== undefined && { palmCount: zkData.info.palmCount }),
              ...(zkData.info.userCount !== undefined && { userCount: zkData.info.userCount }),
              ...(zkData.info.logCount !== undefined && { logCount: zkData.info.logCount }),
            },
          });

          // Update DeviceEmployee hasFinger flags based on detected capabilities
          const supportsFinger = detectedCapabilities?.includes("fingerprint") ?? existing.capabilities.includes("fingerprint");
          const supportsFace = detectedCapabilities?.includes("face") ?? existing.capabilities.includes("face");
          const supportsPalm = detectedCapabilities?.includes("palm") ?? existing.capabilities.includes("palm");

          await db.deviceEmployee.updateMany({
            where: { deviceId: id },
            data: {
              hasFinger: supportsFinger,
              hasFace: supportsFace,
              hasPalm: supportsPalm,
            },
          });

          return NextResponse.json({
            success: true,
            detected: {
              deviceModel: detectedModel,
              capabilities: detectedCapabilities,
              fingerCount: zkData.info.fingerCount ?? 0,
              faceCount: zkData.info.faceCount ?? 0,
              palmCount: zkData.info.palmCount ?? 0,
              userCount: zkData.info.userCount ?? 0,
              logCount: zkData.info.logCount ?? 0,
              serialNumber: zkData.info.serialNumber,
              firmware: zkData.info.firmware,
            },
          });
        } else {
          await db.device.update({ where: { id }, data: { status: "offline" } });
          return NextResponse.json(
            { success: false, message: "Device is offline or unreachable" },
            { status: 503 }
          );
        }
      } catch (err: any) {
        await db.device.update({ where: { id }, data: { status: "error" } });
        const isZKDown = err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed');
        return NextResponse.json(
          { success: false, message: isZKDown ? "ZK service is not running. Start the fingerprint device service first." : `Connection error: ${err.message}` },
          { status: 503 }
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
        const isZKDown = err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed');
        return NextResponse.json({ error: isZKDown ? "ZK service is not running" : err.message }, { status: 503 });
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
        const isZKDown = err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed');
        return NextResponse.json({ error: isZKDown ? "ZK service is not running" : err.message }, { status: 503 });
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
        const isZKDown = err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed');
        return NextResponse.json({ error: isZKDown ? "ZK service is not running" : err.message }, { status: 503 });
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
        const isZKDown = err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed');
        return NextResponse.json({ error: isZKDown ? "ZK service is not running" : err.message }, { status: 503 });
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
        ...(deviceModel !== undefined && { deviceModel }),
        ...(capabilities !== undefined && { capabilities }),
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
      // ZK service removal is optional - don't log as error
      // console.error("[Devices] Failed to remove from ZK sync service:", err);
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
    // ZK service removal is optional - silent fail
    // console.error("[Devices] ZK removal error:", err);
  }
}
