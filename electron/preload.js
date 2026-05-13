const { contextBridge } = require('electron');

// ---------------------------------------------------------------------------
// Preload Script — Expose Safe APIs to the Renderer Process
// ---------------------------------------------------------------------------

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * The operating system platform (e.g. 'win32', 'darwin', 'linux')
   */
  platform: process.platform,

  /**
   * Indicates the app is running inside Electron (always true here)
   */
  isElectron: true,

  /**
   * Version information from the Electron runtime
   */
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});
