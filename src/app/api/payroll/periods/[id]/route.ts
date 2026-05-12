import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/payroll/periods/[id] - Get single period with paySlips
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const period = await db.payrollPeriod.findUnique({
      where: { id },
      include: {
        paySlips: {
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
          orderBy: { employee: { name: "asc" } },
        },
      },
    });

    if (!period) {
      return NextResponse.json(
        { error: "Payroll period not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(period);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch payroll period";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/payroll/periods/[id] - Update period status (approve, etc.)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, name } = body;

    const existing = await db.payrollPeriod.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Payroll period not found" },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {};

    if (status !== undefined) {
      const validStatuses = ["draft", "processing", "completed", "approved"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }

      // Only allow approve if period is completed
      if (status === "approved" && existing.status !== "completed") {
        return NextResponse.json(
          { error: "Can only approve a completed payroll period" },
          { status: 400 }
        );
      }

      data.status = status;

      if (status === "approved") {
        data.approvedAt = new Date();
      }
    }

    if (name !== undefined) {
      data.name = name;
    }

    const period = await db.payrollPeriod.update({
      where: { id },
      data,
      include: {
        _count: {
          select: { paySlips: true },
        },
      },
    });

    return NextResponse.json(period);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update payroll period";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/payroll/periods/[id] - Delete period (only if draft)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.payrollPeriod.findUnique({
      where: { id },
      include: { _count: { select: { paySlips: true } } },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Payroll period not found" },
        { status: 404 }
      );
    }

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Can only delete draft payroll periods" },
        { status: 400 }
      );
    }

    // Delete associated pay slips first
    await db.paySlip.deleteMany({
      where: { payrollPeriodId: id },
    });

    await db.payrollPeriod.delete({
      where: { id },
    });

    return NextResponse.json({
      message: "Payroll period deleted successfully",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete payroll period";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
