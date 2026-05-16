import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/license - Return current license status
export async function GET() {
  try {
    const licenses = await db.license.findMany({
      where: { isActive: true },
    });

    // Check for active fingerprint license
    const fingerprintLicense = licenses.find(
      (l) => l.type === "fingerprint" || l.type === "full"
    );
    const payrollLicense = licenses.find(
      (l) => l.type === "payroll" || l.type === "full"
    );

    // Count active employees with fingerprint IDs
    const employeesWithFingerprints = await db.employee.count({
      where: { fingerprintId: { not: null }, isActive: true },
    });

    const FREE_FINGERPRINT_LIMIT = 99999; // No practical limit

    // Determine max fingerprints allowed - unlimited for all users
    let maxFingerprints = Infinity;
    if (fingerprintLicense && fingerprintLicense.maxFingerprints) {
      maxFingerprints = fingerprintLicense.maxFingerprints;
    }

    const fingerprintSlotsUsed = employeesWithFingerprints;
    const fingerprintLimitReached = false; // No limit
    const fingerprintLicensed = true; // Always licensed

    const payrollLicensed = !!payrollLicense;

    return NextResponse.json({
      fingerprint: {
        licensed: fingerprintLicensed,
        slotsUsed: fingerprintSlotsUsed,
        maxSlots: maxFingerprints === Infinity ? null : maxFingerprints,
        freeLimit: FREE_FINGERPRINT_LIMIT,
        limitReached: fingerprintLimitReached,
        licenseType: fingerprintLicense?.type || null,
        licenseKey: fingerprintLicense?.licenseKey || null,
      },
      payroll: {
        licensed: payrollLicensed,
        licenseType: payrollLicense?.type || null,
        licenseKey: payrollLicense?.licenseKey || null,
      },
      licenses: licenses.map((l) => ({
        id: l.id,
        type: l.type,
        licenseKey: l.licenseKey,
        maxFingerprints: l.maxFingerprints,
        isActive: l.isActive,
        issuedTo: l.issuedTo,
        issuedAt: l.issuedAt,
        expiresAt: l.expiresAt,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch license status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/license - Activate a license key
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { licenseKey } = body;

    if (!licenseKey || typeof licenseKey !== "string") {
      return NextResponse.json(
        { error: "License key is required" },
        { status: 400 }
      );
    }

    // Validate license key format
    const key = licenseKey.trim().toUpperCase();
    const fpRegex = /^ATTD-FP-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    const prRegex = /^ATTD-PR-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    const fullRegex = /^ATTD-FULL-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

    let type: string;
    let maxFingerprints: number | null = null;

    if (fpRegex.test(key)) {
      type = "fingerprint";
      maxFingerprints = 50; // default for fingerprint license
    } else if (prRegex.test(key)) {
      type = "payroll";
    } else if (fullRegex.test(key)) {
      type = "full";
      maxFingerprints = null; // unlimited
    } else {
      return NextResponse.json(
        { error: "Invalid license key format" },
        { status: 400 }
      );
    }

    // Check if key already activated
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
      // Reactivate
      await db.license.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
      return NextResponse.json({
        message: "License reactivated",
        license: { id: existing.id, type: existing.type, licenseKey: existing.licenseKey },
      });
    }

    // Create new license
    const license = await db.license.create({
      data: {
        licenseKey: key,
        type,
        maxFingerprints,
        isActive: true,
      },
    });

    return NextResponse.json({
      message: "License activated successfully",
      license: {
        id: license.id,
        type: license.type,
        licenseKey: license.licenseKey,
        maxFingerprints: license.maxFingerprints,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to activate license";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
