"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAppStore } from "@/store/app-store";

interface UseSocketReturn {
  isConnected: boolean;
  lastEvent: string | null;
  reconnect: () => void;
}

export function useSocket(): UseSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const { updateSyncProgress, updateDeviceStatus } = useAppStore();

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const socket = io("/?XTransformPort=3003", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
      timeout: 10000,
    });

    socket.on("connect", () => {
      setIsConnected(true);
      setLastEvent("connect");
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      setLastEvent("disconnect");
    });

    socket.on("connect_error", () => {
      setIsConnected(false);
    });

    // Listen for sync progress events (from real ZK service)
    socket.on("sync:progress", (data: {
      deviceId: string;
      phase: string;
      progress: number;
      message: string;
      recordsFetched?: number;
      recordsUploaded?: number;
    }) => {
      const statusMap: Record<string, "pending" | "running" | "completed" | "failed"> = {
        connecting: "running",
        reading: "running",
        uploading: "running",
        disconnecting: "running",
        completed: "completed",
        error: "failed",
      };

      updateSyncProgress(data.deviceId, {
        deviceId: data.deviceId,
        deviceName: "", // Will be filled from device list
        progress: data.progress,
        status: statusMap[data.phase] || "running",
        recordsFetched: data.recordsFetched || 0,
        recordsUploaded: data.recordsUploaded || 0,
      });
      setLastEvent("sync:progress");
    });

    // Listen for device status events
    socket.on("device:status", (data: {
      deviceId: string;
      status: "online" | "offline" | "syncing" | "error";
      lastSyncAt?: string;
    }) => {
      updateDeviceStatus(data.deviceId, {
        deviceId: data.deviceId,
        status: data.status,
        lastSyncAt: data.lastSyncAt,
      });
      setLastEvent("device:status");
    });

    // Listen for device info events (serial, firmware, etc.)
    socket.on("device:info", (data: {
      deviceId: string;
      info: {
        serialNumber: string | null;
        firmware: string | null;
        deviceName: string | null;
        userCount: number;
        logCount: number;
      };
    }) => {
      setLastEvent("device:info");
    });

    socketRef.current = socket;
  }, [updateSyncProgress, updateDeviceStatus]);

  const reconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [connect]);

  return { isConnected, lastEvent, reconnect };
}
