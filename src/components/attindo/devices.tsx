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
  Shield,
  Fingerprint,
  Eye,
  Hand,
  CreditCard,
  ScanSearch,
  Globe,
  Network,
  Copy,
  Check,
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
import { useTranslation } from "@/hooks/use-translation";
import { fetchJson } from "@/lib/utils";
import { format } from "date-fns";

const MAX_DEVICES = 999; // No practical limit

// Device type is now auto-detected - no need to specify
// This is kept for backward compatibility but AutoDetect is the default
const DEVICE_TYPES: Record<string, { label: string; models: string; capabilities: string[] }> = {
  AutoDetect: {
    label: "🔧 Auto-Detect (Recommended)",
    models: "Any ZKTeco Device",
    capabilities: ["fingerprint"],
  },
};

interface Device {
  id: string;
  name: string;
  ip: string;
  port: number;
  deviceType: string;
  deviceModel: string | null;
  serialNumber: string | null;
  firmware: string | null;
  status: string;
  lastSyncAt: string | null;
  isActive: boolean;
  capabilities: string;
  fingerCount: number;
  faceCount: number;
  palmCount: number;
  userCount: number;
  logCount: number;
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
    deviceModel?: string;
    capabilities?: string[];
    fingerCount?: number;
    faceCount?: number;
    palmCount?: number;
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
  deviceType: z.string().default("AutoDetect"),
});

type DeviceFormValues = z.infer<typeof deviceSchema>;

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  online: { label: "Online", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: Wifi },
  offline: { label: "Offline", color: "bg-muted text-muted-foreground", icon: WifiOff },
  syncing: { label: "Syncing", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: RefreshCw },
  error: { label: "Error", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: Radio },
};

// Capability icon mapping
const capabilityIcons: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  fingerprint: { icon: Fingerprint, label: "Fingerprint", color: "text-blue-600 dark:text-blue-400" },
  face: { icon: Eye, label: "Face", color: "text-violet-600 dark:text-violet-400" },
  palm: { icon: Hand, label: "Palm", color: "text-orange-600 dark:text-orange-400" },
  card: { icon: CreditCard, label: "Card", color: "text-teal-600 dark:text-teal-400" },
  password: { icon: Shield, label: "Password", color: "text-slate-600 dark:text-slate-400" },
};

