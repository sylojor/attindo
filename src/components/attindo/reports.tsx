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
  CalendarX,
  Shuffle,
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
import { fetchJson } from "@/lib/utils";
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

// ─── Absent on Date Types ───
interface AbsentOnDateEntry {
  employee: {
    id: string;
    employeeId: string;
    name: string;
    nameAr: string | null;
    department: string | null;
    fingerprintId: number | null;
    position: string | null;
  };
  absenceType: "scheduled_off" | "holiday" | "actual_absence";
  holidayInfo: { id: string; name: string; nameAr: string } | null;
  schedule: {
    isOffDay: boolean;
    shiftName: string | null;
    startTime: string | null;
    endTime: string | null;
  };
  attendanceLogs: Array<{
    id: string;
    timestamp: string;
    verifyMode: string;
    ioMode: number;
    device: string;
  }>;
}

interface AbsentOnDateData {
  date: string;
  entries: AbsentOnDateEntry[];
  totalAbsent: number;
}

// ─── Working by Shift Types ───
interface WorkingByShiftEntry {
  employee: {
    id: string;
    employeeId: string;
    name: string;
    nameAr: string | null;
    department: string | null;
    fingerprintId: number | null;
    position: string | null;
  };
  shift: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
  };
  isOffDay: boolean;
  checkIn: string | null;
  checkOut: string | null;
  status: "present" | "late" | "absent" | "off";
  lateMinutes: number;
  overtimeHours: number;
  workedHours: number;
  attendanceLogs: Array<{
    id: string;
    timestamp: string;
    verifyMode: string;
    ioMode: number;
    device: string;
  }>;
}

interface WorkingByShiftData {
  date: string;
  shiftId: string;
  entries: WorkingByShiftEntry[];
  summary: {
    totalEmployees: number;
    presentCount: number;
    absentCount: number;
    offDayCount: number;
  };
}

