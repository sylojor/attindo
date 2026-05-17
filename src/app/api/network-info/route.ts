import { NextResponse } from "next/server";
import https from "https";
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
        // Skip internal (loopback) addresses for the main list
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

    // Try to get external/public IP using Node.js https (works on Windows too)
    let externalIp: string | null = null;
    try {
      externalIp = await new Promise<string | null>((resolve) => {
        const timeout = setTimeout(() => {
          req.destroy();
          resolve(null);
        }, 5000);

        const req = https.get("https://api.ipify.org", (res) => {
          let data = "";
          res.on("data", (chunk) => { data += chunk; });
          res.on("end", () => {
            clearTimeout(timeout);
            const ip = data.trim();
            if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
              resolve(ip);
            } else {
              resolve(null);
            }
          });
        });
        req.on("error", () => {
          clearTimeout(timeout);
          resolve(null);
        });
      });
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
