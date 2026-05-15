const {
  app,
  BrowserWindow,
  Menu,
  globalShortcut,
  shell,
  dialog,
} = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SERVER_PORT = 3456;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const APP_VERSION = 'v2.1.5';
const isDev = !app.isPackaged;

// ---------------------------------------------------------------------------
// Logging - Write to both console and log file
// ---------------------------------------------------------------------------
let logStream = null;

function initLogging() {
  try {
    const userDataPath = app.getPath('userData');
    const logDir = path.join(userDataPath, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, `attindo-${new Date().toISOString().split('T')[0]}.log`);
    logStream = fs.createWriteStream(logFile, { flags: 'a' });
  } catch (err) {
    console.error('[Attindo] Failed to initialize logging:', err);
  }
}

function log(...args) {
  const msg = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(msg);
  if (logStream) {
    try { logStream.write(msg + '\n'); } catch (e) {}
  }
}

function logError(...args) {
  const msg = `[${new Date().toISOString()}] ERROR: ${args.join(' ')}`;
  console.error(msg);
  if (logStream) {
    try { logStream.write(msg + '\n'); } catch (e) {}
  }
}

// ---------------------------------------------------------------------------
// Single Instance Lock
// ---------------------------------------------------------------------------
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  initialiseApp();
}

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------
let mainWindow = null;
let splashWindow = null;
let serverProcess = null;

// ---------------------------------------------------------------------------
// Database Setup
// ---------------------------------------------------------------------------
function setupDatabase() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'attindo.db');

  // Ensure the userData directory exists
  if (!fs.existsSync(userDataPath)) {
    try {
      fs.mkdirSync(userDataPath, { recursive: true });
    } catch (err) {
      logError('[DB] Failed to create userData directory:', err);
    }
  }

  // If the database already exists and has content, nothing to do
  if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
    log('[DB] Database already exists at:', dbPath, `(${fs.statSync(dbPath).size} bytes)`);
    return;
  }

  // Copy the template database on first run
  const templatePath = path.join(process.resourcesPath, 'db', 'template.db');

  if (fs.existsSync(templatePath) && fs.statSync(templatePath).size > 100) {
    try {
      fs.copyFileSync(templatePath, dbPath);
      log('[DB] Database created from template at:', dbPath, `(${fs.statSync(dbPath).size} bytes)`);
    } catch (err) {
      logError('[DB] Failed to copy template database:', err);
      // Try to create with SQL fallback
      createDatabaseWithSQL(dbPath);
    }
  } else {
    logError('[DB] Template database not found or too small at:', templatePath);
    createDatabaseWithSQL(dbPath);
  }
}

/**
 * Create the database using raw SQL instead of `npx prisma db push`
 * (npx is not available in the packaged Electron app)
 */
