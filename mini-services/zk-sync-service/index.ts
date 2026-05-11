/**
 * Attindo ZKTeco Sync Service
 * 
 * This mini-service handles communication with ZKTeco/ZK fingerprint devices.
 * It uses Socket.io for real-time sync status updates to the frontend.
 * 
 * Key Design Principle: NON-BLOCKING
 * - All sync operations are async with progress events
 * - Auto-sync on startup runs in the background
 * - Never blocks the main thread
 * 
 * In production (Electron app), this would use the `zk` npm library
 * to communicate with real ZKTeco devices over TCP.
 * 
 * Port: 3003
 */

import { createServer } from "http";
import { Server } from "socket.io";

const PORT = 3003;

// Types
interface ZKDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
  status: "online" | "offline" | "syncing" | "error";
  lastSyncAt: string | null;
  serialNumber?: string;
  firmware?: string;
}

interface AttendanceRecord {
  userId: number;
  timestamp: string;
  verifyMode: number;
  ioMode: number;
  workCode: number;
}

interface SyncProgress {
  deviceId: string;
  phase: "connecting" | "reading" | "uploading" | "disconnecting" | "completed" | "error";
  progress: number; // 0-100
  message: string;
  recordsFetched?: number;
  recordsUploaded?: number;
}

// Simulated device state
const simulatedDevices: Map<string, ZKDevice> = new Map();
const simulatedAttendance: Map<string, AttendanceRecord[]> = new Map();
let isAutoSyncRunning = false;

// Generate simulated attendance data
function generateSimulatedAttendance(deviceId: string, count: number = 50): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  const now = Date.now();
  
  for (let i = 0; i < count; i++) {
    const userId = Math.floor(Math.random() * 100) + 1;
    const timestamp = new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString();
    const verifyMode = Math.random() > 0.3 ? 0 : Math.random() > 0.5 ? 1 : 2; // fingerprint, card, face
    const ioMode = Math.random() > 0.5 ? 0 : 1; // check-in, check-out
    
    records.push({ userId, timestamp, verifyMode, ioMode, workCode: 0 });
  }
  
  // Sort by timestamp
  records.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return records;
}

// Simulate ZKTeco device connection (non-blocking with delays)
async function connectToDevice(device: ZKDevice): Promise<boolean> {
  // Simulate TCP connection delay
  await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
  
  // 95% success rate for simulation
  const success = Math.random() > 0.05;
  if (success) {
    device.status = "online";
  }
  return success;
}

// Simulate reading attendance logs from device
async function readAttendanceLogs(
  device: ZKDevice, 
  onProgress: (progress: SyncProgress) => void
): Promise<AttendanceRecord[]> {
  const totalSteps = 5;
  
  for (let step = 0; step < totalSteps; step++) {
    onProgress({
      deviceId: device.id,
      phase: "reading",
      progress: Math.round(((step + 1) / totalSteps) * 80),
      message: `Reading attendance records... (${step + 1}/${totalSteps})`,
    });
    
    // Non-blocking delay - simulates reading chunks from device
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
  }
  
  const records = generateSimulatedAttendance(device.id);
  
  onProgress({
    deviceId: device.id,
    phase: "reading",
    progress: 80,
    message: `Read ${records.length} attendance records`,
    recordsFetched: records.length,
  });
  
  return records;
}

// Simulate uploading employee data to device
async function uploadEmployeesToDevice(
  device: ZKDevice,
  employees: Array<{ employeeId: string; name: string; fingerprintId: number }>,
  onProgress: (progress: SyncProgress) => void
): Promise<number> {
  let uploaded = 0;
  const total = employees.length;
  
  if (total === 0) {
    onProgress({
      deviceId: device.id,
      phase: "uploading",
      progress: 100,
      message: "No employees to upload",
      recordsUploaded: 0,
    });
    return 0;
  }
  
  // Upload in batches of 5 (non-blocking)
  const batchSize = 5;
  for (let i = 0; i < total; i += batchSize) {
    const batch = employees.slice(i, i + batchSize);
    
    // Simulate uploading each employee
    for (const emp of batch) {
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
      uploaded++;
    }
    
    const progress = Math.round((uploaded / total) * 100);
    onProgress({
      deviceId: device.id,
      phase: "uploading",
      progress,
      message: `Uploading employees... (${uploaded}/${total})`,
      recordsUploaded: uploaded,
    });
  }
  
  return uploaded;
}

