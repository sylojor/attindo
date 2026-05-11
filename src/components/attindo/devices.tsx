"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  Loader2,
  Radio,
  Zap,
  Server,
  RotateCcw,
  Clock,
  Info,
  Users,
  Plug,
  CheckCircle2,
  XCircle,
  Settings,
  Shield,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/app-store";
import { format } from "date-fns";

const MAX_DEVICES = 6;

interface Device {
  id: string;
  name: string;
  ip: string;
  port: number;
  deviceType: string;
  serialNumber: string | null;
  firmware: string | null;
  status: string;
  lastSyncAt: string | null;
  isActive: boolean;
  _count: {
    attendanceLogs: number;
    syncLogs: number;
    deviceEmployees: number;
  };
  liveInfo?: {
    status: string;
    lastSyncAt: string | null;
    serialNumber: string | null;
    firmware: string | null;
    userCount?: number;
    logCount?: number;
    deviceName?: string;
  } | null;
}

interface DeviceUser {
  uid: number;
  userid: string;
  name: string;
  role: number;
}

const deviceSchema = z.object({
  name: z.string().min(1, "Device name is required"),
  ip: z.string().min(1, "IP address is required"),
  port: z.coerce.number().min(1).max(65535).default(4370),
  deviceType: z.string().default("ZKTeco"),
});

type DeviceFormValues = z.infer<typeof deviceSchema>;

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  online: { label: "Online", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: Wifi },
  offline: { label: "Offline", color: "bg-muted text-muted-foreground", icon: WifiOff },
  syncing: { label: "Syncing", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: RefreshCw },
  error: { label: "Error", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: Radio },
};

