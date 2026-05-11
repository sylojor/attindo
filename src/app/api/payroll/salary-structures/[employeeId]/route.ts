import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/payroll/salary-structures/[employeeId] - Get salary structure for specific employee
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const { employeeId } = await params;

    const salaryStructure = await db.salaryStructure.findUnique({
      where: { employeeId },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            name: true,
            nameAr: true,
            department: { select: { id: true, name: true, nameAr: true } },
            position: true,
            isActive: true,
          },
        },
      },
    });

    if (!salaryStructure) {
      return NextResponse.json(
        { error: "Salary structure not found for this employee" },
        { status: 404 }
      );
    }

    return NextResponse.json(salaryStructure);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch salary structure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/payroll/salary-structures/[employeeId] - Update salary structure
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const { employeeId } = await params;
    const body = await request.json();

    const existing = await db.salaryStructure.findUnique({
      where: { employeeId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Salary structure not found for this employee" },
        { status: 404 }
      );
    }

    const {
      basicSalary,
      housingAllowance,
      transportAllowance,
      foodAllowance,
      otherAllowances,
      overtimeRate,
      deductionPerLate,
      deductionPerAbsent,
      currency,
      effectiveDate,
    } = body;

    const salaryStructure = await db.salaryStructure.update({
      where: { employeeId },
      data: {
        ...(basicSalary !== undefined && { basicSalary }),
        ...(housingAllowance !== undefined && { housingAllowance }),
        ...(transportAllowance !== undefined && { transportAllowance }),
        ...(foodAllowance !== undefined && { foodAllowance }),
        ...(otherAllowances !== undefined && { otherAllowances }),
        ...(overtimeRate !== undefined && { overtimeRate }),
        ...(deductionPerLate !== undefined && { deductionPerLate }),
        ...(deductionPerAbsent !== undefined && { deductionPerAbsent }),
        ...(currency !== undefined && { currency }),
        ...(effectiveDate !== undefined && { effectiveDate: new Date(effectiveDate) }),
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            name: true,
            nameAr: true,
            department: { select: { id: true, name: true, nameAr: true } },
            position: true,
            isActive: true,
          },
        },
      },
    });

    return NextResponse.json(salaryStructure);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update salary structure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/payroll/salary-structures/[employeeId] - Delete salary structure
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const { employeeId } = await params;

    const existing = await db.salaryStructure.findUnique({
      where: { employeeId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Salary structure not found for this employee" },
        { status: 404 }
      );
    }

    await db.salaryStructure.delete({
      where: { employeeId },
    });

    return NextResponse.json({
      message: "Salary structure deleted successfully",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete salary structure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
