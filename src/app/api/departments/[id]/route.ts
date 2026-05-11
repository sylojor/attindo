import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT /api/departments/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, nameAr, manager } = body;

    const department = await db.department.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(nameAr !== undefined && { nameAr }),
        ...(manager !== undefined && { manager }),
      },
      include: {
        _count: { select: { employees: true } },
      },
    });

    return NextResponse.json(department);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update department";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/departments/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Unassign employees from this department
    await db.employee.updateMany({
      where: { departmentId: id },
      data: { departmentId: null },
    });

    await db.department.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete department";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
