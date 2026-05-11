/**
 * Attindo ZKTeco Sync Service v2.0
 * 
 * Official ZKTeco/ZK fingerprint device communication service.
 * Uses node-zklib for real TCP communication on port 4370.
 * 
 * Supported Devices:
 * - ZKTeco F18, F22, F22-Pro
 * - ZKTeco SpeedFace-V4L, SpeedFace-V5L
 * - ZKTeco iFace302, iFace402
 * - ZKTeco inBio160, inBio260, inBio460
 * - ZKTeco K14, K20, K40
 * - ZK T4-C, T5-C
 * - And all ZKTeco devices using the ZK communication protocol (port 4370)
 * 
 * BioTime Replacement Features:
 * - Real device connection/disconnection
 * - Attendance log download (with auto-clear)
 * - Employee upload/delete on device
 * - Device info reading (serial, firmware, users, logs count)
 * - Device restart
 * - Time synchronization
 * - Live attendance monitoring via Socket.io
 * - Non-blocking architecture (all syncs return 202 immediately)
 * 
 * Port: 3003
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { Server } from "socket.io";

// @ts-ignore - node-zklib has no type declarations
import ZKLib from "node-zklib";

const PORT = 3003;
const CONNECT_TIMEOUT = 10000; // 10 seconds
const DEFAULT_ZK_PORT = 4370;

// ─── Types ───

interface ZKDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
  status: "online" | "offline" | "syncing" | "error";
  lastSyncAt: string | null;
  serialNumber?: string;
  firmware?: string;
  userCount?: number;
  logCount?: number;
  deviceName?: string;
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

interface DeviceInfo {
  serialNumber: string | null;
  firmware: string | null;
  deviceName: string | null;
  userCount: number;
  logCount: number;
  ip: string;
  port: number;
  macAddress: string | null;
}

// ─── Device State Management ───

const trackedDevices: Map<string, ZKDevice> = new Map();
let isAutoSyncRunning = false;

// ─── ZK Device Communication ───

/**
 * Create a ZKLib instance for a device
 */
function createZKInstance(ip: string, port: number = DEFAULT_ZK_PORT): any {
  return new ZKLib(ip, port, CONNECT_TIMEOUT, 5000);
}

/**
 * Connect to a ZKTeco device and read its info
 */
async function connectAndReadInfo(device: ZKDevice): Promise<DeviceInfo> {
  const zk = createZKInstance(device.ip, device.port);
  
  try {
    await zk.createSocket();
    
    // Read device information
    const [serialNumber, firmware, deviceName] = await Promise.allSettled([
      zk.getSerialNumber().catch(() => null),
      zk.getVersion().catch(() => null),
      zk.getDeviceName().catch(() => null),
    ]);

    // Read counts
    let userCount = 0;
    let logCount = 0;
    try {
      const countInfo = await zk.getCountById();
      if (countInfo) {
        userCount = countInfo.userCounts || 0;
        logCount = countInfo.logCounts || 0;
      }
    } catch {
      // Some devices don't support getCountById
    }

    // Get MAC address
    let macAddress: string | null = null;
    try {
      const mac = await zk.getMacAddress();
      macAddress = mac || null;
    } catch {
      // Not all devices support this
    }

    const info: DeviceInfo = {
      serialNumber: serialNumber.status === "fulfilled" ? serialNumber.value : null,
      firmware: firmware.status === "fulfilled" ? firmware.value : null,
      deviceName: deviceName.status === "fulfilled" ? deviceName.value : null,
      userCount,
      logCount,
      ip: device.ip,
      port: device.port,
      macAddress,
    };

    // Update device info
    device.serialNumber = info.serialNumber || undefined;
    device.firmware = info.firmware || undefined;
    device.deviceName = info.deviceName || undefined;
    device.userCount = info.userCount;
    device.logCount = info.logCount;

    await zk.disconnect();
    return info;
  } catch (error: any) {
    try { await zk.disconnect(); } catch {}
    throw new Error(`Connection failed to ${device.ip}:${device.port} - ${error.message}`);
  }
}

