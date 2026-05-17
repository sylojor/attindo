import { NextResponse } from "next/server";
import { execSync } from "child_process";
import os from "os";

// GET /api/network-info - Returns server network information (internal IPs + external IP)
export async function GET() {
  try {
    const internalIps: Array<{ interface: string; address: string; family: string }> = [];

    // Get all network interfaces
    const interfaces = os.networkInterfaces();
    for (const [name, nets] of Object.entries(interfaces)) {
      if (!nets) continue;
      for (const net of nets) {
        // Skip internal (loopback) and non-IPv4 addresses for the main list
        if (!net.internal) {
          internalIps.push({
            interface: name,
            address: net.address,
            family: net.family,
          });
        }
      }
    }

    // Also include loopback for reference
    const loopbackIps: Array<{ interface: string; address: string; family: string }> = [];
    for (const [name, nets] of Object.entries(interfaces)) {
      if (!nets) continue;
      for (const net of nets) {
        if (net.internal && net.family === "IPv4") {
          loopbackIps.push({
            interface: name,
            address: net.address,
            family: net.family,
          });
        }
      }
    }

    // Try to get external/public IP (with timeout)
    let externalIp: string | null = null;
    try {
      const result = execSync(
        "curl -s --connect-timeout 3 --max-time 5 https://api.ipify.org 2>/dev/null || curl -s --connect-timeout 3 --max-time 5 https://ifconfig.me 2>/dev/null || curl -s --connect-timeout 3 --max-time 5 https://ipecho.net/plain 2>/dev/null",
        { encoding: "utf-8", timeout: 8000 }
      ).trim();
      // Validate it looks like an IP
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(result)) {
        externalIp = result;
      }
    } catch {
      // External IP detection failed (no internet or firewall)
    }

    // Get hostname
    const hostname = os.hostname();

    return NextResponse.json({
      hostname,
      internalIps,
      loopbackIps,
      externalIp,
      port: process.env.PORT || 3000,
      zkServicePort: 3003,
      zkDeviceDefaultPort: 4370,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get network info";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
