const {
  app,
  BrowserWindow,
  Menu,
  globalShortcut,
  shell,
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
const APP_VERSION = 'v2.1.0';
const isDev = !app.isPackaged;

// ---------------------------------------------------------------------------
// Single Instance Lock
// ---------------------------------------------------------------------------
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Continue with app initialisation
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

  // If the database already exists, nothing to do
  if (fs.existsSync(dbPath)) {
    console.log('[Attindo] Database already exists at:', dbPath);
    return;
  }

  // Copy the template database on first run
  const templatePath = path.join(process.resourcesPath, 'db', 'template.db');

  if (fs.existsSync(templatePath)) {
    try {
      // Ensure the userData directory exists
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }
      fs.copyFileSync(templatePath, dbPath);
      console.log('[Attindo] Database created from template at:', dbPath);
    } catch (err) {
      console.error('[Attindo] Failed to copy template database:', err);
    }
  } else {
    console.warn('[Attindo] Template database not found at:', templatePath);
    // Create an empty file so Prisma can still operate
    try {
      fs.writeFileSync(dbPath, Buffer.alloc(0));
      console.log('[Attindo] Created empty database at:', dbPath);
    } catch (err) {
      console.error('[Attindo] Failed to create empty database:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Next.js Standalone Server Management
// ---------------------------------------------------------------------------
function startServer() {
  if (isDev) {
    console.log('[Attindo] Running in development mode — skipping standalone server');
    return;
  }

  const standalonePath = path.join(process.resourcesPath, 'standalone', 'server.js');

  if (!fs.existsSync(standalonePath)) {
    console.error('[Attindo] Standalone server not found at:', standalonePath);
    return;
  }

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'attindo.db');

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    ELECTRON_NO_ASAR: '1',
    PORT: String(SERVER_PORT),
    HOSTNAME: 'localhost',
    DATABASE_URL: `file:${dbPath}`,
  };

  serverProcess = spawn(process.execPath, [standalonePath], {
    cwd: path.dirname(standalonePath),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (data) => {
    console.log('[Server:out]', data.toString().trim());
  });

  serverProcess.stderr.on('data', (data) => {
    console.log('[Server:err]', data.toString().trim());
  });

  serverProcess.on('error', (err) => {
    console.error('[Attindo] Failed to start server process:', err);
  });

  serverProcess.on('close', (code) => {
    console.log('[Attindo] Server process exited with code:', code);
    serverProcess = null;
  });

  console.log('[Attindo] Server process spawned on port', SERVER_PORT);
}

function waitForServer(maxRetries = 60, intervalMs = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const tryConnect = () => {
      attempts++;

      const req = http.get(SERVER_URL, (res) => {
        res.resume(); // Consume response data
        if (res.statusCode && res.statusCode < 500) {
          console.log('[Attindo] Server is ready!');
          resolve(true);
        } else if (attempts < maxRetries) {
          setTimeout(tryConnect, intervalMs);
        } else {
          reject(new Error('Server responded with error status'));
        }
      });

      req.on('error', () => {
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

  console.log('[Attindo] Stopping server process...');

  try {
    serverProcess.kill('SIGTERM');
  } catch (err) {
    console.error('[Attindo] Failed to send SIGTERM:', err);
  }

  // Force kill after 5 seconds if still running
  const forceKillTimer = setTimeout(() => {
    if (serverProcess) {
      try {
        serverProcess.kill('SIGKILL');
        console.log('[Attindo] Server force-killed');
      } catch (err) {
        console.error('[Attindo] Failed to force-kill server:', err);
      }
    }
  }, 5000);

  serverProcess.on('close', () => {
    clearTimeout(forceKillTimer);
    serverProcess = null;
  });
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
  return /* html */ `
<!DOCTYPE html>
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

    .logo-container {
      margin-bottom: 16px;
    }

    .logo-container svg {
      width: 64px;
      height: 64px;
      filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
    }

    .app-name {
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin-bottom: 4px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }

    .app-subtitle {
      font-size: 13px;
      font-weight: 400;
      opacity: 0.85;
      letter-spacing: 0.5px;
      margin-bottom: 32px;
    }

    .loading-bar-track {
      width: 200px;
      height: 4px;
      background: rgba(255,255,255,0.2);
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 12px;
    }

    .loading-bar-fill {
      height: 100%;
      width: 40%;
      background: #ffffff;
      border-radius: 2px;
      animation: loadingSlide 1.6s ease-in-out infinite;
    }

    @keyframes loadingSlide {
      0%   { transform: translateX(-100%); }
      50%  { transform: translateX(150%); }
      100% { transform: translateX(-100%); }
    }

    .version {
      font-size: 11px;
      opacity: 0.6;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="logo-container">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 18h6"/>
      <path d="M10 22h4"/>
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
    // icon will use Electron default if not available
    // icon: path.join(__dirname, '..', 'public', 'icon.png'),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Remove the default menu entirely for a clean desktop look
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
  // F11 — Toggle fullscreen
  globalShortcut.register('F11', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  // F12 — Toggle DevTools
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
  // Wait for Electron to be ready
  app.on('ready', async () => {
    // 1. Register global shortcuts
    registerShortcuts();

    // 2. Setup database
    setupDatabase();

    // 3. Start the standalone Next.js server (production only)
    startServer();

    // 4. Show splash screen while waiting
    createSplashWindow();

    // 5. Wait for the server to become available
    if (!isDev) {
      try {
        await waitForServer();
      } catch (err) {
        console.error('[Attindo]', err.message);
      }
    } else {
      // In dev mode, give a brief moment for the splash to show
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    // 6. Create the main window
    createMainWindow();

    // 7. Load the application
    const loadURL = isDev ? 'http://localhost:3000' : SERVER_URL;
    mainWindow.loadURL(loadURL);

    // 8. Once the main window is ready, close splash and show main
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
