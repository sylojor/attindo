"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileBarChart,
  Download,
  FileSpreadsheet,
  FileText,
  Users,
  Building2,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Timer,
  TrendingUp,
  Loader2,
  ChevronDown,
  ChevronUp,
  Moon,
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
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/hooks/use-translation";
import { useAppStore } from "@/store/app-store";
import { CURRENCIES } from "@/components/attindo/settings";

// ─── Helpers ───
function formatCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTime(isoString: string | null): string {
  if (!isoString) return "—";
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const DAY_NAMES_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const DAY_NAMES_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Types ───
interface DepartmentOption {
  id: string;
  name: string;
  nameAr: string | null;
}

interface EmployeeOption {
  id: string;
  employeeId: string;
  name: string;
  nameAr: string | null;
  position: string | null;
}

interface DailyDetail {
  date: string;
  dayOfWeek: number;
  isOffDay: boolean;
  status: string;
  firstCheckIn: string | null;
  lastCheckOut: string | null;
  lateMinutes: number;
  overtimeHours: number;
  workedHours: number;
}

interface SalaryInfo {
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  foodAllowance: number;
  otherAllowances: number;
  totalFixedAllowances: number;
  customAllowances: number;
  totalAllowances: number;
  lateDeductions: number;
  absentDeductions: number;
  customDeductions: number;
  totalDeductions: number;
  overtimePay: number;
  loanDeduction: number;
  netSalary: number;
  currency: string;
}

interface EmployeeReport {
  employee: {
    id: string;
    employeeId: string;
    name: string;
    nameAr: string | null;
    department: { id: string; name: string; nameAr: string | null } | null;
    position: string | null;
  };
  summary: {
    workingDays: number;
    presentDays: number;
    absentDays: number;
    lateDays: number;
    totalLateMinutes: number;
    totalLateHours: number;
    totalOvertimeHours: number;
    totalWorkedHours: number;
  };
  dailyDetails: DailyDetail[];
  salaryInfo: SalaryInfo | null;
  attendanceLogs: Array<{
    id: string;
    timestamp: string;
    verifyMode: string;
    ioMode: number;
    device: string;
  }>;
}

interface ReportData {
  period: { from: string; to: string };
  employees: EmployeeReport[];
  totalEmployees: number;
}

// ─── Status Badge ───
function dayStatusBadge(status: string, t: (k: string) => string) {
  switch (status) {
    case "present":
      return <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{t("reports.present")}</Badge>;
    case "late":
      return <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{t("reports.late")}</Badge>;
    case "absent":
      return <Badge className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{t("reports.absent")}</Badge>;
    case "off":
      return <Badge className="text-xs bg-muted text-muted-foreground">{t("reports.dayOff")}</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

// ─── Employee Detail Card ───
function EmployeeDetailCard({ report, currency, t, lang }: {
  report: EmployeeReport;
  currency: string;
  t: (k: string) => string;
  lang: string;
}) {
  const [showDaily, setShowDaily] = useState(false);
  const { summary, salaryInfo, employee } = report;

  const dayName = (dow: number) => lang === "ar" ? DAY_NAMES_AR[dow] : DAY_NAMES_EN[dow];

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" />
              {employee.name}
              {employee.nameAr && <span className="text-muted-foreground text-sm">({employee.nameAr})</span>}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {employee.employeeId} • {employee.department?.name || t("reports.unassigned")} {employee.position ? `• ${employee.position}` : ""}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-[10px] text-muted-foreground uppercase">{t("reports.presentDays")}</span>
            </div>
            <p className="text-lg font-bold text-emerald-600">{summary.presentDays}</p>
            <p className="text-[10px] text-muted-foreground">{t("reports.of")} {summary.workingDays}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-[10px] text-muted-foreground uppercase">{t("reports.lateDays")}</span>
            </div>
            <p className="text-lg font-bold text-amber-600">{summary.lateDays}</p>
            <p className="text-[10px] text-muted-foreground">{summary.totalLateHours}h {t("reports.lateHours")}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <XCircle className="h-3.5 w-3.5 text-red-600" />
              <span className="text-[10px] text-muted-foreground uppercase">{t("reports.absentDays")}</span>
            </div>
            <p className="text-lg font-bold text-red-600">{summary.absentDays}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-teal-600" />
              <span className="text-[10px] text-muted-foreground uppercase">{t("reports.overtimeHours")}</span>
            </div>
            <p className="text-lg font-bold text-teal-600">{summary.totalOvertimeHours.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground">{summary.totalWorkedHours.toFixed(1)}h {t("reports.totalWorked")}</p>
          </div>
        </div>

        {/* Salary Info */}
        {salaryInfo && (
          <div className="border rounded-lg p-3">
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5 text-emerald-600" />
              {t("reports.salaryBreakdown")}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("reports.basicSalary")}</span><span>{formatCurrency(salaryInfo.basicSalary, currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("reports.housing")}</span><span>{formatCurrency(salaryInfo.housingAllowance, currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("reports.transport")}</span><span>{formatCurrency(salaryInfo.transportAllowance, currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("reports.food")}</span><span>{formatCurrency(salaryInfo.foodAllowance, currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("reports.otherAllowances")}</span><span>{formatCurrency(salaryInfo.otherAllowances + salaryInfo.customAllowances, currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("reports.totalAllowances")}</span><span className="font-medium">{formatCurrency(salaryInfo.totalAllowances, currency)}</span></div>
              <Separator className="col-span-full my-1" />
              <div className="flex justify-between text-red-600"><span>{t("reports.lateDeduction")}</span><span>-{formatCurrency(salaryInfo.lateDeductions, currency)}</span></div>
              <div className="flex justify-between text-red-600"><span>{t("reports.absentDeduction")}</span><span>-{formatCurrency(salaryInfo.absentDeductions, currency)}</span></div>
              <div className="flex justify-between text-red-600"><span>{t("reports.otherDeductions")}</span><span>-{formatCurrency(salaryInfo.customDeductions, currency)}</span></div>
              {salaryInfo.loanDeduction > 0 && (
                <div className="flex justify-between text-red-600"><span>{t("reports.loanDeduction")}</span><span>-{formatCurrency(salaryInfo.loanDeduction, currency)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">{t("reports.overtimePay")}</span><span className="text-teal-600">+{formatCurrency(salaryInfo.overtimePay, currency)}</span></div>
              <Separator className="col-span-full my-1" />
              <div className="flex justify-between font-bold col-span-full">
                <span>{t("reports.netSalary")}</span>
                <span className="text-emerald-600">{formatCurrency(salaryInfo.netSalary, currency)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Daily Details Toggle */}
        <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setShowDaily(!showDaily)}>
          {showDaily ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
          {showDaily ? t("reports.hideDaily") : t("reports.showDaily")}
        </Button>

        {showDaily && (
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("reports.date")}</TableHead>
                  <TableHead className="text-xs">{t("reports.day")}</TableHead>
                  <TableHead className="text-xs">{t("reports.checkIn")}</TableHead>
                  <TableHead className="text-xs">{t("reports.checkOut")}</TableHead>
                  <TableHead className="text-xs text-right">{t("reports.workedHrs")}</TableHead>
                  <TableHead className="text-xs text-right">{t("reports.lateMin")}</TableHead>
                  <TableHead className="text-xs text-right">{t("reports.OTHrs")}</TableHead>
                  <TableHead className="text-xs">{t("reports.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.dailyDetails.map((day) => (
                  <TableRow key={day.date} className={day.isOffDay ? "opacity-50" : ""}>
                    <TableCell className="text-xs py-1.5">{formatDate(day.date)}</TableCell>
                    <TableCell className="text-xs py-1.5">{dayName(day.dayOfWeek)}</TableCell>
                    <TableCell className="text-xs py-1.5">{formatTime(day.firstCheckIn)}</TableCell>
                    <TableCell className="text-xs py-1.5">{formatTime(day.lastCheckOut)}</TableCell>
                    <TableCell className="text-xs py-1.5 text-right">{day.workedHours > 0 ? day.workedHours.toFixed(1) : "—"}</TableCell>
                    <TableCell className="text-xs py-1.5 text-right">{day.lateMinutes > 0 ? `${day.lateMinutes}` : "—"}</TableCell>
                    <TableCell className="text-xs py-1.5 text-right">{day.overtimeHours > 0 ? day.overtimeHours.toFixed(1) : "—"}</TableCell>
                    <TableCell className="py-1.5">{dayStatusBadge(day.status, t)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───
export function ReportsView() {
  const { t, lang } = useTranslation();
  const { currency } = useAppStore();

  // Get today and 30 days ago as default
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const formatDateInput = (d: Date) => d.toISOString().split("T")[0];

  const [filterType, setFilterType] = useState<"department" | "employee">("department");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("all");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState(formatDateInput(thirtyDaysAgo));
  const [dateTo, setDateTo] = useState(formatDateInput(today));
  const [reportGenerated, setReportGenerated] = useState(false);

  // Fetch departments
  const { data: departments = [] } = useQuery<DepartmentOption[]>({
    queryKey: ["report-departments"],
    queryFn: async () => {
      const res = await fetch("/api/departments");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Fetch employees
  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ["report-employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees?limit=200&isActive=true");
      if (!res.ok) return [];
      const d = await res.json();
      return d.employees || [];
    },
  });

  // Fetch report data
  const { data: reportData, isLoading: reportLoading, refetch } = useQuery<ReportData>({
    queryKey: ["report", filterType, selectedDepartmentId, selectedEmployeeId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (filterType === "department" && selectedDepartmentId && selectedDepartmentId !== "all") {
        params.set("departmentId", selectedDepartmentId);
      }
      if (filterType === "employee" && selectedEmployeeId && selectedEmployeeId !== "all") {
        params.set("employeeId", selectedEmployeeId);
      }
      const res = await fetch(`/api/reports?${params}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate report");
      }
      return res.json();
    },
    enabled: reportGenerated,
  });

  const handleGenerate = () => {
    setReportGenerated(true);
    refetch();
  };

  // ─── Export to Excel ───
  const exportToExcel = useCallback(async () => {
    if (!reportData) return;
    const XLSX = await import("xlsx");

    const rows: Array<Record<string, string | number>> = [];
    for (const emp of reportData.employees) {
      for (const day of emp.dailyDetails) {
        rows.push({
          [t("reports.employee")]: emp.employee.name,
          [t("reports.empId")]: emp.employee.employeeId,
          [t("reports.department")]: emp.employee.department?.name || "",
          [t("reports.date")]: day.date,
          [t("reports.day")]: lang === "ar" ? DAY_NAMES_AR[day.dayOfWeek] : DAY_NAMES_EN[day.dayOfWeek],
          [t("reports.checkIn")]: day.firstCheckIn ? new Date(day.firstCheckIn).toLocaleTimeString() : "",
          [t("reports.checkOut")]: day.lastCheckOut ? new Date(day.lastCheckOut).toLocaleTimeString() : "",
          [t("reports.workedHrs")]: day.workedHours,
          [t("reports.lateMin")]: day.lateMinutes,
          [t("reports.OTHrs")]: day.overtimeHours,
          [t("reports.status")]: day.status,
        });
      }
      // Add summary row
      rows.push({
        [t("reports.employee")]: "",
        [t("reports.empId")]: "",
        [t("reports.department")]: "",
        [t("reports.date")]: "SUMMARY",
        [t("reports.day")]: "",
        [t("reports.checkIn")]: "",
        [t("reports.checkOut")]: "",
        [t("reports.workedHrs")]: emp.summary.totalWorkedHours,
        [t("reports.lateMin")]: emp.summary.totalLateMinutes,
        [t("reports.OTHrs")]: emp.summary.totalOvertimeHours,
        [t("reports.status")]: `Present:${emp.summary.presentDays} Late:${emp.summary.lateDays} Absent:${emp.summary.absentDays}`,
      });
      // Add salary row
      if (emp.salaryInfo) {
        rows.push({
          [t("reports.employee")]: "",
          [t("reports.empId")]: "",
          [t("reports.department")]: "",
          [t("reports.date")]: "SALARY",
          [t("reports.day")]: "",
          [t("reports.checkIn")]: "",
          [t("reports.checkOut")]: "",
          [t("reports.workedHrs")]: 0,
          [t("reports.lateMin")]: 0,
          [t("reports.OTHrs")]: 0,
          [t("reports.status")]: `Net: ${formatCurrency(emp.salaryInfo.netSalary, currency)}`,
        });
      }
      rows.push({} as Record<string, string>);
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `Attindo_Report_${dateFrom}_to_${dateTo}.xlsx`);
  }, [reportData, currency, dateFrom, dateTo, t, lang]);

  // ─── Export to PDF ───
  const exportToPDF = useCallback(async () => {
    if (!reportData) return;
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(16);
    doc.text("Attindo - Attendance & Salary Report", pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Period: ${dateFrom} to ${dateTo}`, pageWidth / 2, 22, { align: "center" });

    let yOffset = 30;

    for (const emp of reportData.employees) {
      // Employee header
      doc.setFontSize(12);
      doc.text(`${emp.employee.name} (${emp.employee.employeeId}) - ${emp.employee.department?.name || "N/A"}`, 14, yOffset);
      yOffset += 5;

      // Summary
      doc.setFontSize(9);
      doc.text(
        `Working: ${emp.summary.workingDays} | Present: ${emp.summary.presentDays} | Late: ${emp.summary.lateDays} | Absent: ${emp.summary.absentDays} | Overtime: ${emp.summary.totalOvertimeHours.toFixed(1)}h`,
        14,
        yOffset
      );
      yOffset += 5;

      if (emp.salaryInfo) {
        doc.text(
          `Net Salary: ${formatCurrency(emp.salaryInfo.netSalary, currency)}`,
          14,
          yOffset
        );
        yOffset += 5;
      }

      // Daily table
      const tableData = emp.dailyDetails
        .filter((d) => !d.isOffDay)
        .map((d) => [
          d.date,
          d.firstCheckIn ? new Date(d.firstCheckIn).toLocaleTimeString() : "—",
          d.lastCheckOut ? new Date(d.lastCheckOut).toLocaleTimeString() : "—",
          d.workedHours.toFixed(1),
          d.lateMinutes > 0 ? `${d.lateMinutes}` : "—",
          d.overtimeHours > 0 ? d.overtimeHours.toFixed(1) : "—",
          d.status,
        ]);

      autoTable(doc, {
        startY: yOffset,
        head: [["Date", "Check In", "Check Out", "Hours", "Late (m)", "OT (h)", "Status"]],
        body: tableData,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [16, 185, 129] },
        margin: { left: 14 },
      });

      yOffset = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yOffset;
      yOffset += 10;

      // New page if needed
      if (yOffset > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        yOffset = 20;
      }
    }

    doc.save(`Attindo_Report_${dateFrom}_to_${dateTo}.pdf`);
  }, [reportData, currency, dateFrom, dateTo]);

  // ─── Department Summary ───
  const departmentSummary = useMemo(() => {
    if (!reportData) return [];
    const deptMap = new Map<string, { name: string; presentDays: number; lateDays: number; absentDays: number; totalEmployees: number; netSalary: number }>();
    for (const emp of reportData.employees) {
      const deptName = emp.employee.department?.name || "Unassigned";
      const existing = deptMap.get(deptName) || { name: deptName, presentDays: 0, lateDays: 0, absentDays: 0, totalEmployees: 0, netSalary: 0 };
      existing.presentDays += emp.summary.presentDays;
      existing.lateDays += emp.summary.lateDays;
      existing.absentDays += emp.summary.absentDays;
      existing.totalEmployees++;
      existing.netSalary += emp.salaryInfo?.netSalary || 0;
      deptMap.set(deptName, existing);
    }
    return Array.from(deptMap.values());
  }, [reportData]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileBarChart className="h-5 w-5 text-emerald-600" />
          <h1 className="text-xl font-bold">{t("reports.title")}</h1>
        </div>
        {reportData && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportToExcel} disabled={reportLoading}>
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportToPDF} disabled={reportLoading}>
              <FileText className="h-3.5 w-3.5" />
              PDF
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            {/* Filter Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("reports.filterBy")}</label>
              <Select value={filterType} onValueChange={(v) => setFilterType(v as "department" | "employee")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="department">
                    <span className="flex items-center gap-1.5"><Building2 className="h-3 w-3" />{t("reports.department")}</span>
                  </SelectItem>
                  <SelectItem value="employee">
                    <span className="flex items-center gap-1.5"><Users className="h-3 w-3" />{t("reports.employee")}</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Department/Employee Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {filterType === "department" ? t("reports.selectDepartment") : t("reports.selectEmployee")}
              </label>
              {filterType === "department" ? (
                <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
                  <SelectTrigger><SelectValue placeholder={t("reports.allDepartments")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("reports.allDepartments")}</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.nameAr ? `${d.name} / ${d.nameAr}` : d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                  <SelectTrigger><SelectValue placeholder={t("reports.allEmployees")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("reports.allEmployees")}</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name} ({e.employeeId})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Date From */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {t("reports.from")}
              </label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>

            {/* Date To */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {t("reports.to")}
              </label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>

            {/* Generate Button */}
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              onClick={handleGenerate}
              disabled={reportLoading || !dateFrom || !dateTo}
            >
              {reportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
              {t("reports.generate")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Content */}
      {reportLoading && (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {reportData && !reportLoading && (
        <>
          {/* Department Summary (if filtering by department with multiple results) */}
          {filterType === "department" && departmentSummary.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-emerald-600" />
                  {t("reports.departmentSummary")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t("reports.department")}</TableHead>
                      <TableHead className="text-xs text-center">{t("reports.employees")}</TableHead>
                      <TableHead className="text-xs text-center">{t("reports.avgPresent")}</TableHead>
                      <TableHead className="text-xs text-center">{t("reports.avgLate")}</TableHead>
                      <TableHead className="text-xs text-center">{t("reports.avgAbsent")}</TableHead>
                      <TableHead className="text-xs text-right">{t("reports.totalNetSalary")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departmentSummary.map((dept) => (
                      <TableRow key={dept.name}>
                        <TableCell className="text-sm font-medium">{dept.name}</TableCell>
                        <TableCell className="text-sm text-center">{dept.totalEmployees}</TableCell>
                        <TableCell className="text-sm text-center">{Math.round(dept.presentDays / dept.totalEmployees)}</TableCell>
                        <TableCell className="text-sm text-center">{Math.round(dept.lateDays / dept.totalEmployees)}</TableCell>
                        <TableCell className="text-sm text-center">{Math.round(dept.absentDays / dept.totalEmployees)}</TableCell>
                        <TableCell className="text-sm text-right font-medium">{formatCurrency(dept.netSalary, currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Employee Reports */}
          {reportData.employees.length === 0 ? (
            <Card className="p-8 text-center">
              <FileBarChart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">{t("reports.noData")}</h3>
              <p className="text-sm text-muted-foreground">{t("reports.noDataDesc")}</p>
            </Card>
          ) : (
            reportData.employees.map((emp) => (
              <EmployeeDetailCard
                key={emp.employee.id}
                report={emp}
                currency={currency}
                t={t}
                lang={lang}
              />
            ))
          )}
        </>
      )}

      {/* Empty state before generating */}
      {!reportData && !reportLoading && !reportGenerated && (
        <Card className="p-8 text-center">
          <FileBarChart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-1">{t("reports.welcome")}</h3>
          <p className="text-sm text-muted-foreground">{t("reports.welcomeDesc")}</p>
        </Card>
      )}
    </div>
  );
}