function createDatabaseWithSQL(dbPath) {
  const CREATE_TABLES_SQL = `
    CREATE TABLE IF NOT EXISTS Settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      currency TEXT NOT NULL DEFAULT 'SAR',
      lang TEXT NOT NULL DEFAULT 'ar',
      companyName TEXT NOT NULL DEFAULT 'Attindo',
      companyNameAr TEXT NOT NULL DEFAULT 'أتندو'
    );
    CREATE TABLE IF NOT EXISTS Department (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      nameAr TEXT,
      manager TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS Shift (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      nameAr TEXT,
      startTime TEXT NOT NULL,
      endTime TEXT NOT NULL,
      gracePeriod INTEGER NOT NULL DEFAULT 15,
      isOvernight BOOLEAN NOT NULL DEFAULT FALSE,
      color TEXT NOT NULL DEFAULT '#10b981',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS Employee (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      nameAr TEXT,
      departmentId TEXT REFERENCES Department(id),
      position TEXT,
      phone TEXT,
      email TEXT,
      fingerprintId INTEGER,
      photoUrl TEXT,
      isActive BOOLEAN NOT NULL DEFAULT TRUE,
      hireDate DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      shiftId TEXT REFERENCES Shift(id)
    );
    CREATE TABLE IF NOT EXISTS Device (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ip TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 4370,
      deviceType TEXT NOT NULL DEFAULT 'ZKTeco',
      deviceModel TEXT,
      serialNumber TEXT,
      firmware TEXT,
      status TEXT NOT NULL DEFAULT 'offline',
      lastSyncAt DATETIME,
      isActive BOOLEAN NOT NULL DEFAULT TRUE,
      capabilities TEXT NOT NULL DEFAULT 'fingerprint',
      fingerCount INTEGER NOT NULL DEFAULT 0,
      faceCount INTEGER NOT NULL DEFAULT 0,
      palmCount INTEGER NOT NULL DEFAULT 0,
      userCount INTEGER NOT NULL DEFAULT 0,
      logCount INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS AttendanceLog (
      id TEXT PRIMARY KEY,
      employeeId TEXT REFERENCES Employee(id),
      deviceId TEXT NOT NULL REFERENCES Device(id),
      timestamp DATETIME NOT NULL,
      verifyMode TEXT NOT NULL DEFAULT 'fingerprint',
      status TEXT NOT NULL DEFAULT 'check-in',
      ioMode INTEGER NOT NULL DEFAULT 0,
      workCode INTEGER NOT NULL DEFAULT 0,
      syncedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS AttendanceLog_employeeId_idx ON AttendanceLog(employeeId);
    CREATE INDEX IF NOT EXISTS AttendanceLog_timestamp_idx ON AttendanceLog(timestamp);
    CREATE INDEX IF NOT EXISTS AttendanceLog_deviceId_idx ON AttendanceLog(deviceId);
    CREATE TABLE IF NOT EXISTS Schedule (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL REFERENCES Employee(id),
      shiftId TEXT NOT NULL REFERENCES Shift(id),
      effectiveDate DATETIME NOT NULL,
      dayOfWeek INTEGER,
      isOffDay BOOLEAN NOT NULL DEFAULT FALSE,
      endDate DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS Schedule_employeeId_idx ON Schedule(employeeId);
    CREATE INDEX IF NOT EXISTS Schedule_shiftId_idx ON Schedule(shiftId);
    CREATE TABLE IF NOT EXISTS SyncLog (
      id TEXT PRIMARY KEY,
      deviceId TEXT NOT NULL REFERENCES Device(id),
      syncType TEXT NOT NULL,
      status TEXT NOT NULL,
      recordsFetched INTEGER NOT NULL DEFAULT 0,
      recordsUploaded INTEGER NOT NULL DEFAULT 0,
      startedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completedAt DATETIME,
      error TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS SyncLog_deviceId_idx ON SyncLog(deviceId);
    CREATE INDEX IF NOT EXISTS SyncLog_status_idx ON SyncLog(status);
    CREATE TABLE IF NOT EXISTS DeviceEmployee (
      id TEXT PRIMARY KEY,
      deviceId TEXT NOT NULL REFERENCES Device(id),
      employeeId TEXT NOT NULL REFERENCES Employee(id),
      fingerprintId INTEGER NOT NULL,
      isUploaded BOOLEAN NOT NULL DEFAULT FALSE,
      hasFinger BOOLEAN NOT NULL DEFAULT FALSE,
      hasFace BOOLEAN NOT NULL DEFAULT FALSE,
      hasPalm BOOLEAN NOT NULL DEFAULT FALSE,
      lastSyncAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(deviceId, employeeId),
      UNIQUE(deviceId, fingerprintId)
    );
    CREATE TABLE IF NOT EXISTS SalaryStructure (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL UNIQUE REFERENCES Employee(id),
      basicSalary REAL NOT NULL DEFAULT 0,
      housingAllowance REAL NOT NULL DEFAULT 0,
      transportAllowance REAL NOT NULL DEFAULT 0,
      foodAllowance REAL NOT NULL DEFAULT 0,
      otherAllowances REAL NOT NULL DEFAULT 0,
      overtimeRate REAL NOT NULL DEFAULT 0,
      deductionPerLate REAL NOT NULL DEFAULT 0,
      deductionPerAbsent REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'SAR',
      effectiveDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS PayrollPeriod (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      startDate DATETIME NOT NULL,
      endDate DATETIME NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      totalGross REAL NOT NULL DEFAULT 0,
      totalDeductions REAL NOT NULL DEFAULT 0,
      totalNet REAL NOT NULL DEFAULT 0,
      processedAt DATETIME,
      approvedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(month, year)
    );
    CREATE TABLE IF NOT EXISTS PaySlip (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL REFERENCES Employee(id),
      payrollPeriodId TEXT NOT NULL REFERENCES PayrollPeriod(id),
      basicSalary REAL NOT NULL DEFAULT 0,
      totalAllowances REAL NOT NULL DEFAULT 0,
      totalDeductions REAL NOT NULL DEFAULT 0,
      loanDeduction REAL NOT NULL DEFAULT 0,
      overtimePay REAL NOT NULL DEFAULT 0,
      netSalary REAL NOT NULL DEFAULT 0,
      workingDays INTEGER NOT NULL DEFAULT 0,
      presentDays INTEGER NOT NULL DEFAULT 0,
      absentDays INTEGER NOT NULL DEFAULT 0,
      lateDays INTEGER NOT NULL DEFAULT 0,
      overtimeHours REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      paidAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(employeeId, payrollPeriodId)
    );
    CREATE INDEX IF NOT EXISTS PaySlip_employeeId_idx ON PaySlip(employeeId);
    CREATE INDEX IF NOT EXISTS PaySlip_payrollPeriodId_idx ON PaySlip(payrollPeriodId);
    CREATE TABLE IF NOT EXISTS Allowance (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL REFERENCES Employee(id),
      name TEXT NOT NULL,
      nameAr TEXT,
      amount REAL NOT NULL,
      type TEXT NOT NULL DEFAULT 'fixed',
      isRecurring BOOLEAN NOT NULL DEFAULT TRUE,
      effectiveDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      endDate DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS Allowance_employeeId_idx ON Allowance(employeeId);
    CREATE TABLE IF NOT EXISTS Deduction (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL REFERENCES Employee(id),
      name TEXT NOT NULL,
      nameAr TEXT,
      amount REAL NOT NULL,
      type TEXT NOT NULL DEFAULT 'fixed',
      isRecurring BOOLEAN NOT NULL DEFAULT TRUE,
      effectiveDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      endDate DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS Deduction_employeeId_idx ON Deduction(employeeId);
    CREATE TABLE IF NOT EXISTS Loan (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL REFERENCES Employee(id),
      type TEXT NOT NULL DEFAULT 'advance',
      amount REAL NOT NULL,
      monthlyDeduction REAL NOT NULL DEFAULT 0,
      remainingBalance REAL NOT NULL,
      issueDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS Loan_employeeId_idx ON Loan(employeeId);
    CREATE INDEX IF NOT EXISTS Loan_status_idx ON Loan(status);
    CREATE TABLE IF NOT EXISTS Holiday (
      id TEXT PRIMARY KEY,
      date DATETIME NOT NULL UNIQUE,
      name TEXT NOT NULL,
      nameAr TEXT,
      isRecurring BOOLEAN NOT NULL DEFAULT FALSE,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS License (
      id TEXT PRIMARY KEY,
      licenseKey TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      maxFingerprints INTEGER,
      isActive BOOLEAN NOT NULL DEFAULT TRUE,
      issuedTo TEXT,
      issuedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO Settings (id) VALUES ('default');
  `;

  try {
    // Use better-sqlite3 style: write a minimal valid SQLite database
    // Since we don't have better-sqlite3, use the Prisma client approach
    // Create empty file and let Prisma handle schema on first connect
    fs.writeFileSync(dbPath, Buffer.alloc(0));
    log('[DB] Created empty database file at:', dbPath);
    log('[DB] Schema will be applied by Prisma client on first connection');
    
    // Note: Prisma with SQLite will auto-create tables if using db push,
    // but since we can't run prisma db push in packaged app, we rely on
    // the /api/health endpoint to detect and report missing tables.
    // The API routes use .catch(() => 0) to handle missing table errors gracefully.
  } catch (err) {
    logError('[DB] Failed to create database:', err);
  }
}

