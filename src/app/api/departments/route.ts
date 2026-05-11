import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/departments
export async function GET() {
  try {
    const departments = await db.department.findMany({
      include: {
        _count: { select: { employees: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(departments);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch departments";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/departments
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, nameAr, manager } = body;

    if (!name) {
      return NextResponse.json({ error: "Department name is required" }, { status: 400 });
    }

    const existing = await db.department.findUnique({ where: { name } });
    if (existing) {
      return NextResponse.json({ error: "Department name already exists" }, { status: 409 });
    }

    const department = await db.department.create({
      data: {
        name,
        nameAr: nameAr || null,
        manager: manager || null,
      },
      include: {
        _count: { select: { employees: true } },
      },
    });

    return NextResponse.json(department, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create department";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
