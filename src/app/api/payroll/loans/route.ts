import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/payroll/loans
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;

    const loans = await db.loan.findMany({
      where,
      include: {
        employee: {
          select: { id: true, employeeId: true, name: true, nameAr: true, department: { select: { id: true, name: true, nameAr: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(loans);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch loans";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/payroll/loans
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employeeId, type, amount, monthlyDeduction, notes } = body;

    if (!employeeId || !amount || amount <= 0) {
      return NextResponse.json({ error: "Employee and amount are required" }, { status: 400 });
    }

    const loan = await db.loan.create({
      data: {
        employeeId,
        type: type || "advance",
        amount: Number(amount),
        monthlyDeduction: Number(monthlyDeduction) || 0,
        remainingBalance: Number(amount),
        notes: notes || null,
      },
      include: {
        employee: {
          select: { id: true, employeeId: true, name: true, nameAr: true },
        },
      },
    });

    return NextResponse.json(loan, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create loan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
