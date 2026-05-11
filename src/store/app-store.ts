import { create } from "zustand";

export interface SyncProgress {
  deviceId: string;
  deviceName: string;
  progress: number;
  status: "pending" | "running" | "completed" | "failed";
  recordsFetched: number;
  recordsUploaded: number;
}

export interface DeviceStatus {
  deviceId: string;
  status: "online" | "offline" | "syncing" | "error";
  lastSyncAt?: string;
}

interface AppState {
  activeTab: string;
  syncProgress: Record<string, SyncProgress>;
  deviceStatuses: Record<string, DeviceStatus>;
  isGlobalSyncing: boolean;

  setActiveTab: (tab: string) => void;
  updateSyncProgress: (deviceId: string, progress: SyncProgress) => void;
  removeSyncProgress: (deviceId: string) => void;
  updateDeviceStatus: (deviceId: string, status: DeviceStatus) => void;
  setIsGlobalSyncing: (syncing: boolean) => void;
  clearSyncProgress: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: "dashboard",
  syncProgress: {},
  deviceStatuses: {},
  isGlobalSyncing: false,

  setActiveTab: (tab) => set({ activeTab: tab }),

  updateSyncProgress: (deviceId, progress) =>
    set((state) => ({
      syncProgress: { ...state.syncProgress, [deviceId]: progress },
    })),

  removeSyncProgress: (deviceId) =>
    set((state) => {
      const newProgress = { ...state.syncProgress };
      delete newProgress[deviceId];
      return { syncProgress: newProgress };
    }),

  updateDeviceStatus: (deviceId, status) =>
    set((state) => ({
      deviceStatuses: { ...state.deviceStatuses, [deviceId]: status },
    })),

  setIsGlobalSyncing: (syncing) => set({ isGlobalSyncing: syncing }),

  clearSyncProgress: () => set({ syncProgress: {} }),
}));
