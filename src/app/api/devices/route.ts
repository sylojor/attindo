import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const MAX_DEVICES = 6; // Free tier limit

// GET /api/devices - List all devices with status
export async function GET() {
  try {
    const devices = await db.device.findMany({
      include: {
        _count: {
          select: {
            attendanceLogs: true,
            syncLogs: true,
            deviceEmployees: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(devices);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch devices";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/devices - Create/register a new device
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, ip, port, deviceType, serialNumber, firmware } = body;

    // Validate required fields
    if (!name || !ip) {
      return NextResponse.json(
        { error: "name and ip are required" },
        { status: 400 }
      );
    }

    // Check device limit
    const deviceCount = await db.device.count();
    if (deviceCount >= MAX_DEVICES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_DEVICES} devices allowed (free tier). Upgrade for more.` },
        { status: 409 }
      );
    }

    // Check for duplicate IP+port
    const devicePort = port || 4370;
    const existingDevice = await db.device.findFirst({
      where: { ip, port: devicePort },
    });
    if (existingDevice) {
      return NextResponse.json(
        { error: "A device with this IP and port already exists" },
        { status: 409 }
      );
    }

    // Create device in database
    const device = await db.device.create({
      data: {
        name,
        ip,
        port: devicePort,
        deviceType: deviceType || "ZKTeco",
        serialNumber: serialNumber || null,
        firmware: firmware || null,
        status: "offline",
      },
    });

    // Register with ZK sync service (non-blocking)
    registerDeviceWithZK(device).catch((err) => {
      console.error("[Devices] Failed to register with ZK sync service:", err);
    });

    // Create DeviceEmployee records for all active employees
    assignEmployeesToDevice(device.id).catch((err) => {
      console.error("[Devices] Failed to assign employees to device:", err);
    });

    return NextResponse.json(device, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create device";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Register device with ZK sync service
async function registerDeviceWithZK(device: {
  id: string;
  name: string;
  ip: string;
  port: number;
}) {
  try {
    await fetch("http://127.0.0.1:3003/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: device.id,
        name: device.name,
        ip: device.ip,
        port: device.port,
      }),
    });
    console.log(`[Devices] Registered ${device.name} with ZK sync service`);
  } catch (err) {
    console.error("[Devices] ZK registration error:", err);
  }
}

// Assign all active employees to the new device
async function assignEmployeesToDevice(deviceId: string) {
  try {
    const employees = await db.employee.findMany({
      where: { isActive: true, fingerprintId: { not: null } },
    });

    for (const emp of employees) {
      // Check if already assigned
      const existing = await db.deviceEmployee.findUnique({
        where: {
          deviceId_employeeId: {
            deviceId,
            employeeId: emp.id,
          },
        },
      });

      if (!existing && emp.fingerprintId !== null) {
        await db.deviceEmployee.create({
          data: {
            deviceId,
            employeeId: emp.id,
            fingerprintId: emp.fingerprintId,
            isUploaded: false,
          },
        });
      }
    }
  } catch (err) {
    console.error("[Devices] Error assigning employees to device:", err);
  }
}