export function DevicesView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { syncProgress, updateSyncProgress } = useAppStore();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [syncingDevices, setSyncingDevices] = useState<Set<string>>(new Set());
  const [deviceDetailId, setDeviceDetailId] = useState<string | null>(null);
  const [deviceUsers, setDeviceUsers] = useState<DeviceUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [syncingTimeId, setSyncingTimeId] = useState<string | null>(null);

  // Queries
  const { data: devices = [], isLoading } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: async () => {
      const res = await fetch("/api/devices");
      if (!res.ok) throw new Error("Failed to fetch devices");
      return res.json();
    },
    refetchInterval: 15000,
  });

  // Add form
  const addForm = useForm<DeviceFormValues>({
    resolver: zodResolver(deviceSchema),
    defaultValues: {
      name: "",
      ip: "",
      port: 4370,
      deviceType: "ZKTeco",
    },
  });

  // Add mutation
  const addMutation = useMutation({
    mutationFn: async (values: DeviceFormValues) => {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add device");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      setAddOpen(false);
      addForm.reset();
      toast({ title: "Device added", description: "Device registered. Auto-testing connection..." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/devices/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete device");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      setDeleteId(null);
      toast({ title: "Device deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete device", variant: "destructive" });
    },
  });

  // Sync single device
  const syncDevice = async (deviceId: string, deviceName: string) => {
    setSyncingDevices((prev) => new Set(prev).add(deviceId));
    updateSyncProgress(deviceId, {
      deviceId,
      deviceName,
      progress: 0,
      status: "running",
      recordsFetched: 0,
      recordsUploaded: 0,
    });

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "device", deviceId }),
      });

      if (!res.ok) {
        throw new Error("Sync failed");
      }

      // Simulate progress updates while sync runs in background
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 95) {
          progress = 95;
          clearInterval(interval);
        }
        updateSyncProgress(deviceId, {
          deviceId,
          deviceName,
          progress: Math.round(progress),
          status: "running",
          recordsFetched: Math.round(progress / 2),
          recordsUploaded: Math.round(progress / 8),
        });
      }, 800);

      // Poll for completion
      const checkComplete = setInterval(async () => {
        const devRes = await fetch("/api/devices");
        if (devRes.ok) {
          const allDevs: Device[] = await devRes.json();
          const dev = allDevs.find((d) => d.id === deviceId);
          if (dev && dev.status !== "syncing") {
            clearInterval(checkComplete);
            clearInterval(interval);
            updateSyncProgress(deviceId, {
              deviceId,
              deviceName,
              progress: 100,
              status: "completed",
              recordsFetched: dev._count?.attendanceLogs || 0,
              recordsUploaded: dev._count?.deviceEmployees || 0,
            });
            setSyncingDevices((prev) => {
              const next = new Set(prev);
              next.delete(deviceId);
              return next;
            });
            queryClient.invalidateQueries({ queryKey: ["devices"] });
            toast({
              title: "Sync completed",
              description: `${deviceName} synced successfully`,
            });
          }
        }
      }, 3000);

      // Timeout after 2 minutes
      setTimeout(() => {
        clearInterval(interval);
        clearInterval(checkComplete);
        setSyncingDevices((prev) => {
          const next = new Set(prev);
          next.delete(deviceId);
          return next;
        });
      }, 120000);
    } catch {
      updateSyncProgress(deviceId, {
        deviceId,
        deviceName,
        progress: 0,
        status: "failed",
        recordsFetched: 0,
        recordsUploaded: 0,
      });
      setSyncingDevices((prev) => {
        const next = new Set(prev);
        next.delete(deviceId);
        return next;
      });
      toast({ title: "Sync failed", description: `Failed to sync ${deviceName}`, variant: "destructive" });
    }
  };

  // Sync all devices
  const syncAll = async () => {
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "all" }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Sync all failed");
      }

      toast({ title: "Sync started", description: "All devices syncing in background" });

      for (const device of devices) {
        if (device.isActive) {
          syncDevice(device.id, device.name);
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start sync",
        variant: "destructive",
      });
    }
  };

  // Test connection
  const testConnection = async (deviceId: string, deviceName: string) => {
    setTestingId(deviceId);
    try {
      const res = await fetch(`/api/devices/${deviceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-connection" }),
      });
      const data = await res.json();

      if (data.success) {
        toast({
          title: "Connection successful",
          description: `${deviceName} is online${data.info?.serialNumber ? ` (S/N: ${data.info.serialNumber})` : ""}`,
        });
        queryClient.invalidateQueries({ queryKey: ["devices"] });
      } else {
        toast({
          title: "Connection failed",
          description: data.message || `Could not connect to ${deviceName}`,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Connection error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setTestingId(null);
    }
  };

  // Restart device
  const restartDevice = async (deviceId: string, deviceName: string) => {
    setRestartingId(deviceId);
    try {
      const res = await fetch(`/api/devices/${deviceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart" }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Restarting", description: `${deviceName} is restarting...` });
        queryClient.invalidateQueries({ queryKey: ["devices"] });
      } else {
        toast({ title: "Error", description: data.error || "Failed to restart", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRestartingId(null);
    }
  };

  // Sync device time
  const syncDeviceTime = async (deviceId: string, deviceName: string) => {
    setSyncingTimeId(deviceId);
    try {
      const res = await fetch(`/api/devices/${deviceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync-time" }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Time synced", description: `${deviceName} time synchronized with server` });
      } else {
        toast({ title: "Error", description: data.error || "Failed to sync time", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSyncingTimeId(null);
    }
  };

  // Get device users
  const fetchDeviceUsers = async (deviceId: string) => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/devices/${deviceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-users" }),
      });
      const data = await res.json();
      setDeviceUsers(Array.isArray(data) ? data : []);
    } catch {
      setDeviceUsers([]);
      toast({ title: "Error", description: "Failed to fetch device users", variant: "destructive" });
    } finally {
      setLoadingUsers(false);
    }
  };

  // Delete user from device
  const deleteUserFromDevice = async (deviceId: string, fingerprintId: number, userName: string) => {
    try {
      const res = await fetch(`/api/devices/${deviceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-user", fingerprintId }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "User deleted", description: `${userName} removed from device` });
        fetchDeviceUsers(deviceId);
      } else {
        toast({ title: "Error", description: "Failed to delete user", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete user from device", variant: "destructive" });
    }
  };

  // Device detail dialog
  const openDeviceDetail = (deviceId: string) => {
    setDeviceDetailId(deviceId);
    fetchDeviceUsers(deviceId);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-6 w-32 mb-4" />
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-4 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-600" />
            ZKTeco Devices
          </h2>
          <p className="text-sm text-muted-foreground">
            {devices.length}/{MAX_DEVICES} Devices &mdash; Official ZKTeco ZK Protocol Support
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={syncAll}
            disabled={devices.length === 0 || syncingDevices.size > 0}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncingDevices.size > 0 ? "animate-spin" : ""}`} />
            Sync All
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                disabled={devices.length >= MAX_DEVICES}
              >
                <Plus className="h-4 w-4" />
                Add Device
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add ZKTeco Device</DialogTitle>
                <DialogDescription>
                  Register a new ZKTeco fingerprint terminal. Make sure the device is on the same network and port 4370 is open.
                </DialogDescription>
              </DialogHeader>
              <Form {...addForm}>
                <form
                  onSubmit={addForm.handleSubmit((v) => addMutation.mutate(v))}
                  className="space-y-4"
                >
                  <FormField
                    control={addForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Device Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Main Entrance" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={addForm.control}
                      name="ip"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>IP Address *</FormLabel>
                          <FormControl>
                            <Input placeholder="192.168.1.201" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="port"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Port</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={addForm.control}
                    name="deviceType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Device Model</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="ZKTeco">ZKTeco (F18/F22/K-Series)</SelectItem>
                            <SelectItem value="SpeedFace">ZKTeco SpeedFace</SelectItem>
                            <SelectItem value="iFace">ZKTeco iFace</SelectItem>
                            <SelectItem value="inBio">ZKTeco inBio</SelectItem>
                            <SelectItem value="ZK">ZK Generic</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAddOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={addMutation.isPending}
                    >
                      {addMutation.isPending ? "Adding..." : "Add Device"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Supported Devices Info Banner */}
      <Card className="border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20">
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-emerald-700 dark:text-emerald-400">
                Official ZKTeco ZK Protocol Support
              </p>
              <p className="text-muted-foreground text-xs mt-0.5">
                Compatible with: F18, F22, F22-Pro, SpeedFace-V4L/V5L, iFace302/402, inBio160/260/460, K14/K20/K40, ZK T4-C/T5-C &mdash;
                All devices using ZK TCP protocol on port 4370
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Device Cards */}
      {devices.length === 0 ? (
        <Card className="p-8 text-center">
          <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-1">No devices yet</h3>
          <p className="text-sm text-muted-foreground">
            Add a ZKTeco fingerprint terminal to start syncing attendance data
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => {
            const config = statusConfig[device.status] || statusConfig.offline;
            const StatusIcon = config.icon;
            const deviceSync = syncProgress[device.id];
            const isSyncing = syncingDevices.has(device.id);
            const liveInfo = device.liveInfo;

            return (
              <Card key={device.id} className="relative overflow-hidden">
                {/* Status bar */}
                <div
                  className={`h-1 ${
                    device.status === "online"
                      ? "bg-emerald-500"
                      : device.status === "syncing"
                      ? "bg-amber-500"
                      : device.status === "error"
                      ? "bg-red-500"
                      : "bg-muted"
                  }`}
                />
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-sm">{device.name}</h3>
                      <p className="text-xs text-muted-foreground font-mono">
                        {device.ip}:{device.port}
                      </p>
                      {liveInfo?.deviceName && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {liveInfo.deviceName}
                        </p>
                      )}
                    </div>
                    <Badge className={`text-[10px] ${config.color}`}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                  </div>

                  {/* Sync progress */}
                  {isSyncing && deviceSync && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Syncing...</span>
                        <span className="text-emerald-600 font-medium">
                          {deviceSync.progress}%
                        </span>
                      </div>
                      <Progress value={deviceSync.progress} className="h-1.5" />
                    </div>
                  )}

                  {/* Device Info Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div>
                      <span className="text-muted-foreground">Model</span>
                      <p className="font-medium">{device.deviceType}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Employees</span>
                      <p className="font-medium">
                        {liveInfo?.userCount ?? device._count.deviceEmployees}
                        {liveInfo?.userCount !== undefined && (
                          <span className="text-muted-foreground"> on device</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Logs</span>
                      <p className="font-medium">
                        {liveInfo?.logCount !== undefined ? liveInfo.logCount : device._count.attendanceLogs}
                        {liveInfo?.logCount !== undefined && (
                          <span className="text-muted-foreground"> on device</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last Sync</span>
                      <p className="font-medium">
                        {device.lastSyncAt
                          ? format(new Date(device.lastSyncAt), "MMM d, HH:mm")
                          : "Never"}
                      </p>
                    </div>
                    {(device.serialNumber || liveInfo?.serialNumber) && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Serial</span>
                        <p className="font-medium font-mono text-[10px]">
                          {liveInfo?.serialNumber || device.serialNumber}
                        </p>
                      </div>
                    )}
                    {(device.firmware || liveInfo?.firmware) && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Firmware</span>
                        <p className="font-medium text-[10px]">
                          {liveInfo?.firmware || device.firmware}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 mb-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5 text-xs h-8"
                      onClick={() => syncDevice(device.id, device.name)}
                      disabled={isSyncing}
                    >
                      {isSyncing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Zap className="h-3 w-3" />
                      )}
                      {isSyncing ? "Syncing" : "Sync"}
                    </Button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => testConnection(device.id, device.name)}
                            disabled={testingId === device.id}
                          >
                            {testingId === device.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Plug className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Test Connection</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openDeviceDetail(device.id)}
                          >
                            <Info className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Device Details</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setDeleteId(device.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  {/* Advanced actions row */}
                  <div className="flex items-center gap-1.5">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => syncDeviceTime(device.id, device.name)}
                            disabled={syncingTimeId === device.id}
                          >
                            {syncingTimeId === device.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Clock className="h-3 w-3" />
                            )}
                            Sync Time
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Sync device clock with server</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => restartDevice(device.id, device.name)}
                            disabled={restartingId === device.id}
                          >
                            {restartingId === device.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                            Restart
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Restart fingerprint terminal</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Device Detail Dialog */}
      <Dialog open={!!deviceDetailId} onOpenChange={(open) => { if (!open) setDeviceDetailId(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-emerald-600" />
              Device Details & Users
            </DialogTitle>
            <DialogDescription>
              View device information and manage users on the fingerprint terminal
            </DialogDescription>
          </DialogHeader>

          {deviceDetailId && (() => {
            const dev = devices.find((d) => d.id === deviceDetailId);
            if (!dev) return null;

            return (
              <div className="space-y-4">
                {/* Device Info */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{dev.name}</CardTitle>
                    <CardDescription className="font-mono">{dev.ip}:{dev.port}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Model</span>
                      <span className="font-medium">{dev.deviceType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <Badge className={`text-[10px] ${statusConfig[dev.status]?.color || ""}`}>
                        {statusConfig[dev.status]?.label || dev.status}
                      </Badge>
                    </div>
                    {(dev.serialNumber || dev.liveInfo?.serialNumber) && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Serial Number</span>
                        <span className="font-medium font-mono">{dev.liveInfo?.serialNumber || dev.serialNumber}</span>
                      </div>
                    )}
                    {(dev.firmware || dev.liveInfo?.firmware) && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Firmware</span>
                        <span className="font-medium">{dev.liveInfo?.firmware || dev.firmware}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Sync</span>
                      <span className="font-medium">{dev.lastSyncAt ? format(new Date(dev.lastSyncAt), "yyyy-MM-dd HH:mm") : "Never"}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Attendance Logs</span>
                      <span className="font-medium">{dev._count.attendanceLogs}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Assigned Employees</span>
                      <span className="font-medium">{dev._count.deviceEmployees}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sync History</span>
                      <span className="font-medium">{dev._count.syncLogs}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Users on Device */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-1.5">
                        <Users className="h-4 w-4" />
                        Users on Device
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => fetchDeviceUsers(deviceDetailId)}
                        disabled={loadingUsers}
                      >
                        {loadingUsers ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Refresh
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loadingUsers ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-8 w-full" />
                        ))}
                      </div>
                    ) : deviceUsers.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No users found on device
                      </p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {deviceUsers.map((user) => (
                          <div
                            key={user.uid}
                            className="flex items-center justify-between text-xs p-2 rounded bg-muted/50"
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] h-5">
                                #{user.uid}
                              </Badge>
                              <div>
                                <p className="font-medium">{user.name || "Unknown"}</p>
                                <p className="text-muted-foreground text-[10px]">
                                  ID: {user.userid} • Role: {user.role === 14 ? "Admin" : "User"}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={() => deleteUserFromDevice(deviceDetailId, user.uid, user.name)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Device</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the device and all related attendance
              logs, sync logs, and employee assignments. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteMutation.mutate(deleteId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