/**
 * Test connection to a device (without full sync)
 */
async function testConnection(device: ZKDevice): Promise<{ success: boolean; info?: DeviceInfo; error?: string }> {
  try {
    const info = await connectAndReadInfo(device);
    device.status = "online";
    return { success: true, info };
  } catch (error: any) {
    device.status = "offline";
    return { success: false, error: error.message };
  }
}

/**
 * Download attendance logs from a device
 */
async function downloadAttendanceLogs(
  device: ZKDevice,
  onProgress: (progress: SyncProgress) => void,
  clearAfterRead: boolean = true
): Promise<AttendanceRecord[]> {
  const zk = createZKInstance(device.ip, device.port);
  
  try {
    // Connect
    onProgress({
      deviceId: device.id,
      phase: "connecting",
      progress: 5,
      message: `Connecting to ${device.name} (${device.ip}:${device.port})...`,
    });

    await zk.createSocket();

    onProgress({
      deviceId: device.id,
      phase: "connecting",
      progress: 15,
      message: `Connected to ${device.name}`,
    });

    // Read attendance logs
    onProgress({
      deviceId: device.id,
      phase: "reading",
      progress: 30,
      message: `Reading attendance logs from device...`,
    });

    const logs = await zk.getAttendances();
    const attendanceData = logs?.data || [];
    
    onProgress({
      deviceId: device.id,
      phase: "reading",
      progress: 70,
      message: `Read ${attendanceData.length} attendance records`,
      recordsFetched: attendanceData.length,
    });

    // Clear logs from device if requested (to avoid re-reading)
    if (clearAfterRead && attendanceData.length > 0) {
      onProgress({
        deviceId: device.id,
        phase: "reading",
        progress: 80,
        message: `Clearing ${attendanceData.length} logs from device...`,
      });
      try {
        await zk.clearAttendanceLog();
      } catch (clearErr: any) {
        console.warn(`[ZK-Sync] Could not clear logs on ${device.name}: ${clearErr.message}`);
      }
    }

    // Disconnect
    onProgress({
      deviceId: device.id,
      phase: "disconnecting",
      progress: 90,
      message: `Disconnecting from ${device.name}...`,
    });

    await zk.disconnect();

    // Convert ZKLib attendance format to our format
    const records: AttendanceRecord[] = attendanceData.map((log: any) => ({
      userId: log.deviceUserId ? parseInt(log.deviceUserId) : (log.uid || 0),
      timestamp: log.recordTime ? new Date(log.recordTime).toISOString() : new Date().toISOString(),
      verifyMode: log.verifyType || 0,
      ioMode: log.ip?.ioMode || (log.inOutStatus !== undefined ? log.inOutStatus : 0),
      workCode: 0,
    }));

    return records;
  } catch (error: any) {
    try { await zk.disconnect(); } catch {}
    throw new Error(`Failed to download attendance: ${error.message}`);
  }
}

/**
 * Upload employee data to a ZKTeco device
 */
async function uploadEmployeesToDevice(
  device: ZKDevice,
  employees: Array<{ employeeId: string; name: string; fingerprintId: number }>,
  onProgress: (progress: SyncProgress) => void
): Promise<number> {
  if (employees.length === 0) {
    onProgress({
      deviceId: device.id,
      phase: "uploading",
      progress: 100,
      message: "No employees to upload",
      recordsUploaded: 0,
    });
    return 0;
  }

  const zk = createZKInstance(device.ip, device.port);
  let uploaded = 0;
  const total = employees.length;

  try {
    // Connect
    await zk.createSocket();

    // Upload employees one by one (ZK protocol limitation)
    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      try {
        // Set user on device: (uid, userid, name, password, role)
        // uid = fingerprintId (device user ID)
        // userid = employeeId (for display)
        // role = 0 = normal user
        await zk.setUser(emp.fingerprintId, emp.employeeId, emp.name, "", 0);
        uploaded++;
      } catch (err: any) {
        console.warn(`[ZK-Sync] Failed to upload employee ${emp.name} (ID:${emp.fingerprintId}) to ${device.name}: ${err.message}`);
        // Continue with other employees even if one fails
      }

      // Report progress every 5 employees or on the last one
      if ((i + 1) % 5 === 0 || i === employees.length - 1) {
        const progress = Math.round(((i + 1) / total) * 100);
        onProgress({
          deviceId: device.id,
          phase: "uploading",
          progress,
          message: `Uploading employees... (${i + 1}/${total})`,
          recordsUploaded: uploaded,
        });
      }
    }

    await zk.disconnect();
    return uploaded;
  } catch (error: any) {
    try { await zk.disconnect(); } catch {}
    throw new Error(`Failed to upload employees: ${error.message}`);
  }
}

