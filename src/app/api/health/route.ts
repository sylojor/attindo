import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/health - Health check endpoint for Electron app diagnostics
export async function GET() {
  const health: Record<string, unknown> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "2.1.9",
    environment: process.env.NODE_ENV || "unknown",
    electron: process.env.ELECTRON_RUN_AS_NODE === "1",
    database: {
      url: process.env.DATABASE_URL ? "set" : "missing",
    },
  };

  // Test database connection
  try {
    await db.$queryRaw`SELECT 1 as test`;
    health.database = {
      ...((health.database as Record<string, unknown>) || {}),
      connected: true,
      engine: "prisma",
    };
  } catch (dbError: unknown) {
    const errMsg = dbError instanceof Error ? dbError.message : String(dbError);
    health.database = {
      ...((health.database as Record<string, unknown>) || {}),
      connected: false,
      error: errMsg,
    };
    health.status = "degraded";

    // Try to list tables to give more diagnostic info
    try {
      const tables = await db.$queryRaw<
        Array<{ name: string }>
      >`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`;
      health.database = {
        ...((health.database as Record<string, unknown>) || {}),
        tables: tables.map((t) => t.name),
      };
    } catch {
      health.database = {
        ...((health.database as Record<string, unknown>) || {}),
        tables: "cannot list - database may not exist or is empty",
      };
    }
  }

  // Check ZK service (non-blocking)
  try {
    const zkRes = await fetch("http://127.0.0.1:3003/api/health", {
      signal: AbortSignal.timeout(2000),
    });
    health.zkService = zkRes.ok ? "online" : "degraded";
  } catch {
    health.zkService = "offline";
  }

  const statusCode = health.status === "ok" ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
