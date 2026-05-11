"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Wifi,
  Clock,
  AlertTriangle,
  Activity,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format } from "date-fns";

interface DashboardData {
  totalEmployees: number;
  totalDevices: number;
  onlineDevices: number;
  todayAttendance: number;
  todayCheckIns: number;
  lateArrivals: number;
  recentSyncLogs: Array<{
    id: string;
    syncType: string;
    status: string;
    recordsFetched: number;
    recordsUploaded: number;
    startedAt: string;
    completedAt: string | null;
    error: string | null;
    device: { id: string; name: string; status: string };
  }>;
  chartData: Array<{
    date: string;
    dayName: string;
    checkIns: number;
    checkOuts: number;
    total: number;
  }>;
  departments: Array<{ name: string | null; count: number }>;
}

const statCards = [
  {
    key: "totalEmployees",
    label: "Total Employees",
    icon: Users,
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  {
    key: "onlineDevices",
    label: "Active Devices",
    icon: Wifi,
    color: "text-teal-600",
    bg: "bg-teal-50 dark:bg-teal-950/30",
  },
  {
    key: "todayCheckIns",
    label: "Today's Attendance",
    icon: Clock,
    color: "text-cyan-600",
    bg: "bg-cyan-50 dark:bg-cyan-950/30",
  },
  {
    key: "lateArrivals",
    label: "Late Arrivals",
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/30",
  },
];

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-6 w-16" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-60" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export function DashboardView() {
  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      return res.json();
    },
    refetchInterval: 30000,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data) {
    return (
      <Card className="p-6 text-center">
        <p className="text-muted-foreground">
          Failed to load dashboard data. Please try again.
        </p>
      </Card>
    );
  }

  const statValues: Record<string, number> = {
    totalEmployees: data.totalEmployees,
    onlineDevices: data.onlineDevices,
    todayCheckIns: data.todayCheckIns,
    lateArrivals: data.lateArrivals,
  };

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.key}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-lg ${card.bg}`}
                  >
                    <Icon className={`h-6 w-6 ${card.color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                    <p className="text-2xl font-bold">{statValues[card.key]}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Attendance Overview</CardTitle>
            <CardDescription>Last 7 days attendance data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="dayName"
                    className="text-xs"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis className="text-xs" tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar
                    dataKey="checkIns"
                    name="Check-ins"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="checkOuts"
                    name="Check-outs"
                    fill="#14b8a6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Department Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Departments</CardTitle>
            <CardDescription>Employee distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.departments.length === 0 && (
                <p className="text-sm text-muted-foreground">No departments yet</p>
              )}
              {data.departments.map((dept, i) => {
                const colors = [
                  "bg-emerald-500",
                  "bg-teal-500",
                  "bg-cyan-500",
                  "bg-amber-500",
                  "bg-rose-500",
                  "bg-violet-500",
                ];
                const maxCount = Math.max(
                  ...data.departments.map((d) => d.count),
                  1
                );
                const pct = Math.round((dept.count / maxCount) * 100);
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate">
                        {dept.name || "Unassigned"}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {dept.count}
                      </Badge>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${colors[i % colors.length]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Sync Logs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent Sync Logs</CardTitle>
              <CardDescription>Latest device synchronization activities</CardDescription>
            </div>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          {data.recentSyncLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No sync logs yet
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentSyncLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">
                        {log.device.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {log.syncType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs ${
                            log.status === "completed"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : log.status === "failed"
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : log.status === "running"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.recordsFetched}f / {log.recordsUploaded}u
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(log.startedAt), "MMM d, HH:mm")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