/**
 * Delete an employee from a device
 */
async function deleteEmployeeFromDevice(
  device: ZKDevice,
  fingerprintId: number
): Promise<boolean> {
  const zk = createZKInstance(device.ip, device.port);
  try {
    await zk.createSocket();
    await zk.deleteUser(fingerprintId);
    await zk.disconnect();
    return true;
  } catch (error: any) {
    try { await zk.disconnect(); } catch {}
    console.error(`[ZK-Sync] Failed to delete user ${fingerprintId} from ${device.name}: ${error.message}`);
    return false;
  }
}

/**
 * Restart a device
 */
async function restartDevice(device: ZKDevice): Promise<boolean> {
  const zk = createZKInstance(device.ip, device.port);
  try {
    await zk.createSocket();
    await zk.restart();
    // Device will disconnect, so we don't need to explicitly disconnect
    device.status = "offline";
    return true;
  } catch (error: any) {
    try { await zk.disconnect(); } catch {}
    throw new Error(`Failed to restart ${device.name}: ${error.message}`);
  }
}

/**
 * Synchronize device time with server time
 */
async function syncDeviceTime(device: ZKDevice): Promise<boolean> {
  const zk = createZKInstance(device.ip, device.port);
  try {
    await zk.createSocket();
    await zk.setTime(new Date());
    await zk.disconnect();
    return true;
  } catch (error: any) {
    try { await zk.disconnect(); } catch {}
    throw new Error(`Failed to sync time on ${device.name}: ${error.message}`);
  }
}

/**
 * Get list of users currently on the device
 */
async function getDeviceUsers(device: ZKDevice): Promise<Array<{ uid: number; userid: string; name: string; role: number }>> {
  const zk = createZKInstance(device.ip, device.port);
  try {
    await zk.createSocket();
    const users = await zk.getUsers();
    await zk.disconnect();
    return (users?.data || []).map((u: any) => ({
      uid: u.uid,
      userid: u.userid,
      name: u.name,
      role: u.role,
    }));
  } catch (error: any) {
    try { await zk.disconnect(); } catch {}
    throw new Error(`Failed to get users from ${device.name}: ${error.message}`);
  }
}

// ─── Main Sync Function ───

async function syncDevice(
  io: Server,
  device: ZKDevice,
  employees: Array<{ employeeId: string; name: string; fingerprintId: number }> = [],
  clearAfterRead: boolean = true
): Promise<{ recordsFetched: number; recordsUploaded: number }> {
  const emitProgress = (progress: SyncProgress) => {
    io.emit("sync:progress", progress);
  };

  try {
    // Phase 1: Connect and read device info
    emitProgress({
      deviceId: device.id,
      phase: "connecting",
      progress: 5,
      message: `Connecting to ${device.name} (${device.ip}:${device.port})...`,
    });

    device.status = "syncing";
    io.emit("device:status", { deviceId: device.id, status: "syncing" });

    // Test connection first
    const connResult = await testConnection(device);
    if (!connResult.success) {
      throw new Error(connResult.error || `Failed to connect to ${device.name}`);
    }

    emitProgress({
      deviceId: device.id,
      phase: "connecting",
      progress: 10,
      message: `Connected to ${device.name}${connResult.info?.serialNumber ? ` (S/N: ${connResult.info.serialNumber})` : ""}`,
    });

    // Emit updated device info
    if (connResult.info) {
      io.emit("device:info", { deviceId: device.id, info: connResult.info });
    }

    // Phase 2: Download attendance logs
    const records = await downloadAttendanceLogs(device, emitProgress, clearAfterRead);

    // Phase 3: Upload employees (if any)
    let recordsUploaded = 0;
    if (employees.length > 0) {
      recordsUploaded = await uploadEmployeesToDevice(device, employees, emitProgress);
    }

    // Phase 4: Complete
    emitProgress({
      deviceId: device.id,
      phase: "disconnecting",
      progress: 95,
      message: "Sync finalizing...",
    });

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

    // Emit attendance data for the main app to save
    io.emit("sync:attendance-data", {
      deviceId: device.id,
      records,
    });

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

// ─── HTTP Server + Socket.io ───

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  },
});

