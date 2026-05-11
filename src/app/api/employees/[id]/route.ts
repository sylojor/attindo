import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/employees/[id] - Get single employee by ID
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const employee = await db.employee.findUnique({
      where: { id },
      include: {
        shift: true,
        department: true,
        schedules: {
          include: { shift: true },
          orderBy: { effectiveDate: "desc" },
        },
        deviceAssignments: {
          include: { device: true },
        },
        attendanceLogs: {
          take: 20,
          orderBy: { timestamp: "desc" },
          include: { device: true },
        },
      },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    return NextResponse.json(employee);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch employee";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/employees/[id] - Update employee
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { name, nameAr, departmentId, position, phone, email, fingerprintId, shiftId, isActive } = body;

    // Check if employee exists
    const existing = await db.employee.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Validate departmentId if provided
    if (departmentId !== undefined && departmentId !== null) {
      const department = await db.department.findUnique({ where: { id: departmentId } });
      if (!department) {
        return NextResponse.json(
          { error: "Department not found" },
          { status: 400 }
        );
      }
    }

    // If fingerprintId is being changed, check uniqueness
    if (fingerprintId !== undefined && fingerprintId !== existing.fingerprintId) {
      const duplicateFingerprint = await db.employee.findFirst({
        where: { fingerprintId, id: { not: id } },
      });
      if (duplicateFingerprint) {
        return NextResponse.json(
          { error: "Fingerprint ID already assigned to another employee" },
          { status: 409 }
        );
      }
    }

    const employee = await db.employee.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(nameAr !== undefined && { nameAr }),
        ...(departmentId !== undefined && { departmentId }),
        ...(position !== undefined && { position }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(fingerprintId !== undefined && { fingerprintId }),
        ...(shiftId !== undefined && { shiftId }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        shift: true,
        department: true,
      },
    });

    // If fingerprintId changed, mark device assignments for re-upload
    if (fingerprintId !== undefined && fingerprintId !== existing.fingerprintId) {
      await db.deviceEmployee.updateMany({
        where: { employeeId: id },
        data: { isUploaded: false, fingerprintId },
      });
    }

    return NextResponse.json(employee);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update employee";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/employees/[id] - Soft delete (set isActive = false)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.employee.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const employee = await db.employee.update({
      where: { id },
      data: { isActive: false },
      include: {
        department: true,
      },
    });

    return NextResponse.json({
      message: "Employee deactivated successfully",
      employee,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete employee";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
