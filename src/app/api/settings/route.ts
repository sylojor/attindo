import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/settings
export async function GET() {
  try {
    let settings = await db.settings.findUnique({ where: { id: "default" } });
    if (!settings) {
      settings = await db.settings.create({
        data: { id: "default" },
      });
    }
    return NextResponse.json(settings);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { currency, lang, companyName, companyNameAr } = body;

    const settings = await db.settings.upsert({
      where: { id: "default" },
      update: {
        ...(currency !== undefined && { currency }),
        ...(lang !== undefined && { lang }),
        ...(companyName !== undefined && { companyName }),
        ...(companyNameAr !== undefined && { companyNameAr }),
      },
      create: {
        id: "default",
        currency: currency || "SAR",
        lang: lang || "ar",
        companyName: companyName || "Attindo",
        companyNameAr: companyNameAr || "أتندو",
      },
    });

    return NextResponse.json(settings);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
