import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/fingerprint-status - Returns set of fingerprintIds registered on ZK devices
export async function GET() {
  try {
    // Get all devices from DB
    const devices = await db.device.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    const registeredFingerprintIds = new Set<number>();

    // For each device, try to query the ZK service for users
    for (const device of devices) {
      try {
        const res = await fetch(
          `http://127.0.0.1:3003/api/users/${device.id}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (res.ok) {
          const users: Array<{ uid: number; userid: string; name: string; role: number }> =
            await res.json();
          for (const user of users) {
            registeredFingerprintIds.add(user.uid);
          }
        }
      } catch {
        // Device might be offline, skip
      }
    }

    return NextResponse.json({
      registeredIds: Array.from(registeredFingerprintIds),
      deviceCount: devices.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch fingerprint status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
