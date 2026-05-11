import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT /api/payroll/deductions/[id] - Update deduction
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.deduction.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Deduction not found" },
        { status: 404 }
      );
    }

    const { name, nameAr, amount, type, isRecurring, effectiveDate, endDate } = body;

    const deduction = await db.deduction.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(nameAr !== undefined && { nameAr }),
        ...(amount !== undefined && { amount: parseFloat(String(amount)) }),
        ...(type !== undefined && { type }),
        ...(isRecurring !== undefined && { isRecurring }),
        ...(effectiveDate !== undefined && { effectiveDate: new Date(effectiveDate) }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
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

    return NextResponse.json(deduction);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update deduction";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/payroll/deductions/[id] - Delete deduction
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.deduction.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Deduction not found" },
        { status: 404 }
      );
    }

    await db.deduction.delete({ where: { id } });

    return NextResponse.json({
      message: "Deduction deleted successfully",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete deduction";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
