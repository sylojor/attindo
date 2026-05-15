"use client";

import React, { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Info,
  Clock,
  DollarSign,
  CreditCard,
  CalendarDays,
  User,
  Phone,
  Mail,
  Building2,
  Briefcase,
  Fingerprint,
  Loader2,
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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";
import { useAppStore } from "@/store/app-store";
import { fetchJson } from "@/lib/utils";

// ─── Helpers ───
function formatCurrency(amount: number, currency = "SAR"): string {
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function useFormatCurrency() {
  const { currency } = useAppStore();
  return (amount: number) => formatCurrency(amount, currency);
}

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  nameAr: string | null;
  departmentId: string | null;
  department: { id: string; name: string; nameAr: string | null } | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  fingerprintId: number | null;
  isActive: boolean;
  shiftId: string | null;
  shift: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    color: string;
  } | null;
  createdAt: string;
}

interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
}

interface Department {
  id: string;
  name: string;
  nameAr: string | null;
}

interface EmployeesResponse {
  employees: Employee[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Profile Types ───
interface EmployeeProfile {
  employee: {
    id: string;
    employeeId: string;
    name: string;
    nameAr: string | null;
    department: { id: string; name: string; nameAr: string | null } | null;
    position: string | null;
    phone: string | null;
    email: string | null;
    fingerprintId: number | null;
    isActive: boolean;
    hireDate: string | null;
    createdAt: string;
  };
  salaryInfo: {
    basicSalary: number;
    housingAllowance: number;
    transportAllowance: number;
    foodAllowance: number;
    otherAllowances: number;
    grossSalary: number;
    overtimeRate: number;
    deductionPerLate: number;
    deductionPerAbsent: number;
    currency: string;
    effectiveDate: string;
  } | null;
  activeLoans: {
    id: string;
    type: string;
    amount: number;
    monthlyDeduction: number;
    remainingBalance: number;
    issueDate: string;
    notes: string | null;
  }[];
  shiftInfo: {
    id: string;
    name: string;
    nameAr: string | null;
    startTime: string;
    endTime: string;
    gracePeriod: number;
    isOvernight: boolean;
    color: string;
  } | null;
  attendanceSummary: {
    presentDays: number;
    lateDays: number;
    absentDays: number;
    totalWorkingDays: number;
    totalWorkedHours: number;
    overtimeHours: number;
  };
  recentAttendance: {
    id: string;
    timestamp: string;
    verifyMode: string;
    ioMode: number;
    status: string;
    device: { id: string; name: string };
  }[];
  customAllowances: {
    id: string;
    name: string;
    nameAr: string | null;
    amount: number;
    type: string;
  }[];
  customDeductions: {
    id: string;
    name: string;
    nameAr: string | null;
    amount: number;
    type: string;
  }[];
}

const employeeSchema = z.object({
  employeeId: z.string().min(1, "Employee ID is required"),
  name: z.string().min(1, "Name is required"),
  nameAr: z.string().optional().default(""),
  departmentId: z.string().optional(),
  position: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  email: z.string().optional().default(""),
  fingerprintId: z.coerce.number().optional().nullable(),
  shiftId: z.string().optional(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

// ─── Profile Dialog Component ───
function EmployeeProfileDialog({
  employeeId,
  open,
  onOpenChange,
}: {
  employeeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const formatAmt = useFormatCurrency();

  // Fetch fingerprint registration status for this dialog
  const { data: fingerprintStatus } = useQuery<{ registeredIds: number[]; deviceCount: number }>({
    queryKey: ["fingerprint-status"],
    queryFn: async () => {
      try {
        return await fetchJson<{ registeredIds: number[]; deviceCount: number }>("/api/fingerprint-status");
      } catch {
        return { registeredIds: [], deviceCount: 0 };
      }
    },
    staleTime: 30000,
  });

  const { data: profile, isLoading } = useQuery<EmployeeProfile | null>({
    queryKey: ["employee-profile", employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      return fetchJson<EmployeeProfile>(`/api/employees/${employeeId}/profile`);
    },
    enabled: !!employeeId && open,
  });

  const emp = profile?.employee;
  const salary = profile?.salaryInfo;
  const loans = profile?.activeLoans ?? [];
  const summary = profile?.attendanceSummary;
  const recentAtt = profile?.recentAttendance ?? [];
  const shiftInfo = profile?.shiftInfo;
  const customAllowances = profile?.customAllowances ?? [];
  const customDeductions = profile?.customDeductions ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-emerald-600" />
            {t("employees.profile")}
          </DialogTitle>
          <DialogDescription>
            {emp ? `${emp.name}${emp.nameAr ? ` / ${emp.nameAr}` : ""}` : ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !profile ? (
          <div className="py-8 text-center text-muted-foreground">
            {t("common.error")}
          </div>
        ) : (
          <div className="space-y-5">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow icon={<User className="h-3.5 w-3.5" />} label={t("employees.name")} value={emp.name} />
              <InfoRow icon={<User className="h-3.5 w-3.5" />} label={t("employees.nameAr")} value={emp.nameAr || "—"} dir="rtl" />
              <InfoRow icon={<Briefcase className="h-3.5 w-3.5" />} label={t("employees.empId")} value={emp.employeeId} mono />
              <InfoRow
                icon={<Fingerprint className="h-3.5 w-3.5" />}
                label={t("employees.fingerprintId")}
                value={
                  emp.fingerprintId != null ? (
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono">{emp.fingerprintId}</span>
                      {(fingerprintStatus?.registeredIds ?? []).includes(emp.fingerprintId) ? (
                        <Badge className="text-[10px] px-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          {t("employees.fpRegistered")}
                        </Badge>
                      ) : (
                        <Badge className="text-[10px] px-1.5 bg-muted text-muted-foreground">
                          {t("employees.fpNotRegistered")}
                        </Badge>
                      )}
                    </span>
                  ) : (
                    "—"
                  )
                }
                mono
              />
              <InfoRow icon={<Building2 className="h-3.5 w-3.5" />} label={t("employees.department")} value={emp.department?.name || "—"} />
              <InfoRow icon={<Briefcase className="h-3.5 w-3.5" />} label={t("employees.position")} value={emp.position || "—"} />
              <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label={t("employees.phone")} value={emp.phone || "—"} />
              <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label={t("employees.email")} value={emp.email || "—"} />
              {emp.hireDate && (
                <InfoRow icon={<CalendarDays className="h-3.5 w-3.5" />} label={t("employees.hireDate")} value={new Date(emp.hireDate).toLocaleDateString()} />
              )}
              <InfoRow
                icon={<User className="h-3.5 w-3.5" />}
                label={t("employees.status")}
                value={
                  <Badge
                    className={`text-xs ${
                      emp.isActive
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {emp.isActive ? t("employees.active") : t("employees.inactive")}
                  </Badge>
                }
              />
            </div>

            <Separator />

            {/* Shift Info */}
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                <Clock className="h-4 w-4 text-emerald-600" />
                {t("employees.shiftInfo")}
              </h4>
              {shiftInfo ? (
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: shiftInfo.color }} />
                    <span className="font-medium">{shiftInfo.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("shifts.startTime")}:</span>{" "}
                    <span className="font-mono">{shiftInfo.startTime}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("shifts.endTime")}:</span>{" "}
                    <span className="font-mono">{shiftInfo.endTime}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("employees.noShift")}</p>
              )}
            </div>

            <Separator />

            {/* Attendance Summary */}
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                <CalendarDays className="h-4 w-4 text-emerald-600" />
                {t("employees.attendanceSummary")}
                <span className="text-xs text-muted-foreground font-normal">(30 {t("reports.of").toLowerCase()} {t("reports.day").toLowerCase()}s)</span>
              </h4>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                <SummaryCard
                  label={t("employees.daysPresent")}
                  value={summary?.presentDays ?? 0}
                  color="text-emerald-600"
                  bg="bg-emerald-50 dark:bg-emerald-900/20"
                />
                <SummaryCard
                  label={t("employees.daysLate")}
                  value={summary?.lateDays ?? 0}
                  color="text-amber-600"
                  bg="bg-amber-50 dark:bg-amber-900/20"
                />
                <SummaryCard
                  label={t("employees.daysAbsent")}
                  value={summary?.absentDays ?? 0}
                  color="text-red-600"
                  bg="bg-red-50 dark:bg-red-900/20"
                />
                <SummaryCard
                  label={t("employees.totalWorked")}
                  value={`${summary?.totalWorkedHours ?? 0}h`}
                  color="text-blue-600"
                  bg="bg-blue-50 dark:bg-blue-900/20"
                />
                <SummaryCard
                  label={t("employees.overtimeHours")}
                  value={`${summary?.overtimeHours ?? 0}h`}
                  color="text-teal-600"
                  bg="bg-teal-50 dark:bg-teal-900/20"
                />
              </div>
            </div>

            <Separator />

            {/* Salary Info */}
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                <DollarSign className="h-4 w-4 text-emerald-600" />
                {t("employees.salaryInfo")}
              </h4>
              {salary ? (
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("employees.basicSalary")}</span>
                    <span>{formatAmt(salary.basicSalary)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("employees.housingAllowance")}</span>
                    <span>{formatAmt(salary.housingAllowance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("employees.transportAllowance")}</span>
                    <span>{formatAmt(salary.transportAllowance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("employees.foodAllowance")}</span>
                    <span>{formatAmt(salary.foodAllowance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("employees.otherAllowances")}</span>
                    <span>{formatAmt(salary.otherAllowances)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>{t("employees.grossSalary")}</span>
                    <span className="text-emerald-600">{formatAmt(salary.grossSalary)}</span>
                  </div>
                  {/* Custom allowances & deductions */}
                  {(profile.customAllowances.length > 0 || profile.customDeductions.length > 0) && (
                    <>
                      <Separator />
                      {profile.customAllowances.map((a) => (
                        <div key={a.id} className="flex justify-between text-emerald-700 dark:text-emerald-400">
                          <span className="text-muted-foreground">+ {a.nameAr || a.name}</span>
                          <span>{formatAmt(a.amount)}</span>
                        </div>
                      ))}
                      {profile.customDeductions.map((d) => (
                        <div key={d.id} className="flex justify-between text-red-600">
                          <span className="text-muted-foreground">- {d.nameAr || d.name}</span>
                          <span>{formatAmt(d.amount)}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("employees.noSalary")}</p>
              )}
            </div>

            <Separator />

            {/* Active Loans */}
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                <CreditCard className="h-4 w-4 text-emerald-600" />
                {t("employees.activeLoans")}
              </h4>
              {loans.length > 0 ? (
                <div className="space-y-2">
                  {loans.map((loan) => (
                    <div key={loan.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {loan.type === "advance" ? t("employees.advance") : t("employees.loan")}
                        </Badge>
                        <span className="font-medium">{formatAmt(loan.amount)}</span>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>{t("employees.remainingBalance")}: <span className="font-medium text-foreground">{formatAmt(loan.remainingBalance)}</span></div>
                        <div>{t("employees.monthlyDeduction")}: <span className="font-medium text-foreground">{formatAmt(loan.monthlyDeduction)}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("employees.noLoans")}</p>
              )}
            </div>

            <Separator />

            {/* Recent Attendance */}
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                <Clock className="h-4 w-4 text-emerald-600" />
                {t("employees.recentAttendance")}
              </h4>
              {recentAtt.length > 0 ? (
                <div className="max-h-52 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs h-8">{t("employees.timestamp")}</TableHead>
                        <TableHead className="text-xs h-8">{t("employees.verifyMode")}</TableHead>
                        <TableHead className="text-xs h-8">{t("attendance.ioMode")}</TableHead>
                        <TableHead className="text-xs h-8">{t("employees.device")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentAtt.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs font-mono py-1.5">
                            {new Date(log.timestamp).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell className="text-xs py-1.5">
                            <Badge variant="outline" className="text-[10px] px-1.5">
                              {log.verifyMode}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-1.5">
                            <Badge
                              className={`text-[10px] px-1.5 ${
                                log.ioMode === 0
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              }`}
                            >
                              {log.ioMode === 0 ? t("attendance.checkIn") : t("attendance.checkOut")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-1.5 text-muted-foreground">
                            {log.device.name}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("attendance.noRecords")}</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Small helper components ───

function InfoRow({
  icon,
  label,
  value,
  mono,
  dir,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  dir?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground text-xs min-w-[80px]">{label}:</span>
      <span className={`text-xs ${mono ? "font-mono" : "font-medium"}`} dir={dir}>
        {value}
      </span>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: number | string;
  color: string;
  bg: string;
}) {
  return (
    <div className={`rounded-lg p-3 text-center ${bg}`}>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

// ─── Main Component ───

export function EmployeesView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const limit = 20;

  // Fetch ALL employees at once - we'll filter client-side
  const { data: allData, isLoading } = useQuery<EmployeesResponse>({
    queryKey: ["employees", "all"],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        limit: "9999",
      });
      return fetchJson<EmployeesResponse>(`/api/employees?${params}`);
    },
  });

  // Client-side filtering
  const filteredEmployees = useMemo(() => {
    let result = allData?.employees ?? [];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (emp) =>
          emp.employeeId.toLowerCase().includes(q) ||
          emp.name.toLowerCase().includes(q) ||
          (emp.nameAr && emp.nameAr.toLowerCase().includes(q)) ||
          (emp.position && emp.position.toLowerCase().includes(q)) ||
          (emp.phone && emp.phone.includes(q)) ||
          (emp.fingerprintId != null && String(emp.fingerprintId).includes(q))
      );
    }

    if (departmentFilter && departmentFilter !== "all") {
      result = result.filter((emp) => emp.departmentId === departmentFilter);
    }

    if (statusFilter && statusFilter !== "all") {
      const isActive = statusFilter === "true";
      result = result.filter((emp) => emp.isActive === isActive);
    }

    return result;
  }, [allData?.employees, search, departmentFilter, statusFilter]);

  // Client-side pagination
  const totalFiltered = filteredEmployees.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
  const currentPage = Math.min(page, totalPages);
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * limit;
    return filteredEmployees.slice(start, start + limit);
  }, [filteredEmployees, currentPage, limit]);

  const { data: shifts = [] } = useQuery<Shift[]>({
    queryKey: ["shifts-list"],
    queryFn: async () => {
      return fetchJson<Shift[]>("/api/shifts");
    },
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["departments-list"],
    queryFn: async () => {
      try {
        return await fetchJson<Department[]>("/api/departments");
      } catch {
        return [];
      }
    },
  });

  // Fetch fingerprint registration status from ZK devices
  const { data: fingerprintStatus } = useQuery<{ registeredIds: number[]; deviceCount: number }>({
    queryKey: ["fingerprint-status"],
    queryFn: async () => {
      try {
        return await fetchJson<{ registeredIds: number[]; deviceCount: number }>("/api/fingerprint-status");
      } catch {
        return { registeredIds: [], deviceCount: 0 };
      }
    },
    staleTime: 30000, // cache for 30s
  });
  const registeredFingerprintIds = useMemo(
    () => new Set(fingerprintStatus?.registeredIds ?? []),
    [fingerprintStatus?.registeredIds]
  );

  const addForm = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      employeeId: "",
      name: "",
      nameAr: "",
      departmentId: undefined,
      position: "",
      phone: "",
      email: "",
      fingerprintId: null,
      shiftId: undefined,
    },
  });

  const editForm = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
  });

  const addMutation = useMutation({
    mutationFn: async (values: EmployeeFormValues) => {
      return fetchJson("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          departmentId: values.departmentId || null,
          shiftId: values.shiftId || null,
          fingerprintId: values.fingerprintId ?? null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setAddOpen(false);
      addForm.reset();
      toast({ title: t("employees.added") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: EmployeeFormValues }) => {
      return fetchJson(`/api/employees/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          departmentId: values.departmentId || null,
          shiftId: values.shiftId || null,
          fingerprintId: values.fingerprintId ?? null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setEditOpen(false);
      setEditingEmployee(null);
      toast({ title: t("employees.updated") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return fetchJson(`/api/employees/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleteId(null);
      toast({ title: t("employees.deleted") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: "Failed to delete employee", variant: "destructive" });
    },
  });

  const handleEdit = useCallback(
    (emp: Employee) => {
      setEditingEmployee(emp);
      editForm.reset({
        employeeId: emp.employeeId,
        name: emp.name,
        nameAr: emp.nameAr || "",
        departmentId: emp.departmentId || undefined,
        position: emp.position || "",
        phone: emp.phone || "",
        email: emp.email || "",
        fingerprintId: emp.fingerprintId,
        shiftId: emp.shiftId || undefined,
      });
      setEditOpen(true);
    },
    [editForm]
  );

  // Reset page when search/filter changes
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleDepartmentFilter = (v: string) => {
    setDepartmentFilter(v);
    setPage(1);
  };

  const handleStatusFilter = (v: string) => {
    setStatusFilter(v);
    setPage(1);
  };

  const handleOpenProfile = (empId: string) => {
    setProfileId(empId);
    setProfileOpen(true);
  };

  // Department select for forms
  const DepartmentSelect = ({ field, form }: { field: { onChange: (v: string) => void; value: string | undefined }; form: ReturnType<typeof useForm<EmployeeFormValues>> }) => (
    <Select onValueChange={field.onChange} value={field.value || undefined}>
      <FormControl>
        <SelectTrigger>
          <SelectValue placeholder={t("employees.selectDepartment")} />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {departments.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.nameAr ? `${d.name} / ${d.nameAr}` : d.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

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
              <CardTitle className="text-base">{t("employees.title")}</CardTitle>
              <CardDescription>{t("employees.subtitle")}</CardDescription>
            </div>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={() => setAddOpen(true)}>
                <UserPlus className="h-4 w-4" />
                {t("employees.add")}
              </Button>
              <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t("employees.addNew")}</DialogTitle>
                  <DialogDescription>{t("employees.addNewDesc")}</DialogDescription>
                </DialogHeader>
                <Form {...addForm}>
                  <form
                    onSubmit={addForm.handleSubmit((v) => addMutation.mutate(v))}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={addForm.control}
                        name="employeeId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("employees.empId")} *</FormLabel>
                            <FormControl>
                              <Input placeholder="EMP-001" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("employees.name")} *</FormLabel>
                            <FormControl>
                              <Input placeholder="Full name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={addForm.control}
                        name="nameAr"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("employees.nameAr")}</FormLabel>
                            <FormControl>
                              <Input placeholder="الاسم بالعربي" dir="rtl" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addForm.control}
                        name="departmentId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("employees.department")}</FormLabel>
                            <DepartmentSelect field={field} form={addForm} />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={addForm.control}
                        name="position"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("employees.position")}</FormLabel>
                            <FormControl>
                              <Input placeholder="Developer" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addForm.control}
                        name="shiftId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("employees.shift")}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || undefined}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={t("employees.selectShift")} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {shifts.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    <span className="flex items-center gap-2">
                                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                                      {s.name} ({s.startTime}-{s.endTime})
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={addForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("employees.phone")}</FormLabel>
                            <FormControl>
                              <Input placeholder="+966501001001" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("employees.email")}</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="email@company.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={addForm.control}
                      name="fingerprintId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("employees.fingerprintId")}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder={t("employees.autoAssigned")}
                              value={field.value ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                field.onChange(val ? Number(val) : null);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                        {t("employees.cancel")}
                      </Button>
                      <Button
                        type="submit"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        disabled={addMutation.isPending}
                      >
                        {addMutation.isPending ? t("employees.adding") : t("employees.add")}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("employees.searchById")}
                value={search}
                onChange={handleSearch}
                className="pl-9"
              />
            </div>
            <Select value={departmentFilter} onValueChange={handleDepartmentFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t("employees.department")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("employees.allDepartments")}</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.nameAr ? `${d.name} / ${d.nameAr}` : d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={handleStatusFilter}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue placeholder={t("employees.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("employees.all")}</SelectItem>
                <SelectItem value="true">{t("employees.active")}</SelectItem>
                <SelectItem value="false">{t("employees.inactive")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">{t("employees.empId")}</TableHead>
                  <TableHead>{t("employees.name")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("employees.nameAr")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("employees.department")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("employees.position")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("employees.shift")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("employees.fingerprintId")}</TableHead>
                  <TableHead>{t("employees.status")}</TableHead>
                  <TableHead className="w-24">{t("employees.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedEmployees.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {t("employees.noEmployees")}
                    </TableCell>
                  </TableRow>
                )}
                {paginatedEmployees.map((emp) => (
                  <TableRow
                    key={emp.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleOpenProfile(emp.id)}
                  >
                    <TableCell className="font-mono text-xs">{emp.employeeId}</TableCell>
                    <TableCell className="font-medium">{emp.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground" dir="rtl">
                      {emp.nameAr || "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="text-xs">
                        {emp.department?.name || t("employees.na")}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {emp.position || "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {emp.shift ? (
                        <span className="flex items-center gap-1.5 text-xs">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: emp.shift.color }} />
                          {emp.shift.name}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-xs">
                      <span className="flex items-center gap-1.5">
                        {emp.fingerprintId != null ? (
                          <>
                            {emp.fingerprintId}
                            {registeredFingerprintIds.has(emp.fingerprintId) ? (
                              <Fingerprint className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <Fingerprint className="h-3.5 w-3.5 text-muted-foreground/40" />
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-xs ${
                          emp.isActive
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {emp.isActive ? t("employees.active") : t("employees.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenProfile(emp.id)} title={t("employees.profile")}>
                          <Info className="h-3.5 w-3.5 text-emerald-600" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(emp)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(emp.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">
                {t("employees.showing")} {(currentPage - 1) * limit + 1}–
                {Math.min(currentPage * limit, totalFiltered)} {t("employees.of")} {totalFiltered}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employee Profile Dialog */}
      <EmployeeProfileDialog
        employeeId={profileId}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("employees.edit")}</DialogTitle>
            <DialogDescription>{t("employees.editDesc")}</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit((v) => {
                if (editingEmployee) editMutation.mutate({ id: editingEmployee.id, values: v });
              })}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="employeeId" render={({ field }) => (
                  <FormItem><FormLabel>{t("employees.empId")} *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>{t("employees.name")} *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="nameAr" render={({ field }) => (
                  <FormItem><FormLabel>{t("employees.nameAr")}</FormLabel><FormControl><Input dir="rtl" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="departmentId" render={({ field }) => (
                  <FormItem><FormLabel>{t("employees.department")}</FormLabel><DepartmentSelect field={field} form={editForm} /><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="position" render={({ field }) => (
                  <FormItem><FormLabel>{t("employees.position")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="shiftId" render={({ field }) => (
                  <FormItem><FormLabel>{t("employees.shift")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl><SelectTrigger><SelectValue placeholder={t("employees.selectShift")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {shifts.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</SelectItem>))}
                      </SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>{t("employees.phone")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>{t("employees.email")}</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={editForm.control} name="fingerprintId" render={({ field }) => (
                <FormItem><FormLabel>{t("employees.fingerprintId")}</FormLabel><FormControl>
                  <Input type="number" value={field.value ?? ""} onChange={(e) => { const val = e.target.value; field.onChange(val ? Number(val) : null); }} />
                </FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>{t("employees.cancel")}</Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={editMutation.isPending}>
                  {editMutation.isPending ? t("employees.saving") : t("employees.saveChanges")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("employees.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("employees.deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