// ─── Shift Option ───
interface ShiftOption {
  id: string;
  name: string;
  nameAr: string | null;
  startTime: string;
  endTime: string;
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

// ─── Absence Type Badge ───
function absenceTypeBadge(type: "scheduled_off" | "holiday" | "actual_absence", t: (k: string) => string) {
  switch (type) {
    case "holiday":
      return <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{t("reports.holiday")}</Badge>;
    case "scheduled_off":
      return <Badge className="text-xs bg-muted text-muted-foreground">{t("reports.scheduledOff")}</Badge>;
    case "actual_absence":
      return <Badge className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{t("reports.actualAbsence")}</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{type}</Badge>;
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

// ─── Absent on Date Results ───
function AbsentOnDateResults({ data, t, lang }: {
  data: AbsentOnDateData;
  t: (k: string) => string;
  lang: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <CalendarX className="h-4 w-4 text-red-600" />
          {t("reports.absentOnDate")} — {formatDate(data.date)}
        </CardTitle>
        <CardDescription className="text-xs">
          {data.totalAbsent} {lang === "ar" ? "موظف غائب/معطل" : "employee(s) absent/off"}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t("reports.employee")}</TableHead>
                <TableHead className="text-xs">{t("reports.empId")}</TableHead>
                <TableHead className="text-xs">{t("reports.department")}</TableHead>
                <TableHead className="text-xs">{t("reports.absenceType")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">
                    {t("reports.noData")}
                  </TableCell>
                </TableRow>
              ) : (
                data.entries.map((entry) => (
                  <TableRow key={entry.employee.id}>
                    <TableCell className="text-sm py-2">
                      <div>
                        <span className="font-medium">{entry.employee.name}</span>
                        {entry.employee.nameAr && (
                          <span className="text-muted-foreground text-xs ml-1">({entry.employee.nameAr})</span>
                        )}
                      </div>
                      {entry.holidayInfo && (
                        <div className="text-[10px] text-amber-600 mt-0.5">
                          {lang === "ar" && entry.holidayInfo.nameAr ? entry.holidayInfo.nameAr : entry.holidayInfo.name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm py-2">{entry.employee.employeeId}</TableCell>
                    <TableCell className="text-sm py-2">{entry.employee.department || t("reports.unassigned")}</TableCell>
                    <TableCell className="py-2">{absenceTypeBadge(entry.absenceType, t)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Working by Shift Results ───
function WorkingByShiftResults({ data, t, lang }: {
  data: WorkingByShiftData;
  t: (k: string) => string;
  lang: string;
}) {
  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase">{t("reports.employees")}</span>
          </div>
          <p className="text-xl font-bold">{data.summary.totalEmployees}</p>
        </Card>
        <Card className="p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-[10px] text-muted-foreground uppercase">{t("reports.totalPresent")}</span>
          </div>
          <p className="text-xl font-bold text-emerald-600">{data.summary.presentCount}</p>
        </Card>
        <Card className="p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <XCircle className="h-3.5 w-3.5 text-red-600" />
            <span className="text-[10px] text-muted-foreground uppercase">{t("reports.totalAbsent")}</span>
          </div>
          <p className="text-xl font-bold text-red-600">{data.summary.absentCount}</p>
        </Card>
        <Card className="p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Moon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase">{t("reports.totalOff")}</span>
          </div>
          <p className="text-xl font-bold text-muted-foreground">{data.summary.offDayCount}</p>
        </Card>
      </div>

      {/* Detail Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Shuffle className="h-4 w-4 text-emerald-600" />
            {t("reports.workingByShift")} — {formatDate(data.date)}
          </CardTitle>
          <CardDescription className="text-xs">
            {t("reports.shiftInfo")}: {data.entries.length > 0 ? data.entries[0].shift.name : ""} ({data.entries.length > 0 ? `${data.entries[0].shift.startTime} - ${data.entries[0].shift.endTime}` : ""})
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("reports.employee")}</TableHead>
                  <TableHead className="text-xs">{t("reports.checkInTime")}</TableHead>
                  <TableHead className="text-xs">{t("reports.checkOutTime")}</TableHead>
                  <TableHead className="text-xs text-right">{t("reports.workedHrs")}</TableHead>
                  <TableHead className="text-xs text-right">{t("reports.lateMin")}</TableHead>
                  <TableHead className="text-xs text-right">{t("reports.OTHrs")}</TableHead>
                  <TableHead className="text-xs">{t("reports.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-sm">
                      {t("reports.noData")}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.entries.map((entry) => (
                    <TableRow key={entry.employee.id} className={entry.isOffDay ? "opacity-50" : ""}>
                      <TableCell className="text-sm py-2">
                        <div>
                          <span className="font-medium">{entry.employee.name}</span>
                          {entry.employee.nameAr && (
                            <span className="text-muted-foreground text-xs ml-1">({entry.employee.nameAr})</span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{entry.employee.employeeId} • {entry.employee.department || t("reports.unassigned")}</div>
                      </TableCell>
                      <TableCell className="text-xs py-2">{formatTime(entry.checkIn)}</TableCell>
                      <TableCell className="text-xs py-2">{formatTime(entry.checkOut)}</TableCell>
                      <TableCell className="text-xs py-2 text-right">{entry.workedHours > 0 ? entry.workedHours.toFixed(1) : "—"}</TableCell>
                      <TableCell className="text-xs py-2 text-right">{entry.lateMinutes > 0 ? `${entry.lateMinutes}` : "—"}</TableCell>
                      <TableCell className="text-xs py-2 text-right">{entry.overtimeHours > 0 ? entry.overtimeHours.toFixed(1) : "—"}</TableCell>
                      <TableCell className="py-2">{dayStatusBadge(entry.status, t)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Filter Type ───
type FilterType = "department" | "employee" | "absent-on-date" | "working-by-shift";

// ─── Main Component ───
export function ReportsView() {
  const { t, lang } = useTranslation();
  const { currency } = useAppStore();

  // Get today and 30 days ago as default
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const formatDateInput = (d: Date) => d.toISOString().split("T")[0];

  const [filterType, setFilterType] = useState<FilterType>("department");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("all");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState(formatDateInput(thirtyDaysAgo));
  const [dateTo, setDateTo] = useState(formatDateInput(today));
  const [reportGenerated, setReportGenerated] = useState(false);

  // New filter states
  const [absentDate, setAbsentDate] = useState(formatDateInput(today));
  const [selectedShiftId, setSelectedShiftId] = useState<string>("");
  const [shiftDate, setShiftDate] = useState(formatDateInput(today));

  // Fetch departments
  const { data: departments = [] } = useQuery<DepartmentOption[]>({
    queryKey: ["report-departments"],
    queryFn: async () => {
      try {
        return await fetchJson<DepartmentOption[]>("/api/departments");
      } catch {
        return [];
      }
    },
  });

  // Fetch employees
  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ["report-employees"],
    queryFn: async () => {
      try {
        const d = await fetchJson<{ employees: EmployeeOption[] }>("/api/employees?limit=200&isActive=true");
        return d.employees || [];
      } catch {
        return [];
      }
    },
  });

  // Fetch shifts (for working-by-shift)
  const { data: shifts = [] } = useQuery<ShiftOption[]>({
    queryKey: ["report-shifts"],
    queryFn: async () => {
      try {
        return await fetchJson<ShiftOption[]>("/api/shifts");
      } catch {
        return [];
      }
    },
    enabled: filterType === "working-by-shift",
  });

  // Fetch report data (department / employee)
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
      return fetchJson<ReportData>(`/api/reports?${params}`);
    },
    enabled: reportGenerated && (filterType === "department" || filterType === "employee"),
  });

  // Fetch absent-on-date data
  const { data: absentData, isLoading: absentLoading, refetch: refetchAbsent } = useQuery<AbsentOnDateData>({
    queryKey: ["report-absent-on-date", absentDate],
    queryFn: async () => {
      return fetchJson<AbsentOnDateData>(`/api/reports?reportType=absent-on-date&date=${absentDate}`);
    },
    enabled: reportGenerated && filterType === "absent-on-date",
  });

  // Fetch working-by-shift data
  const { data: shiftData, isLoading: shiftLoading, refetch: refetchShift } = useQuery<WorkingByShiftData>({
    queryKey: ["report-working-by-shift", selectedShiftId, shiftDate],
    queryFn: async () => {
      return fetchJson<WorkingByShiftData>(`/api/reports?reportType=working-by-shift&shiftId=${selectedShiftId}&date=${shiftDate}`);
    },
    enabled: reportGenerated && filterType === "working-by-shift" && !!selectedShiftId,
  });

  // Active report data & loading state
  const isActiveReportLoading = filterType === "absent-on-date" ? absentLoading : filterType === "working-by-shift" ? shiftLoading : reportLoading;

  const activeReportData = filterType === "absent-on-date" ? absentData : filterType === "working-by-shift" ? shiftData : reportData;

  const handleGenerate = () => {
    setReportGenerated(true);
    if (filterType === "absent-on-date") {
      refetchAbsent();
    } else if (filterType === "working-by-shift") {
      refetchShift();
    } else {
      refetch();
    }
  };

  // Determine if generate button should be disabled
  const isGenerateDisabled = useMemo(() => {
    if (isActiveReportLoading) return true;
    if (filterType === "department" || filterType === "employee") {
      return !dateFrom || !dateTo;
    }
    if (filterType === "absent-on-date") {
      return !absentDate;
    }
    if (filterType === "working-by-shift") {
      return !selectedShiftId || !shiftDate;
    }
    return false;
  }, [filterType, isActiveReportLoading, dateFrom, dateTo, absentDate, selectedShiftId, shiftDate]);

  // ─── Export to Excel ───
  const exportToExcel = useCallback(async () => {
    if (!activeReportData) return;
    const XLSX = await import("xlsx");

    const rows: Array<Record<string, string | number>> = [];

    if (filterType === "absent-on-date" && absentData) {
      for (const entry of absentData.entries) {
        rows.push({
          [t("reports.employee")]: entry.employee.name,
          [t("reports.empId")]: entry.employee.employeeId,
          [t("reports.department")]: entry.employee.department || "",
          [t("reports.absenceType")]: entry.absenceType,
        });
      }
    } else if (filterType === "working-by-shift" && shiftData) {
      for (const entry of shiftData.entries) {
        rows.push({
          [t("reports.employee")]: entry.employee.name,
          [t("reports.empId")]: entry.employee.employeeId,
          [t("reports.department")]: entry.employee.department || "",
          [t("reports.checkInTime")]: entry.checkIn ? new Date(entry.checkIn).toLocaleTimeString() : "",
          [t("reports.checkOutTime")]: entry.checkOut ? new Date(entry.checkOut).toLocaleTimeString() : "",
          [t("reports.workedHrs")]: entry.workedHours,
          [t("reports.lateMin")]: entry.lateMinutes,
          [t("reports.OTHrs")]: entry.overtimeHours,
          [t("reports.status")]: entry.status,
        });
      }
    } else if (reportData) {
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
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    const fileSuffix = filterType === "absent-on-date" ? absentDate : filterType === "working-by-shift" ? `${shiftDate}_shift` : `${dateFrom}_to_${dateTo}`;
    XLSX.writeFile(wb, `Attindo_Report_${fileSuffix}.xlsx`);
  }, [activeReportData, reportData, absentData, shiftData, currency, dateFrom, dateTo, absentDate, shiftDate, filterType, t, lang]);

  // ─── Export to PDF ───
  const exportToPDF = useCallback(async () => {
    if (!activeReportData) return;
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(16);
    doc.text("Attindo - Attendance Report", pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(10);

    if (filterType === "absent-on-date" && absentData) {
      doc.text(`Absent on Date: ${absentDate}`, pageWidth / 2, 22, { align: "center" });
      const tableData = absentData.entries.map((e) => [
        e.employee.name,
        e.employee.employeeId,
        e.employee.department || "—",
        e.absenceType,
        e.holidayInfo ? (lang === "ar" && e.holidayInfo.nameAr ? e.holidayInfo.nameAr : e.holidayInfo.name) : "—",
      ]);
      autoTable(doc, {
        startY: 30,
        head: [["Employee", "ID", "Department", "Absence Type", "Holiday"]],
        body: tableData,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [239, 68, 68] },
      });
    } else if (filterType === "working-by-shift" && shiftData) {
      doc.text(`Working by Shift: ${shiftDate}`, pageWidth / 2, 22, { align: "center" });
      doc.text(`Present: ${shiftData.summary.presentCount} | Absent: ${shiftData.summary.absentCount} | Off: ${shiftData.summary.offDayCount}`, pageWidth / 2, 28, { align: "center" });
      const tableData = shiftData.entries.map((e) => [
        e.employee.name,
        e.employee.employeeId,
        e.checkIn ? new Date(e.checkIn).toLocaleTimeString() : "—",
        e.checkOut ? new Date(e.checkOut).toLocaleTimeString() : "—",
        e.workedHours.toFixed(1),
        e.lateMinutes > 0 ? `${e.lateMinutes}` : "—",
        e.overtimeHours > 0 ? e.overtimeHours.toFixed(1) : "—",
        e.status,
      ]);
      autoTable(doc, {
        startY: 34,
        head: [["Employee", "ID", "Check In", "Check Out", "Hours", "Late (m)", "OT (h)", "Status"]],
        body: tableData,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [16, 185, 129] },
      });
    } else if (reportData) {
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
    }

    const fileSuffix = filterType === "absent-on-date" ? absentDate : filterType === "working-by-shift" ? `${shiftDate}_shift` : `${dateFrom}_to_${dateTo}`;
    doc.save(`Attindo_Report_${fileSuffix}.pdf`);
  }, [activeReportData, reportData, absentData, shiftData, currency, dateFrom, dateTo, absentDate, shiftDate, filterType, lang]);

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
        {activeReportData && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportToExcel} disabled={isActiveReportLoading}>
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportToPDF} disabled={isActiveReportLoading}>
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
              <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="department">
                    <span className="flex items-center gap-1.5"><Building2 className="h-3 w-3" />{t("reports.department")}</span>
                  </SelectItem>
                  <SelectItem value="employee">
                    <span className="flex items-center gap-1.5"><Users className="h-3 w-3" />{t("reports.employee")}</span>
                  </SelectItem>
                  <SelectItem value="absent-on-date">
                    <span className="flex items-center gap-1.5"><CalendarX className="h-3 w-3" />{t("reports.absentOnDate")}</span>
                  </SelectItem>
                  <SelectItem value="working-by-shift">
                    <span className="flex items-center gap-1.5"><Shuffle className="h-3 w-3" />{t("reports.workingByShift")}</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic Filter Controls */}
            {(filterType === "department" || filterType === "employee") && (
              <>
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
              </>
            )}

            {filterType === "absent-on-date" && (
              <>
                {/* Date picker only */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <CalendarX className="h-3 w-3" /> {t("reports.selectDate")}
                  </label>
                  <Input type="date" value={absentDate} onChange={(e) => setAbsentDate(e.target.value)} />
                </div>
                {/* Empty placeholders to keep grid alignment */}
                <div />
                <div />
                <div />
              </>
            )}

            {filterType === "working-by-shift" && (
              <>
                {/* Shift Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Shuffle className="h-3 w-3" /> {t("reports.selectShift")}
                  </label>
                  <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
                    <SelectTrigger><SelectValue placeholder={t("reports.selectShift")} /></SelectTrigger>
                    <SelectContent>
                      {shifts.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nameAr ? `${s.name} / ${s.nameAr}` : s.name} ({s.startTime} - {s.endTime})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date picker */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {t("reports.selectDate")}
                  </label>
                  <Input type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} />
                </div>
                {/* Empty placeholders to keep grid alignment */}
                <div />
                <div />
              </>
            )}

            {/* Generate Button */}
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              onClick={handleGenerate}
              disabled={isGenerateDisabled}
            >
              {isActiveReportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
              {t("reports.generate")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Content */}
      {isActiveReportLoading && (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {/* Department / Employee Report */}
      {filterType !== "absent-on-date" && filterType !== "working-by-shift" && reportData && !reportLoading && (
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

      {/* Absent on Date Report */}
      {filterType === "absent-on-date" && absentData && !absentLoading && (
        absentData.entries.length === 0 ? (
          <Card className="p-8 text-center">
            <CalendarX className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-1">{t("reports.noData")}</h3>
            <p className="text-sm text-muted-foreground">{t("reports.noDataDesc")}</p>
          </Card>
        ) : (
          <AbsentOnDateResults data={absentData} t={t} lang={lang} />
        )
      )}

      {/* Working by Shift Report */}
      {filterType === "working-by-shift" && shiftData && !shiftLoading && (
        shiftData.entries.length === 0 ? (
          <Card className="p-8 text-center">
            <Shuffle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-1">{t("reports.noData")}</h3>
            <p className="text-sm text-muted-foreground">{t("reports.noDataDesc")}</p>
          </Card>
        ) : (
          <WorkingByShiftResults data={shiftData} t={t} lang={lang} />
        )
      )}

      {/* Empty state before generating */}
      {!activeReportData && !isActiveReportLoading && !reportGenerated && (
        <Card className="p-8 text-center">
          <FileBarChart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-1">{t("reports.welcome")}</h3>
          <p className="text-sm text-muted-foreground">{t("reports.welcomeDesc")}</p>
        </Card>
      )}
    </div>
  );
}