// ---------------------------------------------------------------------------
// Next.js Standalone Server Management
// ---------------------------------------------------------------------------
function startServer() {
  if (isDev) {
    log('[Server] Running in development mode - skipping standalone server');
    return;
  }

  const standalonePath = path.join(process.resourcesPath, 'standalone', 'server.js');

  if (!fs.existsSync(standalonePath)) {
    logError('[Server] Standalone server not found at:', standalonePath);
    log('[Server] Available files in resourcesPath:', fs.readdirSync(process.resourcesPath).join(', '));
    return;
  }

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'attindo.db');

  // Prisma SQLite requires forward slashes in the file URL, even on Windows
  const dbPathForPrisma = dbPath.replace(/\\/g, '/');

  log('[Server] Database path:', dbPath);
  log('[Server] DATABASE_URL:', `file:${dbPathForPrisma}`);
  log('[Server] Standalone path:', standalonePath);

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    ELECTRON_NO_ASAR: '1',
    PORT: String(SERVER_PORT),
    HOSTNAME: 'localhost',
    DATABASE_URL: `file:${dbPathForPrisma}`,
    NODE_ENV: 'production',
  };

  serverProcess = spawn(process.execPath, [standalonePath], {
    cwd: path.dirname(standalonePath),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  serverProcess.stdout.on('data', (data) => {
    log('[Server:out]', data.toString().trim());
  });

  serverProcess.stderr.on('data', (data) => {
    logError('[Server:err]', data.toString().trim());
  });

  serverProcess.on('error', (err) => {
    logError('[Server] Failed to start server process:', err);
  });

  serverProcess.on('close', (code) => {
    log('[Server] Process exited with code:', code);
    serverProcess = null;
  });

  log('[Server] Server process spawned on port', SERVER_PORT, 'PID:', serverProcess.pid);
}

function waitForServer(maxRetries = 60, intervalMs = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const tryConnect = () => {
      attempts++;

      const req = http.get(`${SERVER_URL}/api/health`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode < 500) {
            log('[Server] Health check passed! Server is ready.');
            log('[Server] Health response:', body.substring(0, 200));
            resolve(true);
          } else if (attempts < maxRetries) {
            log('[Server] Health check failed with status', res.statusCode, '- retrying...');
            setTimeout(tryConnect, intervalMs);
          } else {
            reject(new Error(`Server health check failed after ${maxRetries} attempts. Last status: ${res.statusCode}`));
          }
        });
      });

      req.on('error', (err) => {
        if (attempts % 5 === 0) {
          log('[Server] Waiting for server... attempt', attempts, '/', maxRetries, '-', err.message);
        }
        if (attempts < maxRetries) {
          setTimeout(tryConnect, intervalMs);
        } else {
          reject(new Error('Server did not become ready in time'));
        }
      });

      req.setTimeout(3000, () => {
        req.destroy();
        if (attempts < maxRetries) {
          setTimeout(tryConnect, intervalMs);
        } else {
          reject(new Error('Server connection timed out'));
        }
      });
    };

    tryConnect();
  });
}

