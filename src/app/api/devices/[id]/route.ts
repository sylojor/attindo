import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/devices/[id] - Get single device
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
            employee: true,
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

    return NextResponse.json(device);
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

    const { name, ip, port, deviceType, serialNumber, firmware, status, isActive } = body;

    const existing = await db.device.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

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
    await fetch(`http://127.0.0.1:3003/api/devices/${deviceId}`, {
      method: "DELETE",
    });
    console.log(`[Devices] Removed device ${deviceId} from ZK sync service`);
  } catch (err) {
    console.error("[Devices] ZK removal error:", err);
  }
}