// Main sync function - NON-BLOCKING with progress updates
async function syncDevice(
  io: Server,
  device: ZKDevice,
  employees: Array<{ employeeId: string; name: string; fingerprintId: number }> = []
): Promise<{ recordsFetched: number; recordsUploaded: number }> {
  const emitProgress = (progress: SyncProgress) => {
    io.emit("sync:progress", progress);
  };
  
  try {
    // Phase 1: Connect
    emitProgress({
      deviceId: device.id,
      phase: "connecting",
      progress: 5,
      message: `Connecting to ${device.name} (${device.ip}:${device.port})...`,
    });
    
    device.status = "syncing";
    io.emit("device:status", { deviceId: device.id, status: "syncing" });
    
    const connected = await connectToDevice(device);
    if (!connected) {
      throw new Error(`Failed to connect to ${device.name}`);
    }
    
    emitProgress({
      deviceId: device.id,
      phase: "connecting",
      progress: 10,
      message: `Connected to ${device.name}`,
    });
    
    // Phase 2: Read attendance logs
    const records = await readAttendanceLogs(device, emitProgress);
    
    // Store records for API retrieval
    simulatedAttendance.set(device.id, records);
    
    // Phase 3: Upload employees (if any)
    let recordsUploaded = 0;
    if (employees.length > 0) {
      recordsUploaded = await uploadEmployeesToDevice(device, employees, emitProgress);
    }
    
    // Phase 4: Disconnect
    emitProgress({
      deviceId: device.id,
      phase: "disconnecting",
      progress: 95,
      message: "Disconnecting...",
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    device.lastSyncAt = new Date().toISOString();
    device.status = "online";
    
    emitProgress({
      deviceId: device.id,
      phase: "completed",
      progress: 100,
      message: `Sync completed! ${records.length} attendance records fetched, ${recordsUploaded} employees uploaded`,
      recordsFetched: records.length,
      recordsUploaded,
    });
    
    io.emit("device:status", { deviceId: device.id, status: "online", lastSyncAt: device.lastSyncAt });
    
    return { recordsFetched: records.length, recordsUploaded };
  } catch (error: any) {
    device.status = "error";
    io.emit("device:status", { deviceId: device.id, status: "error" });
    
    emitProgress({
      deviceId: device.id,
      phase: "error",
      progress: 0,
      message: `Sync failed: ${error.message}`,
    });
    
    throw error;
  }
}

// Create HTTP server and Socket.io
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Socket.io connection handler
io.on("connection", (socket) => {
  console.log(`[ZK-Sync] Client connected: ${socket.id}`);
  
  // Send current device status
  socket.emit("devices:status", Object.fromEntries(simulatedDevices));
  
  // Handle manual sync request
  socket.on("sync:start", async (data: { deviceId: string; employees?: Array<{ employeeId: string; name: string; fingerprintId: number }> }) => {
    const device = simulatedDevices.get(data.deviceId);
    if (!device) {
      socket.emit("sync:error", { deviceId: data.deviceId, message: "Device not found" });
      return;
    }
    
    if (device.status === "syncing") {
      socket.emit("sync:error", { deviceId: data.deviceId, message: "Device is already syncing" });
      return;
    }
    
    try {
      await syncDevice(io, device, data.employees || []);
    } catch (error: any) {
      console.error(`[ZK-Sync] Sync error for ${device.name}:`, error.message);
    }
  });
  
  // Handle sync all devices
  socket.on("sync:all", async (data: { employees?: Array<{ employeeId: string; name: string; fingerprintId: number }> }) => {
    const devices = Array.from(simulatedDevices.values()).filter(d => d.status !== "syncing");
    
    // Sync devices sequentially to avoid overwhelming the network
    for (const device of devices) {
      try {
        await syncDevice(io, device, data.employees || []);
      } catch (error: any) {
        console.error(`[ZK-Sync] Sync error for ${device.name}:`, error.message);
      }
    }
  });
  
  // Handle register device
  socket.on("device:register", (device: ZKDevice) => {
    simulatedDevices.set(device.id, { ...device, status: "offline" });
    io.emit("device:registered", device);
  });
  
  // Handle remove device
  socket.on("device:remove", (deviceId: string) => {
    simulatedDevices.delete(deviceId);
    io.emit("device:removed", deviceId);
  });
  
  // Handle test connection
  socket.on("device:test", async (deviceId: string) => {
    const device = simulatedDevices.get(deviceId);
    if (!device) {
      socket.emit("device:test-result", { deviceId, success: false, message: "Device not found" });
      return;
    }
    
    try {
      const connected = await connectToDevice(device);
      socket.emit("device:test-result", { 
        deviceId, 
        success: connected, 
        message: connected ? "Connection successful" : "Connection failed",
        status: connected ? "online" : "offline",
      });
      
      if (connected) {
        io.emit("device:status", { deviceId: device.id, status: "online" });
      }
    } catch (error: any) {
      socket.emit("device:test-result", { deviceId, success: false, message: error.message });
    }
  });
  
  socket.on("disconnect", () => {
    console.log(`[ZK-Sync] Client disconnected: ${socket.id}`);
  });
});

// REST API endpoints for the main Next.js app
import { createServer as createRestServer, IncomingMessage, ServerResponse } from "http";

// Helper to parse request body
function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

// Helper to send JSON response
function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// REST API handler
async function handleRestApi(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "", `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // GET /api/devices - List all tracked devices
    if (method === "GET" && path === "/api/devices") {
      sendJson(res, 200, Array.from(simulatedDevices.values()));
      return;
    }

    // POST /api/devices - Register a device
    if (method === "POST" && path === "/api/devices") {
      const body = await parseBody(req);
      const device: ZKDevice = {
        id: body.id,
        name: body.name,
        ip: body.ip,
        port: body.port || 4370,
        status: "offline",
        lastSyncAt: null,
      };
      simulatedDevices.set(device.id, device);
      sendJson(res, 201, device);
      return;
    }

    // DELETE /api/devices/:id - Remove a device
    if (method === "DELETE" && path.startsWith("/api/devices/")) {
      const id = path.split("/").pop();
      if (id) {
        simulatedDevices.delete(id);
        sendJson(res, 200, { success: true });
      } else {
        sendJson(res, 400, { error: "Device ID required" });
      }
      return;
    }

    // POST /api/sync/:deviceId - Sync a specific device
    if (method === "POST" && path.startsWith("/api/sync/")) {
      const deviceId = path.split("/").pop();
      if (!deviceId) {
        sendJson(res, 400, { error: "Device ID required" });
        return;
      }
      
      const device = simulatedDevices.get(deviceId);
      if (!device) {
        sendJson(res, 404, { error: "Device not found" });
        return;
      }
      
      if (device.status === "syncing") {
        sendJson(res, 409, { error: "Device is already syncing" });
        return;
      }
      
      const body = await parseBody(req);
      
      // Start sync in background - NON-BLOCKING
      syncDevice(io, device, body.employees || [])
        .then(result => {
          console.log(`[ZK-Sync] Background sync completed for ${device.name}: ${result.recordsFetched} records`);
        })
        .catch(err => {
          console.error(`[ZK-Sync] Background sync failed for ${device.name}:`, err.message);
        });
      
      // Return immediately - sync runs in background
      sendJson(res, 202, { 
        message: "Sync started in background", 
        deviceId,
        status: "syncing",
      });
      return;
    }

    // POST /api/sync-all - Sync all devices
    if (method === "POST" && path === "/api/sync-all") {
      const body = await parseBody(req);
      const devices = Array.from(simulatedDevices.values());
      
      // Start sync for all devices in background - NON-BLOCKING
      (async () => {
        for (const device of devices) {
          if (device.status !== "syncing") {
            try {
              await syncDevice(io, device, body.employees || []);
            } catch (err: any) {
              console.error(`[ZK-Sync] Auto-sync error for ${device.name}:`, err.message);
            }
          }
        }
      })();
      
      sendJson(res, 202, { 
        message: "Sync started for all devices in background",
        deviceCount: devices.length,
      });
      return;
    }

    // GET /api/attendance/:deviceId - Get cached attendance records
    if (method === "GET" && path.startsWith("/api/attendance/")) {
      const deviceId = path.split("/").pop();
      if (!deviceId) {
        sendJson(res, 400, { error: "Device ID required" });
        return;
      }
      
      const records = simulatedAttendance.get(deviceId) || [];
      sendJson(res, 200, records);
      return;
    }

    // POST /api/test-connection - Test device connection
    if (method === "POST" && path === "/api/test-connection") {
      const body = await parseBody(req);
      const device = simulatedDevices.get(body.deviceId);
      if (!device) {
        sendJson(res, 404, { error: "Device not found" });
        return;
      }
      
      const connected = await connectToDevice(device);
      sendJson(res, 200, { 
        success: connected,
        message: connected ? "Connection successful" : "Connection failed",
      });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error: any) {
    console.error("[ZK-Sync] REST API error:", error);
    sendJson(res, 500, { error: error.message });
  }
}

// Create REST server on same port as Socket.io (Socket.io handles /socket.io/*)
// We need to integrate REST with Socket.io server
httpServer.on("request", (req, res) => {
  // Let Socket.io handle its own paths
  if (req.url?.startsWith("/socket.io/")) {
    return;
  }
  handleRestApi(req, res);
});

// Auto-sync on startup - NON-BLOCKING
async function autoSync() {
  if (isAutoSyncRunning) return;
  isAutoSyncRunning = true;
  
  console.log("[ZK-Sync] Auto-sync started (non-blocking)...");
  
  const devices = Array.from(simulatedDevices.values());
  for (const device of devices) {
    if (device.status !== "syncing") {
      try {
        await syncDevice(io, device, []);
      } catch (err: any) {
        console.error(`[ZK-Sync] Auto-sync error for ${device.name}:`, err.message);
      }
    }
  }
  
  isAutoSyncRunning = false;
  console.log("[ZK-Sync] Auto-sync completed.");
}

// Start server
httpServer.listen(PORT, () => {
  console.log(`[ZK-Sync] Service running on port ${PORT}`);
  console.log("[ZK-Sync] Socket.io enabled for real-time sync updates");
  console.log("[ZK-Sync] REST API available at /api/*");
  console.log("[ZK-Sync] Key design: All sync operations are NON-BLOCKING");
});

export { io, syncDevice, simulatedDevices, simulatedAttendance };
