import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/payroll/deductions - List deductions (filter by employeeId)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId") || "";
    const isRecurring = searchParams.get("isRecurring") || "";
    const type = searchParams.get("type") || "";

    const where: Record<string, unknown> = {};

    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (isRecurring !== "") {
      where.isRecurring = isRecurring === "true";
    }

    if (type) {
      where.type = type;
    }

    const deductions = await db.deduction.findMany({
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

    return NextResponse.json(deductions);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch deductions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/payroll/deductions - Create deduction
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      employeeId,
      name,
      nameAr,
      amount,
      type,
      isRecurring,
      effectiveDate,
      endDate,
    } = body;

    if (!employeeId || !name || amount === undefined) {
      return NextResponse.json(
        { error: "employeeId, name, and amount are required" },
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

    const deduction = await db.deduction.create({
      data: {
        employeeId,
        name,
        nameAr: nameAr || null,
        amount: parseFloat(String(amount)),
        type: type || "fixed",
        isRecurring: isRecurring !== undefined ? isRecurring : true,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
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

    return NextResponse.json(deduction, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create deduction";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
