import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/employees - List employees with pagination, search, and filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const search = searchParams.get("search") || "";
    const departmentId = searchParams.get("departmentId") || "";
    const department = searchParams.get("department") || "";
    const isActiveParam = searchParams.get("isActive");

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (isActiveParam !== null && isActiveParam !== "") {
      where.isActive = isActiveParam === "true";
    }

    if (search) {
      const orConditions: Record<string, unknown>[] = [
        { name: { contains: search } },
        { nameAr: { contains: search } },
        { employeeId: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];

      // Also search by fingerprintId if search is numeric
      const numericSearch = parseInt(search, 10);
      if (!isNaN(numericSearch) && String(numericSearch) === search.trim()) {
        orConditions.push({ fingerprintId: numericSearch });
      }

      where.OR = orConditions;
    }

    if (departmentId) {
      where.departmentId = departmentId;
    } else if (department) {
      where.department = { name: department };
    }

    const [employees, total] = await Promise.all([
      db.employee.findMany({
        where,
        include: {
          shift: true,
          department: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      db.employee.count({ where }),
    ]);

    return NextResponse.json({
      employees,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch employees";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/employees - Create a new employee
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employeeId, name, nameAr, departmentId, position, phone, email, fingerprintId, shiftId } = body;

    // Validate required fields
    if (!employeeId || !name) {
      return NextResponse.json(
        { error: "employeeId and name are required" },
        { status: 400 }
      );
    }

    // Check for duplicate employeeId
    const existing = await db.employee.findUnique({
      where: { employeeId },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Employee ID already exists" },
        { status: 409 }
      );
    }

    // Auto-assign fingerprintId if not provided
    let assignedFingerprintId = fingerprintId;
    if (assignedFingerprintId === undefined || assignedFingerprintId === null) {
      const maxFingerprint = await db.employee.findMany({
        where: { fingerprintId: { not: null }, isActive: true },
        select: { fingerprintId: true },
        orderBy: { fingerprintId: "desc" },
        take: 1,
      });
      assignedFingerprintId =
        maxFingerprint.length > 0 && maxFingerprint[0].fingerprintId !== null
          ? maxFingerprint[0].fingerprintId + 1
          : 1;
    } else {
      // Check fingerprintId uniqueness (only among active employees)
      const existingFingerprint = await db.employee.findFirst({
        where: { fingerprintId: assignedFingerprintId, isActive: true },
      });
      if (existingFingerprint) {
        return NextResponse.json(
          { error: "Fingerprint ID already assigned to another employee" },
          { status: 409 }
        );
      }
    }

    // License check: fingerprint limit
    if (assignedFingerprintId !== null && assignedFingerprintId !== undefined) {
      const FREE_FINGERPRINT_LIMIT = 50;
      const employeesWithFingerprints = await db.employee.count({
        where: { fingerprintId: { not: null }, isActive: true },
      });

      if (employeesWithFingerprints >= FREE_FINGERPRINT_LIMIT) {
        // Check if there's an active fingerprint license
        const fingerprintLicense = await db.license.findFirst({
          where: {
            isActive: true,
            type: { in: ["fingerprint", "full"] },
          },
        });

        if (!fingerprintLicense) {
          return NextResponse.json(
            {
              error: `Free fingerprint limit (${FREE_FINGERPRINT_LIMIT}) reached. Activate a fingerprint license to add more employees with fingerprint IDs.`,
              code: "FINGERPRINT_LICENSE_REQUIRED",
            },
            { status: 403 }
          );
        }

        // Check if license has a max limit
        if (
          fingerprintLicense.maxFingerprints !== null &&
          employeesWithFingerprints >= fingerprintLicense.maxFingerprints
        ) {
          return NextResponse.json(
            {
              error: `Fingerprint license limit (${fingerprintLicense.maxFingerprints}) reached.`,
              code: "FINGERPRINT_LICENSE_LIMIT",
            },
            { status: 403 }
          );
        }
      }
    }

    const employee = await db.employee.create({
      data: {
        employeeId,
        name,
        nameAr: nameAr || null,
        departmentId: departmentId || null,
        position: position || null,
        phone: phone || null,
        email: email || null,
        fingerprintId: assignedFingerprintId,
        shiftId: shiftId || null,
      },
      include: {
        shift: true,
        department: true,
      },
    });

    // Trigger employee upload to devices (non-blocking)
    uploadEmployeeToDevices(employee).catch((err) => {
      // ZK service upload is optional - silent fail
      // console.error("[Employees] Failed to upload employee to devices:", err);
    });

    return NextResponse.json(employee, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create employee";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Helper: Upload employee data to all active devices
async function uploadEmployeeToDevices(employee: {
  id: string;
  employeeId: string;
  name: string;
  fingerprintId: number | null;
}) {
  try {
    const devices = await db.device.findMany({
      where: { isActive: true },
    });

    for (const device of devices) {
      // Create DeviceEmployee record
      const existingAssignment = await db.deviceEmployee.findUnique({
        where: {
          deviceId_employeeId: {
            deviceId: device.id,
            employeeId: employee.id,
          },
        },
      });

      if (!existingAssignment && employee.fingerprintId !== null) {
        await db.deviceEmployee.create({
          data: {
            deviceId: device.id,
            employeeId: employee.id,
            fingerprintId: employee.fingerprintId,
            isUploaded: false,
          },
        });
      }
    }
  } catch (err) {
    // ZK service upload is optional - silent fail
    // console.error("[Employees] Error uploading employee to devices:", err);
  }
}
