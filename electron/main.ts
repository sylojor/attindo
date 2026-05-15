import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let nextServer: ChildProcess | null = null;
let zkService: ChildProcess | null = null;
let isQuitting = false;

const isDev = !app.isPackaged;

function getIconPath(): string {
  return path.join(__dirname, '..', 'public', 'logo.png');
}

function createTray(): void {
  const icon = nativeImage.createFromPath(getIconPath());
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Attindo',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: 'Restart Services',
      click: () => {
        stopServices();
        startServices();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Attindo',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Attindo - HR, Payroll & Attendance');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'Attindo - HR, Payroll & Attendance',
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false, // Show when ready to avoid flash
    backgroundColor: '#0f172a', // Dark background to match app theme
    autoHideMenuBar: true,
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // Handle close - minimize to tray instead
  mainWindow.on('close', (e: Electron.Event) => {
    if (tray && !isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load the Next.js app
  const url = isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, '..', '.next', 'standalone', 'index.html')}`;
  mainWindow.loadURL(url);

  // Open DevTools in development mode
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function startServices(): void {
  if (!isDev) return;

  const projectRoot = path.join(__dirname, '..');

  console.log('[Attindo] Starting Next.js dev server...');

  // Start Next.js dev server
  nextServer = spawn('bun', ['run', 'dev'], {
    cwd: projectRoot,
    stdio: 'pipe',
    shell: true,
    env: { ...process.env },
  });

  nextServer.stdout?.on('data', (data: Buffer) => {
    const output = data.toString();
    console.log('[Next.js]', output.trim());
  });

  nextServer.stderr?.on('data', (data: Buffer) => {
    const output = data.toString();
    console.error('[Next.js]', output.trim());
  });

  nextServer.on('error', (err: Error) => {
    console.error('[Next.js] Failed to start:', err);
  });

  nextServer.on('close', (code: number | null) => {
    console.log(`[Next.js] Process exited with code ${code}`);
    nextServer = null;
  });

  // Start ZK sync service
  console.log('[Attindo] Starting ZK sync service...');

  const zkServicePath = path.join(projectRoot, 'mini-services', 'zk-sync-service');
  zkService = spawn('bun', ['run', 'dev'], {
    cwd: zkServicePath,
    stdio: 'pipe',
    shell: true,
    env: { ...process.env },
  });

  zkService.stdout?.on('data', (data: Buffer) => {
    const output = data.toString();
    console.log('[ZK-Sync]', output.trim());
  });

  zkService.stderr?.on('data', (data: Buffer) => {
    const output = data.toString();
    console.error('[ZK-Sync]', output.trim());
  });

  zkService.on('error', (err: Error) => {
    console.error('[ZK-Sync] Failed to start:', err);
  });

  zkService.on('close', (code: number | null) => {
    console.log(`[ZK-Sync] Process exited with code ${code}`);
    zkService = null;
  });
}

function stopServices(): void {
  console.log('[Attindo] Stopping services...');

  if (nextServer) {
    nextServer.kill('SIGTERM');
    // Force kill after timeout
    setTimeout(() => {
      if (nextServer) {
        nextServer.kill('SIGKILL');
        nextServer = null;
      }
    }, 5000);
  }

  if (zkService) {
    zkService.kill('SIGTERM');
    setTimeout(() => {
      if (zkService) {
        zkService.kill('SIGKILL');
        zkService = null;
      }
    }, 5000);
  }
}

function waitForServer(url: string, maxRetries: number = 60): Promise<void> {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const interval = setInterval(() => {
      fetch(url)
        .then(() => {
          clearInterval(interval);
          console.log('[Attindo] Next.js server is ready!');
          resolve();
        })
        .catch(() => {
          retries++;
          if (retries >= maxRetries) {
            clearInterval(interval);
            reject(new Error(`Server at ${url} did not start after ${maxRetries} seconds`));
          }
        });
    }, 1000);
  });
}

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-app-path', () => {
  return app.getAppPath();
});

ipcMain.handle('restart-services', () => {
  stopServices();
  setTimeout(() => {
    startServices();
  }, 2000);
  return true;
});

// App lifecycle
app.whenReady().then(async () => {
  // Create tray icon
  createTray();

  if (isDev) {
    // In dev mode, start the services and wait for Next.js
    startServices();

    try {
      await waitForServer('http://localhost:3000');
      createWindow();
    } catch (err) {
      console.error('[Attindo] Failed to start Next.js server:', err);
      // Create window anyway - user can reload
      createWindow();
    }
  } else {
    // In production, just create the window
    createWindow();
  }

  // macOS: Re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  stopServices();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('[Attindo] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[Attindo] Unhandled rejection:', reason);
});
