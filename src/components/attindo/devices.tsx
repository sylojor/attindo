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

  // Queries
  const { data: devices = [], isLoading } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: async () => {
      const res = await fetch("/api/devices");
      if (!res.ok) throw new Error("Failed to fetch devices");
      return res.json();
    },
    refetchInterval: 10000,
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
      toast({ title: "Device added", description: "Device registered and employees assigned" });
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

      // Simulate progress
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 20;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          updateSyncProgress(deviceId, {
            deviceId,
            deviceName,
            progress: 100,
            status: "completed",
            recordsFetched: 50,
            recordsUploaded: 12,
          });
          setSyncingDevices((prev) => {
            const next = new Set(prev);
            next.delete(deviceId);
            return next;
          });
          queryClient.invalidateQueries({ queryKey: ["devices"] });
          toast({ title: "Sync completed", description: `${deviceName} synced successfully` });
        } else {
          updateSyncProgress(deviceId, {
            deviceId,
            deviceName,
            progress: Math.round(progress),
            status: "running",
            recordsFetched: Math.round(progress / 2),
            recordsUploaded: Math.round(progress / 4),
          });
        }
      }, 500);
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

      // Start progress for each device
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
          <h2 className="text-lg font-semibold">Devices</h2>
          <p className="text-sm text-muted-foreground">
            {devices.length}/{MAX_DEVICES} Devices &mdash; Manage fingerprint terminals
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
                <DialogTitle>Add New Device</DialogTitle>
                <DialogDescription>
                  Register a new fingerprint terminal
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
                        <FormLabel>Device Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="ZKTeco">ZKTeco</SelectItem>
                            <SelectItem value="ZK">ZK</SelectItem>
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

      {/* Device Cards */}
      {devices.length === 0 ? (
        <Card className="p-8 text-center">
          <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-1">No devices yet</h3>
          <p className="text-sm text-muted-foreground">
            Add a fingerprint terminal to start syncing attendance data
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => {
            const config = statusConfig[device.status] || statusConfig.offline;
            const StatusIcon = config.icon;
            const deviceSync = syncProgress[device.id];
            const isSyncing = syncingDevices.has(device.id);

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

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div>
                      <span className="text-muted-foreground">Type</span>
                      <p className="font-medium">{device.deviceType}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Employees</span>
                      <p className="font-medium">{device._count.deviceEmployees}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Logs</span>
                      <p className="font-medium">{device._count.attendanceLogs}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last Sync</span>
                      <p className="font-medium">
                        {device.lastSyncAt
                          ? format(new Date(device.lastSyncAt), "MMM d, HH:mm")
                          : "Never"}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteId(device.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