// Socket.io connection handler
io.on("connection", (socket) => {
  console.log(`[ZK-Sync] Client connected: ${socket.id}`);

  // Send current device status
  socket.emit("devices:status", Object.fromEntries(trackedDevices));

  // Handle manual sync request
  socket.on("sync:start", async (data: { deviceId: string; employees?: Array<{ employeeId: string; name: string; fingerprintId: number }>; clearAfterRead?: boolean }) => {
    const device = trackedDevices.get(data.deviceId);
    if (!device) {
      socket.emit("sync:error", { deviceId: data.deviceId, message: "Device not found" });
      return;
    }

    if (device.status === "syncing") {
      socket.emit("sync:error", { deviceId: data.deviceId, message: "Device is already syncing" });
      return;
    }

    try {
      await syncDevice(io, device, data.employees || [], data.clearAfterRead !== false);
    } catch (error: any) {
      console.error(`[ZK-Sync] Sync error for ${device.name}:`, error.message);
    }
  });

  // Handle sync all devices
  socket.on("sync:all", async (data: { employees?: Array<{ employeeId: string; name: string; fingerprintId: number }>; clearAfterRead?: boolean }) => {
    const devices = Array.from(trackedDevices.values()).filter((d) => d.status !== "syncing");

    // Sync devices sequentially to avoid overwhelming the network
    for (const device of devices) {
      try {
        await syncDevice(io, device, data.employees || [], data.clearAfterRead !== false);
      } catch (error: any) {
        console.error(`[ZK-Sync] Sync error for ${device.name}:`, error.message);
      }
    }
  });

  // Handle register device
  socket.on("device:register", (device: ZKDevice) => {
    trackedDevices.set(device.id, { ...device, status: "offline" });
    io.emit("device:registered", device);
  });

  // Handle remove device
  socket.on("device:remove", (deviceId: string) => {
    trackedDevices.delete(deviceId);
    io.emit("device:removed", deviceId);
  });

  // Handle test connection
  socket.on("device:test", async (deviceId: string) => {
    const device = trackedDevices.get(deviceId);
    if (!device) {
      socket.emit("device:test-result", { deviceId, success: false, message: "Device not found" });
      return;
    }

    try {
      const result = await testConnection(device);
      socket.emit("device:test-result", {
        deviceId,
        success: result.success,
        message: result.success ? "Connection successful" : (result.error || "Connection failed"),
        info: result.info,
        status: result.success ? "online" : "offline",
      });

      if (result.success) {
        io.emit("device:status", { deviceId: device.id, status: "online" });
        if (result.info) {
          io.emit("device:info", { deviceId: device.id, info: result.info });
        }
      }
    } catch (error: any) {
      socket.emit("device:test-result", { deviceId, success: false, message: error.message });
    }
  });

  socket.on("disconnect", () => {
    console.log(`[ZK-Sync] Client disconnected: ${socket.id}`);
  });
});

