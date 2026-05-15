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

    // If fingerprintId is being changed, check uniqueness (only among active employees)
    if (fingerprintId !== undefined && fingerprintId !== existing.fingerprintId) {
      const duplicateFingerprint = await db.employee.findFirst({
        where: { fingerprintId, id: { not: id }, isActive: true },
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

// DELETE /api/employees/[id] - Hard delete (remove from database)
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

    // Delete related records first to avoid foreign key constraint violations
    await db.attendanceLog.deleteMany({ where: { employeeId: id } });
    await db.schedule.deleteMany({ where: { employeeId: id } });
    await db.deviceEmployee.deleteMany({ where: { employeeId: id } });
    await db.allowance.deleteMany({ where: { employeeId: id } });
    await db.deduction.deleteMany({ where: { employeeId: id } });
    await db.loan.deleteMany({ where: { employeeId: id } });
    await db.paySlip.deleteMany({ where: { employeeId: id } });
    const salaryStructure = await db.salaryStructure.findUnique({ where: { employeeId: id } });
    if (salaryStructure) {
      await db.salaryStructure.delete({ where: { employeeId: id } });
    }

    // Now delete the employee
    await db.employee.delete({ where: { id } });

    return NextResponse.json({
      message: "Employee deleted successfully",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete employee";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
