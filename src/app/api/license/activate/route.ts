import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/license/activate - Validate and activate a license key
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { licenseKey, issuedTo } = body;

    if (!licenseKey || typeof licenseKey !== "string") {
      return NextResponse.json(
        { error: "License key is required" },
        { status: 400 }
      );
    }

    const key = licenseKey.trim().toUpperCase();

    // Validate license key format
    const fpRegex = /^ATTD-FP-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    const prRegex = /^ATTD-PR-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    const fullRegex = /^ATTD-FULL-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

    let type: string;
    let maxFingerprints: number | null = null;

    if (fpRegex.test(key)) {
      type = "fingerprint";
      maxFingerprints = 50;
    } else if (prRegex.test(key)) {
      type = "payroll";
    } else if (fullRegex.test(key)) {
      type = "full";
      maxFingerprints = null; // unlimited
    } else {
      return NextResponse.json(
        { error: "Invalid license key format. Expected: ATTD-FP-XXXX-XXXX, ATTD-PR-XXXX-XXXX, or ATTD-FULL-XXXX-XXXX" },
        { status: 400 }
      );
    }

    // Check if key already exists
    const existing = await db.license.findUnique({
      where: { licenseKey: key },
    });

    if (existing) {
      if (existing.isActive) {
        return NextResponse.json(
          { error: "License key already activated" },
          { status: 409 }
        );
      }
      // Reactivate deactivated license
      await db.license.update({
        where: { id: existing.id },
        data: { isActive: true, issuedTo: issuedTo || existing.issuedTo },
      });
      return NextResponse.json({
        message: "License reactivated successfully",
        license: { id: existing.id, type: existing.type, licenseKey: existing.licenseKey },
      });
    }

    // Create and activate new license
    const license = await db.license.create({
      data: {
        licenseKey: key,
        type,
        maxFingerprints,
        isActive: true,
        issuedTo: issuedTo || null,
      },
    });

    return NextResponse.json({
      message: "License activated successfully",
      license: {
        id: license.id,
        type: license.type,
        licenseKey: license.licenseKey,
        maxFingerprints: license.maxFingerprints,
        issuedTo: license.issuedTo,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to activate license";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