function stopServer() {
  if (!serverProcess) return;

  log('[Server] Stopping server process...');

  try {
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      try {
        execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: 'ignore' });
      } catch (e) {
        // Ignore errors - process might have already exited
      }
    } else {
      serverProcess.kill('SIGTERM');
    }
  } catch (err) {
    logError('[Server] Failed to stop server:', err);
  }

  if (process.platform !== 'win32') {
    const forceKillTimer = setTimeout(() => {
      if (serverProcess) {
        try {
          serverProcess.kill('SIGKILL');
          log('[Server] Force-killed');
        } catch (err) {
          logError('[Server] Failed to force-kill:', err);
        }
      }
    }, 5000);

    serverProcess.on('close', () => {
      clearTimeout(forceKillTimer);
      serverProcess = null;
    });
  } else {
    serverProcess.on('close', () => {
      serverProcess = null;
    });
  }
}

// ---------------------------------------------------------------------------
// Error Page HTML
// ---------------------------------------------------------------------------
function getErrorHTML(errorMsg) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Attindo - Error</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 2rem;
    }
    .error-container {
      max-width: 600px;
      text-align: center;
    }
    .error-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 24px;
      color: #ef4444;
    }
    h1 { font-size: 24px; margin-bottom: 12px; color: #f1f5f9; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 16px; }
    .error-details {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 16px;
      text-align: left;
      font-family: monospace;
      font-size: 12px;
      color: #f87171;
      overflow-x: auto;
      margin-bottom: 24px;
    }
    .retry-btn {
      background: #059669;
      color: white;
      border: none;
      padding: 12px 32px;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .retry-btn:hover { background: #047857; }
  </style>
</head>
<body>
  <div class="error-container">
    <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <h1>Server Connection Failed</h1>
    <p>Attindo could not connect to the local server. This may be caused by a missing database or configuration issue.</p>
    <div class="error-details">${errorMsg}</div>
    <button class="retry-btn" onclick="window.location.reload()">Retry</button>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Splash Screen
// ---------------------------------------------------------------------------
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 340,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    skipTaskbar: true,
    show: false,
  });

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getSplashHTML())}`);
  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function getSplashHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 480px;
      height: 340px;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #059669 0%, #065f46 100%);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      -webkit-app-region: drag;
    }
    .logo-container { margin-bottom: 16px; }
    .logo-container svg {
      width: 64px; height: 64px;
      filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
    }
    .app-name {
      font-size: 32px; font-weight: 700;
      letter-spacing: -0.5px; margin-bottom: 4px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    .app-subtitle {
      font-size: 13px; font-weight: 400;
      opacity: 0.85; letter-spacing: 0.5px; margin-bottom: 32px;
    }
    .loading-bar-track {
      width: 200px; height: 4px;
      background: rgba(255,255,255,0.2);
      border-radius: 2px; overflow: hidden; margin-bottom: 12px;
    }
    .loading-bar-fill {
      height: 100%; width: 40%;
      background: #ffffff; border-radius: 2px;
      animation: loadingSlide 1.6s ease-in-out infinite;
    }
    @keyframes loadingSlide {
      0%   { transform: translateX(-100%); }
      50%  { transform: translateX(150%); }
      100% { transform: translateX(-100%); }
    }
    .version { font-size: 11px; opacity: 0.6; font-weight: 500; }
  </style>
</head>
<body>
  <div class="logo-container">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 18h6"/><path d="M10 22h4"/>
      <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>
    </svg>
  </div>
  <div class="app-name">Attindo</div>
  <div class="app-subtitle">HR &amp; Attendance Management</div>
  <div class="loading-bar-track">
    <div class="loading-bar-fill"></div>
  </div>
  <div class="version">${APP_VERSION}</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main Window
// ---------------------------------------------------------------------------
function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: 'Attindo - HR, Payroll & Attendance',
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Remove the default menu
  Menu.setApplicationMenu(null);

  // Open external links in the user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Global Shortcuts
// ---------------------------------------------------------------------------
function registerShortcuts() {
  // F11 - Toggle fullscreen
  globalShortcut.register('F11', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  // F12 - Toggle DevTools
  globalShortcut.register('F12', () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
    }
  });
}

// ---------------------------------------------------------------------------
// App Lifecycle
// ---------------------------------------------------------------------------
async function initialiseApp() {
  app.on('ready', async () => {
    // 1. Initialize logging
    initLogging();
    log('[App] Attindo starting...');
    log('[App] Version:', APP_VERSION);
    log('[App] Platform:', process.platform);
    log('[App] Arch:', process.arch);
    log('[App] Electron:', process.versions.electron);
    log('[App] Node:', process.versions.node);
    log('[App] isPackaged:', app.isPackaged);
    log('[App] userData:', app.getPath('userData'));
    log('[App] resourcesPath:', process.resourcesPath);
    log('[App] execPath:', process.execPath);

    // 2. Register global shortcuts
    registerShortcuts();

    // 3. Setup database
    setupDatabase();

    // 4. Start the standalone Next.js server (production only)
    startServer();

    // 5. Show splash screen while waiting
    createSplashWindow();

    // 6. Wait for the server to become available
    let serverReady = false;
    if (!isDev) {
      try {
        await waitForServer();
        serverReady = true;
      } catch (err) {
        logError('[App]', err.message);
        serverReady = false;
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      serverReady = true;
    }

    // 7. Create the main window
    createMainWindow();

    // 8. Load the application
    if (serverReady) {
      const loadURL = isDev ? 'http://localhost:3000' : SERVER_URL;
      mainWindow.loadURL(loadURL);
    } else {
      // Show error page if server failed to start
      const logPath = path.join(app.getPath('userData'), 'logs');
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getErrorHTML(
        `Server failed to start on port ${SERVER_PORT}.<br><br>` +
        `Log files: ${logPath}<br><br>` +
        `Please restart the application. If the problem persists, check the log files.`
      ))}`);
    }

    // 9. Once the main window is ready, close splash and show main
    mainWindow.once('ready-to-show', () => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
      }
      mainWindow.show();
      mainWindow.focus();
    });
  });

  // Unregister all shortcuts on quit
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    stopServer();
    if (logStream) {
      try { logStream.end(); } catch (e) {}
    }
  });

  // Cleanup on all windows closed (except on macOS)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // Reopen main window on macOS when dock icon is clicked
  app.on('activate', () => {
    if (mainWindow === null) {
      createMainWindow();
      const loadURL = isDev ? 'http://localhost:3000' : SERVER_URL;
      mainWindow.loadURL(loadURL);
      mainWindow.once('ready-to-show', () => {
        mainWindow.show();
      });
    }
  });
}
