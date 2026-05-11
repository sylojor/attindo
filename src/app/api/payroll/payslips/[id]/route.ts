import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/payroll/payslips/[id] - Get single payslip with full details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const payslip = await db.paySlip.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            name: true,
            nameAr: true,
            department: { select: { id: true, name: true, nameAr: true } },
            position: true,
            phone: true,
            email: true,
            isActive: true,
            salaryStructure: true,
            allowances: {
              where: {
                isRecurring: true,
                OR: [
                  { endDate: null },
                  { endDate: { gte: new Date() } },
                ],
              },
            },
            deductions: {
              where: {
                isRecurring: true,
                OR: [
                  { endDate: null },
                  { endDate: { gte: new Date() } },
                ],
              },
            },
          },
        },
        payrollPeriod: true,
      },
    });

    if (!payslip) {
      return NextResponse.json(
        { error: "Payslip not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(payslip);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch payslip";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/payroll/payslips/[id] - Update payslip (e.g., mark as paid)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    const existing = await db.paySlip.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Payslip not found" },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {};

    if (status !== undefined) {
      const validStatuses = ["pending", "paid"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }

      data.status = status;

      if (status === "paid") {
        data.paidAt = new Date();
      } else if (status === "pending") {
        data.paidAt = null;
      }
    }

    const payslip = await db.paySlip.update({
      where: { id },
      data,
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
        payrollPeriod: {
          select: {
            id: true,
            name: true,
            month: true,
            year: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json(payslip);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update payslip";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