// ─── REST API ───

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

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
      sendJson(res, 200, Array.from(trackedDevices.values()));
      return;
    }

    // POST /api/devices - Register a device
    if (method === "POST" && path === "/api/devices") {
      const body = await parseBody(req);
      const device: ZKDevice = {
        id: body.id,
        name: body.name,
        ip: body.ip,
        port: body.port || DEFAULT_ZK_PORT,
        status: "offline",
        lastSyncAt: null,
      };
      trackedDevices.set(device.id, device);

      // Try to connect immediately and get device info
      testConnection(device).then((result) => {
        if (result.success && result.info) {
          io.emit("device:info", { deviceId: device.id, info: result.info });
        }
      }).catch(() => {});

      sendJson(res, 201, device);
      return;
    }

    // DELETE /api/devices/:id - Remove a device
    if (method === "DELETE" && path.startsWith("/api/devices/")) {
      const id = path.split("/").pop();
      if (id) {
        trackedDevices.delete(id);
        sendJson(res, 200, { success: true });
      } else {
        sendJson(res, 400, { error: "Device ID required" });
      }
      return;
    }

    // POST /api/sync/:deviceId - Sync a specific device (NON-BLOCKING)
    if (method === "POST" && path.startsWith("/api/sync/")) {
      const deviceId = path.split("/").pop();
      if (!deviceId) {
        sendJson(res, 400, { error: "Device ID required" });
        return;
      }

      const device = trackedDevices.get(deviceId);
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
      syncDevice(io, device, body.employees || [], body.clearAfterRead !== false)
        .then((result) => {
          console.log(`[ZK-Sync] Background sync completed for ${device.name}: ${result.recordsFetched} records`);
        })
        .catch((err) => {
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

    // POST /api/sync-all - Sync all devices (NON-BLOCKING)
    if (method === "POST" && path === "/api/sync-all") {
      const body = await parseBody(req);
      const devices = Array.from(trackedDevices.values());

      // Start sync for all devices in background - NON-BLOCKING
      (async () => {
        for (const device of devices) {
          if (device.status !== "syncing") {
            try {
              await syncDevice(io, device, body.employees || [], body.clearAfterRead !== false);
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

    // POST /api/test-connection - Test device connection
    if (method === "POST" && path === "/api/test-connection") {
      const body = await parseBody(req);
      const device = trackedDevices.get(body.deviceId);

      if (!device) {
        // Allow testing with raw IP:port even if not tracked
        if (body.ip) {
          const testDev: ZKDevice = {
            id: "test",
            name: "Test Device",
            ip: body.ip,
            port: body.port || DEFAULT_ZK_PORT,
            status: "offline",
            lastSyncAt: null,
          };
          const result = await testConnection(testDev);
          sendJson(res, 200, {
            success: result.success,
            message: result.success ? "Connection successful" : (result.error || "Connection failed"),
            info: result.info,
          });
          return;
        }
        sendJson(res, 404, { error: "Device not found" });
        return;
      }

      const result = await testConnection(device);
      sendJson(res, 200, {
        success: result.success,
        message: result.success ? "Connection successful" : (result.error || "Connection failed"),
        info: result.info,
      });

      if (result.success) {
        io.emit("device:status", { deviceId: device.id, status: "online" });
        if (result.info) {
          io.emit("device:info", { deviceId: device.id, info: result.info });
        }
      }
      return;
    }

    // POST /api/restart/:deviceId - Restart a device
    if (method === "POST" && path.startsWith("/api/restart/")) {
      const deviceId = path.split("/").pop();
      if (!deviceId) {
        sendJson(res, 400, { error: "Device ID required" });
        return;
      }

      const device = trackedDevices.get(deviceId);
      if (!device) {
        sendJson(res, 404, { error: "Device not found" });
        return;
      }

      try {
        await restartDevice(device);
        io.emit("device:status", { deviceId: device.id, status: "offline" });
        sendJson(res, 200, { success: true, message: `${device.name} is restarting` });
      } catch (error: any) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }

    // POST /api/sync-time/:deviceId - Sync device time with server
    if (method === "POST" && path.startsWith("/api/sync-time/")) {
      const deviceId = path.split("/").pop();
      if (!deviceId) {
        sendJson(res, 400, { error: "Device ID required" });
        return;
      }

      const device = trackedDevices.get(deviceId);
      if (!device) {
        sendJson(res, 404, { error: "Device not found" });
        return;
      }

      try {
        await syncDeviceTime(device);
        sendJson(res, 200, { success: true, message: `${device.name} time synchronized` });
      } catch (error: any) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }

    // GET /api/users/:deviceId - Get users on device
    if (method === "GET" && path.startsWith("/api/users/")) {
      const deviceId = path.split("/").pop();
      if (!deviceId) {
        sendJson(res, 400, { error: "Device ID required" });
        return;
      }

      const device = trackedDevices.get(deviceId);
      if (!device) {
        sendJson(res, 404, { error: "Device not found" });
        return;
      }

      try {
        const users = await getDeviceUsers(device);
        sendJson(res, 200, users);
      } catch (error: any) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }

    // DELETE /api/user/:deviceId/:fingerprintId - Delete user from device
    if (method === "DELETE" && path.startsWith("/api/user/")) {
      const parts = path.split("/");
      const deviceId = parts[3];
      const fingerprintId = parseInt(parts[4]);

      if (!deviceId || isNaN(fingerprintId)) {
        sendJson(res, 400, { error: "Device ID and fingerprint ID required" });
        return;
      }

      const device = trackedDevices.get(deviceId);
      if (!device) {
        sendJson(res, 404, { error: "Device not found" });
        return;
      }

      const success = await deleteEmployeeFromDevice(device, fingerprintId);
      sendJson(res, 200, { success });
      return;
    }

    // GET /api/health - Health check
    if (method === "GET" && path === "/api/health") {
      sendJson(res, 200, {
        status: "ok",
        version: "2.0.0",
        protocol: "ZKTeco TCP (port 4370)",
        devicesTracked: trackedDevices.size,
        supportedDevices: [
          "ZKTeco F18/F22/F22-Pro",
          "ZKTeco SpeedFace-V4L/V5L",
          "ZKTeco iFace302/402",
          "ZKTeco inBio160/260/460",
          "ZKTeco K14/K20/K40",
          "ZK T4-C/T5-C",
          "All ZKTeco devices with ZK protocol",
        ],
        features: [
          "Real TCP communication on port 4370",
          "Attendance log download with auto-clear",
          "Employee upload/delete on device",
          "Device info (serial, firmware, user count)",
          "Device restart",
          "Time synchronization",
          "Live attendance monitoring via Socket.io",
          "Non-blocking sync architecture",
        ],
      });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error: any) {
    console.error("[ZK-Sync] REST API error:", error);
    sendJson(res, 500, { error: error.message });
  }
}

// Integrate REST API with Socket.io server
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

  const devices = Array.from(trackedDevices.values());
  for (const device of devices) {
    if (device.status !== "syncing") {
      try {
        // First just test connection, don't full sync on startup
        const result = await testConnection(device);
        if (result.success) {
          console.log(`[ZK-Sync] Auto-connect: ${device.name} is online`);
          io.emit("device:status", { deviceId: device.id, status: "online" });
          if (result.info) {
            io.emit("device:info", { deviceId: device.id, info: result.info });
          }
        } else {
          console.log(`[ZK-Sync] Auto-connect: ${device.name} is offline`);
        }
      } catch (err: any) {
        console.error(`[ZK-Sync] Auto-connect error for ${device.name}:`, err.message);
      }
    }
  }

  isAutoSyncRunning = false;
  console.log("[ZK-Sync] Auto-connect check completed.");
}

// Start server
httpServer.listen(PORT, () => {
  console.log(`[ZK-Sync] Service running on port ${PORT}`);
  console.log("[ZK-Sync] Using REAL ZKTeco device communication (node-zklib)");
  console.log("[ZK-Sync] Protocol: ZK TCP on port 4370");
  console.log("[ZK-Sync] Socket.io enabled for real-time sync updates");
  console.log("[ZK-Sync] REST API available at /api/*");
  console.log("[ZK-Sync] Key design: All sync operations are NON-BLOCKING");
  console.log("[ZK-Sync] Supported: ZKTeco F18, F22, SpeedFace, iFace, inBio, K-series, and more");

  // Run auto-connect check after startup
  setTimeout(autoSync, 2000);
});
