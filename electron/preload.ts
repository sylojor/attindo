import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  restartServices: () => ipcRenderer.invoke('restart-services'),

  // Event listeners
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on('menu-action', (_event, action) => callback(action));
  },

  // Platform info
  platform: process.platform,
  isElectron: true,
});

// Type definitions for the exposed API
export interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  getAppPath: () => Promise<string>;
  restartServices: () => Promise<boolean>;
  onMenuAction: (callback: (action: string) => void) => void;
  platform: NodeJS.Platform;
  isElectron: boolean;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
