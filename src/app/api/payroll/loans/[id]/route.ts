import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT /api/payroll/loans/[id] - Update loan (status can be "active", "completed", "cancelled")
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { type, amount, monthlyDeduction, remainingBalance, status, notes } = body;

    // Check if loan exists
    const existing = await db.loan.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 });
    }

    // Validate status if provided
    if (status && !["active", "completed", "cancelled"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be 'active', 'completed', or 'cancelled'" },
        { status: 400 }
      );
    }

    const loan = await db.loan.update({
      where: { id },
      data: {
        ...(type !== undefined && ["advance", "loan"].includes(type) && { type }),
        ...(amount !== undefined && { amount: parseFloat(String(amount)) }),
        ...(monthlyDeduction !== undefined && { monthlyDeduction: parseFloat(String(monthlyDeduction)) }),
        ...(remainingBalance !== undefined && { remainingBalance: parseFloat(String(remainingBalance)) }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        employee: {
          select: { id: true, employeeId: true, name: true, nameAr: true, department: { select: { id: true, name: true, nameAr: true } } },
        },
      },
    });

    return NextResponse.json(loan);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update loan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/payroll/loans/[id] - Delete loan
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if loan exists
    const existing = await db.loan.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 });
    }

    await db.loan.delete({ where: { id } });

    return NextResponse.json({ message: "Loan deleted successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete loan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
