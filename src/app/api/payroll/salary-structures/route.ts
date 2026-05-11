import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/payroll/salary-structures - List salary structures with employee info
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const department = searchParams.get("department") || "";
    const search = searchParams.get("search") || "";

    const where: Record<string, unknown> = {};

    if (department) {
      where.employee = { department };
    }

    if (search) {
      where.employee = {
        ...(where.employee as Record<string, unknown>),
        OR: [
          { name: { contains: search } },
          { nameAr: { contains: search } },
          { employeeId: { contains: search } },
        ],
      };
    }

    const salaryStructures = await db.salaryStructure.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            name: true,
            nameAr: true,
            department: true,
            position: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(salaryStructures);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch salary structures";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/payroll/salary-structures - Create or update salary structure (upsert)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      employeeId,
      basicSalary,
      housingAllowance,
      transportAllowance,
      foodAllowance,
      otherAllowances,
      overtimeRate,
      deductionPerLate,
      deductionPerAbsent,
      currency,
    } = body;

    if (!employeeId) {
      return NextResponse.json(
        { error: "employeeId is required" },
        { status: 400 }
      );
    }

    // Verify employee exists
    const employee = await db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    const salaryStructure = await db.salaryStructure.upsert({
      where: { employeeId },
      create: {
        employeeId,
        basicSalary: basicSalary ?? 0,
        housingAllowance: housingAllowance ?? 0,
        transportAllowance: transportAllowance ?? 0,
        foodAllowance: foodAllowance ?? 0,
        otherAllowances: otherAllowances ?? 0,
        overtimeRate: overtimeRate ?? 0,
        deductionPerLate: deductionPerLate ?? 0,
        deductionPerAbsent: deductionPerAbsent ?? 0,
        currency: currency ?? "SAR",
      },
      update: {
        ...(basicSalary !== undefined && { basicSalary }),
        ...(housingAllowance !== undefined && { housingAllowance }),
        ...(transportAllowance !== undefined && { transportAllowance }),
        ...(foodAllowance !== undefined && { foodAllowance }),
        ...(otherAllowances !== undefined && { otherAllowances }),
        ...(overtimeRate !== undefined && { overtimeRate }),
        ...(deductionPerLate !== undefined && { deductionPerLate }),
        ...(deductionPerAbsent !== undefined && { deductionPerAbsent }),
        ...(currency !== undefined && { currency }),
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            name: true,
            nameAr: true,
            department: true,
            position: true,
            isActive: true,
          },
        },
      },
    });

    return NextResponse.json(salaryStructure);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create/update salary structure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