function CapabilitiesBadges({ capabilities, size = "xs" }: { capabilities: string | string[]; size?: "xs" | "sm" }) {
  const caps = Array.isArray(capabilities) ? capabilities : capabilities.split(",").filter(Boolean);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {caps.map((cap) => {
        const config = capabilityIcons[cap.trim()];
        if (!config) return null;
        const Icon = config.icon;
        return (
          <TooltipProvider key={cap.trim()}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={`${size === "xs" ? "text-[9px] h-4 px-1" : "text-[10px] h-5 px-1.5"} gap-0.5`}
                >
                  <Icon className={`${size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} ${config.color}`} />
                  {size !== "xs" && config.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{config.label}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

export function DevicesView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { syncProgress, updateSyncProgress } = useAppStore();
  const { t } = useTranslation();
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [syncingDevices, setSyncingDevices] = useState<Set<string>>(new Set());
  const [deviceDetailId, setDeviceDetailId] = useState<string | null>(null);
  const [deviceUsers, setDeviceUsers] = useState<DeviceUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [syncingTimeId, setSyncingTimeId] = useState<string | null>(null);
  const [detectingId, setDetectingId] = useState<string | null>(null);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  // Network info query
  const { data: networkInfo } = useQuery<{
    hostname: string;
    internalIps: Array<{ interface: string; address: string; family: string }>;
    loopbackIps: Array<{ interface: string; address: string; family: string }>;
    externalIp: string | null;
    port: string;
    zkServicePort: number;
    zkDeviceDefaultPort: number;
  }>({
    queryKey: ["network-info"],
    queryFn: async () => {
      try {
        return await fetchJson<typeof networkInfo>("/api/network-info");
      } catch {
        return {
          hostname: "",
          internalIps: [],
          loopbackIps: [],
          externalIp: null,
          port: "3000",
          zkServicePort: 3003,
          zkDeviceDefaultPort: 4370,
        };
      }
    },
    staleTime: 60000,
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIp(label);
      setTimeout(() => setCopiedIp(null), 2000);
    });
  };

  // Queries
  const { data: devices = [], isLoading } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: async () => {
      return fetchJson<Device[]>("/api/devices");
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
      deviceType: "AutoDetect",
    },
  });

  // Watch deviceType to show capabilities
  const watchedDeviceType = addForm.watch("deviceType");

  // Add mutation
  const addMutation = useMutation({
    mutationFn: async (values: DeviceFormValues) => {
      try {
        return await fetchJson("/api/devices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to add device";
        if (msg.includes("already exists")) {
          throw new Error(t("devices.duplicateIp"));
        }
        if (msg.includes("Maximum") || msg.includes("maximum")) {
          throw new Error(t("devices.maxDevices"));
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      setAddOpen(false);
      setAddError(null);
      addForm.reset();
      toast({ title: t("devices.deviceAdded"), description: t("devices.autoTesting") });
    },
    onError: (error: Error) => {
      setAddError(error.message);
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return fetchJson(`/api/devices/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      setDeleteId(null);
      toast({ title: t("devices.deviceDeleted") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: "Failed to delete device", variant: "destructive" });
    },
  });

  // Sync single device
  const syncDeviceFn = async (deviceId: string, deviceName: string) => {
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
      await fetchJson("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "device", deviceId }),
      });

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

      const checkComplete = setInterval(async () => {
        try {
          const allDevs = await fetchJson<Device[]>("/api/devices");
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
              title: t("sync.completed"),
              description: `${deviceName} synced successfully`,
            });
          }
        } catch {
          // ignore error in polling
        }
      }, 3000);

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
      toast({ title: t("common.error"), description: `Failed to sync ${deviceName}`, variant: "destructive" });
    }
  };

  // Sync all devices
  const syncAll = async () => {
    try {
      await fetchJson("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "all" }),
      });

      toast({ title: t("syncing"), description: "All devices syncing in background" });

      for (const device of devices) {
        if (device.isActive) {
          syncDeviceFn(device.id, device.name);
        }
      }
    } catch (error) {
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : "Failed to start sync",
        variant: "destructive",
      });
    }
  };

  // Test connection
  const testConnection = async (deviceId: string, deviceName: string) => {
    setTestingId(deviceId);
    try {
      const data = await fetchJson<{ success?: boolean; message?: string; info?: { serialNumber?: string; capabilities?: string[] } }>(`/api/devices/${deviceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-connection" }),
      });

      if (data.success) {
        const caps = data.info?.capabilities;
        toast({
          title: t("devices.online"),
          description: `${deviceName} is online${data.info?.serialNumber ? ` (S/N: ${data.info.serialNumber})` : ""}${caps?.length ? ` — ${caps.join(", ")}` : ""}`,
        });
        queryClient.invalidateQueries({ queryKey: ["devices"] });
      } else {
        toast({
          title: t("common.error"),
          description: data.message || `Could not connect to ${deviceName}`,
          variant: "destructive",
        });
      }
    } catch (err: unknown) {
      toast({
        title: t("common.error"),
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setTestingId(null);
    }
  };

  // Detect capabilities
  const detectCapabilities = async (deviceId: string, deviceName: string) => {
    setDetectingId(deviceId);
    try {
      const data = await fetchJson<{ success?: boolean; capabilities?: string[]; deviceModel?: string; error?: string }>(`/api/devices/${deviceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detect-capabilities" }),
      });

      if (data.success && data.capabilities) {
        toast({
          title: t("devices.detect"),
          description: `${deviceName}: ${data.deviceModel || "Unknown model"} — ${data.capabilities.join(", ")}`,
        });
        queryClient.invalidateQueries({ queryKey: ["devices"] });
      } else {
        toast({
          title: t("common.error"),
          description: data.error || `Could not detect capabilities for ${deviceName}`,
          variant: "destructive",
        });
      }
    } catch (err: unknown) {
      toast({
        title: t("common.error"),
        description: err instanceof Error ? err.message : "Failed to detect capabilities",
        variant: "destructive",
      });
    } finally {
      setDetectingId(null);
    }
  };

  // Restart device
  const restartDevice = async (deviceId: string, deviceName: string) => {
    setRestartingId(deviceId);
    try {
      const data = await fetchJson<{ success?: boolean; error?: string }>(`/api/devices/${deviceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart" }),
      });
      if (data.success) {
        toast({ title: t("devices.restart"), description: `${deviceName} is restarting...` });
        queryClient.invalidateQueries({ queryKey: ["devices"] });
      } else {
        toast({ title: t("common.error"), description: data.error || "Failed to restart", variant: "destructive" });
      }
    } catch (err: unknown) {
      toast({ title: t("common.error"), description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRestartingId(null);
    }
  };

  // Sync device time
  const syncDeviceTime = async (deviceId: string, deviceName: string) => {
    setSyncingTimeId(deviceId);
    try {
      const data = await fetchJson<{ success?: boolean; error?: string }>(`/api/devices/${deviceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync-time" }),
      });
      if (data.success) {
        toast({ title: t("devices.syncTime"), description: `${deviceName} time synchronized with server` });
      } else {
        toast({ title: t("common.error"), description: data.error || "Failed to sync time", variant: "destructive" });
      }
    } catch (err: unknown) {
      toast({ title: t("common.error"), description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSyncingTimeId(null);
    }
  };

  // Get device users
  const fetchDeviceUsers = async (deviceId: string) => {
    setLoadingUsers(true);
    try {
      const data = await fetchJson(`/api/devices/${deviceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-users" }),
      });
      setDeviceUsers(Array.isArray(data) ? data : []);
    } catch {
      setDeviceUsers([]);
      toast({ title: t("common.error"), description: "Failed to fetch device users", variant: "destructive" });
    } finally {
      setLoadingUsers(false);
    }
  };

  // Delete user from device
  const deleteUserFromDevice = async (deviceId: string, fingerprintId: number, userName: string) => {
    try {
      const data = await fetchJson<{ success?: boolean; error?: string }>(`/api/devices/${deviceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-user", fingerprintId }),
      });
      if (data.success) {
        toast({ title: t("devices.deviceDeleted"), description: `${userName} removed from device` });
        fetchDeviceUsers(deviceId);
      } else {
        toast({ title: t("common.error"), description: "Failed to delete user", variant: "destructive" });
      }
    } catch {
      toast({ title: t("common.error"), description: "Failed to delete user from device", variant: "destructive" });
    }
  };

  // Device detail dialog
  const openDeviceDetail = (deviceId: string) => {
    setDeviceDetailId(deviceId);
    fetchDeviceUsers(deviceId);
  };

  // Get resolved capabilities for a device
  const getDeviceCapabilities = (device: Device): string[] => {
    const liveCaps = device.liveInfo?.capabilities;
    if (liveCaps && liveCaps.length > 0) return liveCaps;
    const caps = device.capabilities || DEVICE_TYPES[device.deviceType]?.capabilities?.join(",") || "fingerprint";
    return caps.split(",").filter(Boolean);
  };

  // Get resolved model name
  const getDeviceModelName = (device: Device): string => {
    return device.liveInfo?.deviceModel || device.deviceModel || DEVICE_TYPES[device.deviceType]?.models || device.deviceType;
  };

  // Get biometric counts
  const getBiometricCounts = (device: Device) => ({
    fingers: device.liveInfo?.fingerCount ?? device.fingerCount ?? 0,
    faces: device.liveInfo?.faceCount ?? device.faceCount ?? 0,
    palms: device.liveInfo?.palmCount ?? device.palmCount ?? 0,
  });

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
            {t("devices.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("devices.subtitle").replace("{count}", String(devices.length)).replace("{max}", String(MAX_DEVICES))}
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
            {t("devices.syncAll")}
          </Button>
          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (open) setAddError(null); }}>
            <DialogTrigger asChild>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                disabled={devices.length >= MAX_DEVICES}
              >
                <Plus className="h-4 w-4" />
                {t("devices.add")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("devices.addZKTeco")}</DialogTitle>
                <DialogDescription>
                  {t("devices.addZKTecoDesc")}
                </DialogDescription>
              </DialogHeader>
              {addError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
                  <Radio className="h-4 w-4 shrink-0" />
                  {addError}
                </div>
              )}
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
                        <FormLabel>{t("devices.deviceName")} *</FormLabel>
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
                          <FormLabel>{t("devices.ipAddress")} *</FormLabel>
                          <FormControl>
                            <Input placeholder="192.168.1.201 or external IP" {...field} />
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
                          <FormLabel>{t("devices.port")}</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {/* Auto-detect info - device type is always auto-detected */}
                  <div className="rounded-md border p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50">
                    <div className="space-y-1">
                      <p className="text-xs font-medium flex items-center gap-1.5">
                        <ScanSearch className="h-3.5 w-3.5 text-emerald-600" />
                        Auto-Detect Mode
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        The system will automatically detect the device model and capabilities when you test the connection. Works with any ZKTeco device (OF109, MB20, F18, etc.) — local or remote.
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        💡 For remote devices at other locations, enter the external/static IP and make sure port {networkInfo?.zkDeviceDefaultPort || 4370} is forwarded.
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAddOpen(false)}
                    >
                      {t("devices.cancel")}
                    </Button>
                    <Button
                      type="submit"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={addMutation.isPending}
                    >
                      {addMutation.isPending ? t("devices.adding") : t("devices.addDevice")}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Universal Device Support Banner */}
      <Card className="border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20">
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-emerald-700 dark:text-emerald-400">
                Universal ZKTeco Device Support
              </p>
              <p className="text-muted-foreground text-xs mt-0.5">
                Auto-detects any ZKTeco device — just enter the IP address. Works with local network devices and remote devices with static IPs. No need to select device type.
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] text-muted-foreground">Supported verification modes:</span>
                <CapabilitiesBadges capabilities={["fingerprint", "face", "palm", "card", "password"]} size="xs" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Network Information Card */}
      {networkInfo && (networkInfo.internalIps.length > 0 || networkInfo.externalIp) && (
        <Card className="border-sky-200 dark:border-sky-900/50 bg-sky-50/50 dark:bg-sky-950/20">
          <CardContent className="p-3">
            <div className="flex items-start gap-3">
              <Network className="h-5 w-5 text-sky-600 mt-0.5 shrink-0" />
              <div className="text-sm flex-1">
                <p className="font-medium text-sky-700 dark:text-sky-400">
                  Network Information
                </p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Use these IPs to configure fingerprint devices on your network or remote locations
                </p>
                <div className="mt-2 space-y-1.5">
                  {/* Internal IPs */}
                  {networkInfo.internalIps.filter(ip => ip.family === "IPv4").map((ip) => (
                    <div key={ip.interface} className="flex items-center gap-2 text-xs">
                      <Wifi className="h-3 w-3 text-sky-500 shrink-0" />
                      <span className="text-muted-foreground min-w-[80px]">{ip.interface}:</span>
                      <span className="font-mono font-medium">{ip.address}</span>
                      <span className="text-[9px] text-muted-foreground">(LAN)</span>
                      <button
                        onClick={() => copyToClipboard(ip.address, `int-${ip.interface}`)}
                        className="ml-auto p-0.5 hover:bg-sky-100 dark:hover:bg-sky-900/30 rounded"
                      >
                        {copiedIp === `int-${ip.interface}` ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  ))}
                  {/* External IP */}
                  {networkInfo.externalIp && (
                    <div className="flex items-center gap-2 text-xs">
                      <Globe className="h-3 w-3 text-orange-500 shrink-0" />
                      <span className="text-muted-foreground min-w-[80px]">Public IP:</span>
                      <span className="font-mono font-medium text-orange-600 dark:text-orange-400">{networkInfo.externalIp}</span>
                      <span className="text-[9px] text-muted-foreground">(WAN/Remote)</span>
                      <button
                        onClick={() => copyToClipboard(networkInfo.externalIp!, "ext")}
                        className="ml-auto p-0.5 hover:bg-sky-100 dark:hover:bg-sky-900/30 rounded"
                      >
                        {copiedIp === "ext" ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
                {networkInfo.externalIp && (
                  <p className="text-[10px] text-muted-foreground mt-2 border-t border-sky-200 dark:border-sky-800/50 pt-1.5">
                    💡 For remote devices at other locations: Use the Public IP ({networkInfo.externalIp}) with port forwarding on port {networkInfo.zkDeviceDefaultPort}, or configure the device with a static IP and add it directly.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Device Cards */}
      {devices.length === 0 ? (
        <Card className="p-8 text-center">
          <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-1">{t("devices.noDevices")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("devices.noDevicesDesc")}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => {
            const config = statusConfig[device.status] || statusConfig.offline;
            const StatusIcon = config.icon;
            const deviceSync = syncProgress[device.id];
            const isSyncing = syncingDevices.has(device.id);
            const caps = getDeviceCapabilities(device);
            const modelName = getDeviceModelName(device);
            const bioCounts = getBiometricCounts(device);
            const isMB20 = device.deviceType === "MB20" || modelName.toUpperCase().includes("MB20");

            return (
              <Card key={device.id} className={`relative overflow-hidden ${isMB20 ? "ring-1 ring-violet-200 dark:ring-violet-800/50" : ""}`}>
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
                      <h3 className="font-semibold text-sm flex items-center gap-1.5">
                        {device.name}
                        {isMB20 && (
                          <Badge className="text-[8px] h-4 px-1 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border-violet-200 dark:border-violet-800">
                            MB20
                          </Badge>
                        )}
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono">
                        {device.ip}:{device.port}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {modelName}
                      </p>
                    </div>
                    <Badge className={`text-[10px] ${config.color}`}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                  </div>

                  {/* Capabilities badges */}
                  <div className="mb-2.5">
                    <CapabilitiesBadges capabilities={caps} size="xs" />
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
                      <span className="text-muted-foreground">{t("devices.employees")}</span>
                      <p className="font-medium">
                        {(device.liveInfo?.userCount ?? device.userCount) || device._count.deviceEmployees}
                        {((device.liveInfo?.userCount !== undefined) || device.userCount > 0) && (
                          <span className="text-muted-foreground"> {t("devices.onDevice")}</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("devices.logs")}</span>
                      <p className="font-medium">
                        {(device.liveInfo?.logCount ?? device.logCount) || device._count.attendanceLogs}
                        {((device.liveInfo?.logCount !== undefined) || device.logCount > 0) && (
                          <span className="text-muted-foreground"> {t("devices.onDevice")}</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("devices.lastSync")}</span>
                      <p className="font-medium">
                        {device.lastSyncAt
                          ? format(new Date(device.lastSyncAt), "MMM d, HH:mm")
                          : t("devices.never")}
                      </p>
                    </div>
                    {/* Biometric counts for multi-bio devices */}
                    {(bioCounts.fingers > 0 || bioCounts.faces > 0 || bioCounts.palms > 0) && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">{t("devices.biometricTemplates")}</span>
                        <div className="flex items-center gap-3 mt-0.5">
                          {bioCounts.fingers > 0 && (
                            <span className="flex items-center gap-1 text-[10px]">
                              <Fingerprint className="h-3 w-3 text-blue-500" />
                              {bioCounts.fingers}
                            </span>
                          )}
                          {bioCounts.faces > 0 && (
                            <span className="flex items-center gap-1 text-[10px]">
                              <Eye className="h-3 w-3 text-violet-500" />
                              {bioCounts.faces}
                            </span>
                          )}
                          {bioCounts.palms > 0 && (
                            <span className="flex items-center gap-1 text-[10px]">
                              <Hand className="h-3 w-3 text-orange-500" />
                              {bioCounts.palms}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {(device.serialNumber || device.liveInfo?.serialNumber) && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">{t("devices.serial")}</span>
                        <p className="font-medium font-mono text-[10px]">
                          {device.liveInfo?.serialNumber || device.serialNumber}
                        </p>
                      </div>
                    )}
                    {(device.firmware || device.liveInfo?.firmware) && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">{t("devices.firmware")}</span>
                        <p className="font-medium text-[10px]">
                          {device.liveInfo?.firmware || device.firmware}
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
                      onClick={() => syncDeviceFn(device.id, device.name)}
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => detectCapabilities(device.id, device.name)}
                            disabled={detectingId === device.id}
                          >
                            {detectingId === device.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ScanSearch className="h-3 w-3" />
                            )}
                            Detect
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Auto-detect device model and capabilities</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
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
                        <TooltipContent>Restart terminal</TooltipContent>
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
              View device information and manage users on the terminal
            </DialogDescription>
          </DialogHeader>

          {deviceDetailId && (() => {
            const dev = devices.find((d) => d.id === deviceDetailId);
            if (!dev) return null;
            const caps = getDeviceCapabilities(dev);
            const modelName = getDeviceModelName(dev);
            const bioCounts = getBiometricCounts(dev);

            return (
              <div className="space-y-4">
                {/* Device Info */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {dev.name}
                      {dev.deviceType === "MB20" && (
                        <Badge className="text-[8px] h-4 px-1 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                          MB20
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="font-mono">{dev.ip}:{dev.port}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Model</span>
                      <span className="font-medium">{modelName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type</span>
                      <span className="font-medium">{dev.deviceType}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Capabilities</span>
                      <CapabilitiesBadges capabilities={caps} size="sm" />
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
                        <span className="text-muted-foreground">{t("devices.firmware")}</span>
                        <span className="font-medium">{dev.liveInfo?.firmware || dev.firmware}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Sync</span>
                      <span className="font-medium">{dev.lastSyncAt ? format(new Date(dev.lastSyncAt), "yyyy-MM-dd HH:mm") : "Never"}</span>
                    </div>
                    <Separator className="my-2" />
                    {/* Biometric Template Counts */}
                    {(bioCounts.fingers > 0 || bioCounts.faces > 0 || bioCounts.palms > 0) && (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Fingerprints</span>
                          <span className="font-medium flex items-center gap-1">
                            <Fingerprint className="h-3 w-3 text-blue-500" />
                            {bioCounts.fingers}
                          </span>
                        </div>
                        {bioCounts.faces > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Face Templates</span>
                            <span className="font-medium flex items-center gap-1">
                              <Eye className="h-3 w-3 text-violet-500" />
                              {bioCounts.faces}
                            </span>
                          </div>
                        )}
                        {bioCounts.palms > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Palm Templates</span>
                            <span className="font-medium flex items-center gap-1">
                              <Hand className="h-3 w-3 text-orange-500" />
                              {bioCounts.palms}
                            </span>
                          </div>
                        )}
                        <Separator className="my-2" />
                      </>
                    )}
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
