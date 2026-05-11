"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Filter,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

interface AttendanceLog {
  id: string;
  employeeId: string | null;
  deviceId: string;
  timestamp: string;
  verifyMode: string;
  status: string;
  ioMode: number;
  workCode: number;
  employee: {
    id: string;
    employeeId: string;
    name: string;
    nameAr: string | null;
    department: string | null;
    position: string | null;
  } | null;
  device: {
    id: string;
    name: string;
    ip: string;
  };
}

interface AttendanceResponse {
  logs: AttendanceLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface EmployeeOption {
  id: string;
  employeeId: string;
  name: string;
}

interface DeviceOption {
  id: string;
  name: string;
}

const verifyModeLabels: Record<string, { label: string; color: string }> = {
  fingerprint: { label: "Fingerprint", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  card: { label: "Card", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
  face: { label: "Face", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
  password: { label: "Password", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
};

export function AttendanceView() {
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [verifyModeFilter, setVerifyModeFilter] = useState("all");
  const limit = 20;

  // Fetch attendance
  const { data, isLoading } = useQuery<AttendanceResponse>({
    queryKey: ["attendance", page, dateFrom, dateTo, employeeFilter, deviceFilter, verifyModeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (employeeFilter && employeeFilter !== "all")
        params.set("employeeId", employeeFilter);
      if (deviceFilter && deviceFilter !== "all")
        params.set("deviceId", deviceFilter);
      if (verifyModeFilter && verifyModeFilter !== "all")
        params.set("verifyMode", verifyModeFilter);
      const res = await fetch(`/api/attendance?${params}`);
      if (!res.ok) throw new Error("Failed to fetch attendance");
      return res.json();
    },
  });

  // Fetch employees for filter
  const { data: employeeOptions = [] } = useQuery<EmployeeOption[]>({
    queryKey: ["employees-filter"],
    queryFn: async () => {
      const res = await fetch("/api/employees?limit=100&isActive=true");
      if (!res.ok) return [];
      const data = await res.json();
      return data.employees || [];
    },
  });

  // Fetch devices for filter
  const { data: deviceOptions = [] } = useQuery<DeviceOption[]>({
    queryKey: ["devices-filter"],
    queryFn: async () => {
      const res = await fetch("/api/devices");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const resetFilters = () => {
    setDateFrom("");
    setDateTo("");
    setEmployeeFilter("all");
    setDeviceFilter("all");
    setVerifyModeFilter("all");
    setPage(1);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Attendance Logs</CardTitle>
              <CardDescription>
                View and filter attendance records
              </CardDescription>
            </div>
            <Button variant="outline" className="gap-2" disabled>
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  className="w-full sm:w-40"
                  placeholder="From"
                />
                <span className="text-muted-foreground text-sm">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  className="w-full sm:w-40"
                  placeholder="To"
                />
              </div>
              <Select value={employeeFilter} onValueChange={(v) => { setEmployeeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employeeOptions.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} ({e.employeeId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={deviceFilter} onValueChange={(v) => { setDeviceFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Device" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Devices</SelectItem>
                  {deviceOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={verifyModeFilter} onValueChange={(v) => { setVerifyModeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Verify Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modes</SelectItem>
                  <SelectItem value="fingerprint">Fingerprint</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="face">Face</SelectItem>
                  <SelectItem value="password">Password</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1">
                <Filter className="h-3 w-3" />
                Reset
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="max-h-[calc(100vh-400px)] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="hidden sm:table-cell">Device</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Verify Mode</TableHead>
                  <TableHead>IO Mode</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No attendance records found
                    </TableCell>
                  </TableRow>
                )}
                {data?.logs.map((log) => {
                  const vmConfig = verifyModeLabels[log.verifyMode] || {
                    label: log.verifyMode,
                    color: "bg-muted text-muted-foreground",
                  };
                  return (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">
                            {log.employee?.name || "Unknown"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {log.employee?.employeeId}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">
                        {log.device.name}
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(log.timestamp), "MMM d, yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${vmConfig.color}`}>
                          {vmConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            log.ioMode === 0
                              ? "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400"
                              : "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"
                          }`}
                        >
                          {log.ioMode === 0 ? "Check-in" : "Check-out"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-[10px] ${
                            log.status === "check-in"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          }`}
                        >
                          {log.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">
                Showing {(page - 1) * limit + 1}–
                {Math.min(page * limit, data.total)} of {data.total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  {page} / {data.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
