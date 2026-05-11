"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch, type Control } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Banknote,
  Plus,
  Pencil,
  Trash2,
  Play,
  CheckCircle2,
  FileText,
  Settings2,
  CalendarDays,
  Receipt,
  DollarSign,
  Loader2,
  Download,
  Eye,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";
import { useAppStore } from "@/store/app-store";

// ─── Helpers ───
function formatCurrency(amount: number, currency = "SAR"): string {
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function periodStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    draft: {
      label: "Draft",
      className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    },
    processing: {
      label: "Processing",
      className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    },
    completed: {
      label: "Completed",
      className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    },
    approved: {
      label: "Approved",
      className: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
    },
  };
  const info = map[status] || map.draft;
  return <Badge className={`text-xs ${info.className}`}>{info.label}</Badge>;
}

function payslipStatusBadge(status: string) {
  if (status === "paid") {
    return (
      <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        Paid
      </Badge>
    );
  }
  return (
    <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      Pending
    </Badge>
  );
}

// ─── Types ───
interface EmployeeBasic {
  id: string;
  employeeId: string;
  name: string;
  nameAr: string | null;
  department: string | null;
  position: string | null;
  isActive: boolean;
}

interface SalaryStructure {
  id: string;
  employeeId: string;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  foodAllowance: number;
  otherAllowances: number;
  overtimeRate: number;
  deductionPerLate: number;
  deductionPerAbsent: number;
  currency: string;
  effectiveDate: string;
  createdAt: string;
  updatedAt: string;
  employee: EmployeeBasic;
}

interface PayrollPeriod {
  id: string;
  name: string;
  month: number;
  year: number;
  startDate: string;
  endDate: string;
  status: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  processedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { paySlips: number };
}

interface PaySlipListItem {
  id: string;
  employeeId: string;
  payrollPeriodId: string;
  basicSalary: number;
  totalAllowances: number;
  totalDeductions: number;
  overtimePay: number;
  netSalary: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  overtimeHours: number;
  status: string;
  paidAt: string | null;
  createdAt: string;
  employee: EmployeeBasic;
  payrollPeriod: {
    id: string;
    name: string;
    month: number;
    year: number;
    status: string;
  };
}

interface PaySlipDetail {
  id: string;
  employeeId: string;
  payrollPeriodId: string;
  basicSalary: number;
  totalAllowances: number;
  totalDeductions: number;
  overtimePay: number;
  netSalary: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  overtimeHours: number;
  status: string;
  paidAt: string | null;
  createdAt: string;
  employee: EmployeeBasic & {
    salaryStructure: SalaryStructure | null;
    allowances: AllowanceItem[];
    deductions: DeductionItem[];
  };
  payrollPeriod: {
    id: string;
    name: string;
    month: number;
    year: number;
    startDate: string;
    endDate: string;
    status: string;
  };
}

interface AllowanceItem {
  id: string;
  employeeId: string;
  name: string;
  nameAr: string | null;
  amount: number;
  type: string;
  isRecurring: boolean;
  effectiveDate: string;
  endDate: string | null;
  createdAt: string;
  employee: EmployeeBasic;
}

interface DeductionItem {
  id: string;
  employeeId: string;
  name: string;
  nameAr: string | null;
  amount: number;
  type: string;
  isRecurring: boolean;
  effectiveDate: string;
  endDate: string | null;
  createdAt: string;
  employee: EmployeeBasic;
}

interface EmployeeOption {
  id: string;
  employeeId: string;
  name: string;
  department: string | null;
  position: string | null;
}

// ─── Zod Schemas ───
const salarySchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  basicSalary: z.coerce.number().min(0, "Must be 0 or more"),
  housingAllowance: z.coerce.number().min(0),
  transportAllowance: z.coerce.number().min(0),
  foodAllowance: z.coerce.number().min(0),
  otherAllowances: z.coerce.number().min(0),
  overtimeRate: z.coerce.number().min(0),
  deductionPerLate: z.coerce.number().min(0),
  deductionPerAbsent: z.coerce.number().min(0),
});

type SalaryFormValues = z.infer<typeof salarySchema>;

const periodSchema = z.object({
  month: z.coerce.number().min(1).max(12),
  year: z.coerce.number().min(2020).max(2099),
  name: z.string().optional().default(""),
});

type PeriodFormValues = z.infer<typeof periodSchema>;

const allowanceSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  name: z.string().min(1, "Name is required"),
  nameAr: z.string().optional().default(""),
  amount: z.coerce.number().min(0, "Amount must be positive"),
  type: z.string().default("fixed"),
  isRecurring: z.boolean().default(true),
  effectiveDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
});

type AllowanceFormValues = z.infer<typeof allowanceSchema>;

const deductionSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  name: z.string().min(1, "Name is required"),
  nameAr: z.string().optional().default(""),
  amount: z.coerce.number().min(0, "Amount must be positive"),
  type: z.string().default("fixed"),
  isRecurring: z.boolean().default(true),
  effectiveDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
});

type DeductionFormValues = z.infer<typeof deductionSchema>;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── Salary Gross Preview (uses useWatch to avoid React Compiler warning) ───

function SalaryGrossPreview({ control }: { control: Control<SalaryFormValues> }) {
  const basicSalary = useWatch({ control, name: "basicSalary" }) || 0;
  const housingAllowance = useWatch({ control, name: "housingAllowance" }) || 0;
  const transportAllowance = useWatch({ control, name: "transportAllowance" }) || 0;
  const foodAllowance = useWatch({ control, name: "foodAllowance" }) || 0;
  const otherAllowances = useWatch({ control, name: "otherAllowances" }) || 0;

  return (
    <div className="bg-muted/50 rounded-lg p-3 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Gross Monthly Salary</span>
        <span className="font-semibold text-emerald-600">
          {formatCurrency(basicSalary + housingAllowance + transportAllowance + foodAllowance + otherAllowances)}
        </span>
      </div>
    </div>
  );
}

// ─── Loans Tab Component ───
interface LoanItem {
  id: string;
  employeeId: string;
  type: string;
  amount: number;
  monthlyDeduction: number;
  remainingBalance: number;
  issueDate: string;
  status: string;
  notes: string | null;
  createdAt: string;
  employee: { id: string; employeeId: string; name: string; nameAr: string | null };
}

function LoansTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: loans = [], isLoading } = useQuery<LoanItem[]>({
    queryKey: ["loans"],
    queryFn: async () => {
      const res = await fetch("/api/payroll/loans");
      if (!res.ok) throw new Error("Failed to fetch loans");
      return res.json();
    },
  });

  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ["payroll-employees-loans"],
    queryFn: async () => {
      const res = await fetch("/api/employees?limit=100&isActive=true");
      if (!res.ok) return [];
      const d = await res.json();
      return d.employees || [];
    },
  });

  const loanSchema = z.object({
    employeeId: z.string().min(1, "Employee is required"),
    type: z.string().default("advance"),
    amount: z.coerce.number().min(1, "Amount must be positive"),
    monthlyDeduction: z.coerce.number().min(0).default(0),
    notes: z.string().optional().default(""),
  });

  type LoanFormValues = z.infer<typeof loanSchema>;

  const addForm = useForm<LoanFormValues>({
    resolver: zodResolver(loanSchema),
    defaultValues: { employeeId: "", type: "advance", amount: 0, monthlyDeduction: 0, notes: "" },
  });

  const addMutation = useMutation({
    mutationFn: async (values: LoanFormValues) => {
      const res = await fetch("/api/payroll/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create loan");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      setAddOpen(false);
      addForm.reset();
      toast({ title: t("loans.loanCreated") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/payroll/loans/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete loan");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      setDeleteId(null);
      toast({ title: t("loans.loanDeleted") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: "Failed to delete loan", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/payroll/loans/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update loan status");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      toast({ title: variables.status === "completed" ? t("loans.loanCompleted") : t("loans.loanCancelled") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: "Failed to update loan", variant: "destructive" });
    },
  });

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      completed: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
      cancelled: "bg-muted text-muted-foreground",
    };
    return <Badge className={`text-xs ${map[status] || map.active}`}>{t(`loans.${status}`)}</Badge>;
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("loans.title")}</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("loans.add")}
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("loans.add")}</DialogTitle>
              <DialogDescription>{t("loans.addDesc")}</DialogDescription>
            </DialogHeader>
            <Form {...addForm}>
              <form onSubmit={addForm.handleSubmit((v) => addMutation.mutate(v))} className="space-y-4">
                <FormField control={addForm.control} name="employeeId" render={({ field }) => (
                  <FormItem><FormLabel>{t("loans.employee")} *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder={t("loans.selectEmployee")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {employees.map((e) => (<SelectItem key={e.id} value={e.id}>{e.name} ({e.employeeId})</SelectItem>))}
                      </SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField control={addForm.control} name="type" render={({ field }) => (
                  <FormItem><FormLabel>{t("loans.type")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="advance">{t("loans.advance")}</SelectItem>
                        <SelectItem value="loan">{t("loans.loan")}</SelectItem>
                      </SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={addForm.control} name="amount" render={({ field }) => (
                    <FormItem><FormLabel>{t("loans.amount")} *</FormLabel><FormControl><Input type="number" min={1} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={addForm.control} name="monthlyDeduction" render={({ field }) => (
                    <FormItem><FormLabel>{t("loans.monthlyDeduction")}</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={addForm.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>{t("loans.notes")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button>
                  <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={addMutation.isPending}>
                    {addMutation.isPending ? t("loans.creating") : t("loans.create")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {loans.length === 0 ? (
        <Card className="p-8 text-center">
          <Banknote className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-1">{t("loans.noLoans")}</h3>
          <p className="text-sm text-muted-foreground">{t("loans.noLoansDesc")}</p>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("loans.employee")}</TableHead>
                    <TableHead>{t("loans.type")}</TableHead>
                    <TableHead className="text-right">{t("loans.amount")}</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">{t("loans.monthlyDeduction")}</TableHead>
                    <TableHead className="text-right hidden md:table-cell">{t("loans.remainingBalance")}</TableHead>
                    <TableHead>{t("loans.status")}</TableHead>
                    <TableHead className="w-24">{t("loans.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loans.map((loan) => (
                    <TableRow key={loan.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{loan.employee.name}</p>
                          <p className="text-[10px] text-muted-foreground">{loan.employee.employeeId}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {loan.type === "advance" ? t("loans.advance") : t("loans.loan")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatCurrency(loan.amount)}
                      </TableCell>
                      <TableCell className="text-right text-sm hidden sm:table-cell">
                        {formatCurrency(loan.monthlyDeduction)}
                      </TableCell>
                      <TableCell className="text-right text-sm hidden md:table-cell">
                        {formatCurrency(loan.remainingBalance)}
                      </TableCell>
                      <TableCell>{statusBadge(loan.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {loan.status === "active" && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600" onClick={() => updateStatusMutation.mutate({ id: loan.id, status: "completed" })}>
                                {t("loans.markCompleted")}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => updateStatusMutation.mutate({ id: loan.id, status: "cancelled" })}>
                                {t("loans.markCancelled")}
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(loan.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("loans.deleteLoan")}</AlertDialogTitle>
            <AlertDialogDescription>{t("loans.deleteLoanDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main Component ───
export function PayrollView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState("salary-setup");

  // ─── Queries: shared ───
  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ["payroll-employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees?limit=100&isActive=true");
      if (!res.ok) return [];
      const data = await res.json();
      return data.employees || [];
    },
  });

  // ─── Queries: salary structures ───
  const { data: salaryStructures = [], isLoading: salaryLoading } = useQuery<SalaryStructure[]>({
    queryKey: ["salary-structures"],
    queryFn: async () => {
      const res = await fetch("/api/payroll/salary-structures");
      if (!res.ok) throw new Error("Failed to fetch salary structures");
      return res.json();
    },
  });

  // ─── Queries: payroll periods ───
  const { data: periods = [], isLoading: periodsLoading } = useQuery<PayrollPeriod[]>({
    queryKey: ["payroll-periods"],
    queryFn: async () => {
      const res = await fetch("/api/payroll/periods");
      if (!res.ok) throw new Error("Failed to fetch payroll periods");
      return res.json();
    },
  });

  // ─── Queries: payslips ───
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("all");
  const { data: payslipsData, isLoading: payslipsLoading } = useQuery<{
    payslips: PaySlipListItem[];
    total: number;
  }>({
    queryKey: ["payslips", selectedPeriodId],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (selectedPeriodId && selectedPeriodId !== "all") {
        params.set("payrollPeriodId", selectedPeriodId);
      }
      const res = await fetch(`/api/payroll/payslips?${params}`);
      if (!res.ok) throw new Error("Failed to fetch payslips");
      return res.json();
    },
  });

  // ─── Queries: allowances ───
  const [allowanceEmpFilter, setAllowanceEmpFilter] = useState<string>("all");
  const { data: allowances = [], isLoading: allowancesLoading } = useQuery<AllowanceItem[]>({
    queryKey: ["allowances", allowanceEmpFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (allowanceEmpFilter && allowanceEmpFilter !== "all") {
        params.set("employeeId", allowanceEmpFilter);
      }
      const res = await fetch(`/api/payroll/allowances?${params}`);
      if (!res.ok) throw new Error("Failed to fetch allowances");
      return res.json();
    },
  });

  // ─── Queries: deductions ───
  const [deductionEmpFilter, setDeductionEmpFilter] = useState<string>("all");
  const { data: deductions = [], isLoading: deductionsLoading } = useQuery<DeductionItem[]>({
    queryKey: ["deductions", deductionEmpFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (deductionEmpFilter && deductionEmpFilter !== "all") {
        params.set("employeeId", deductionEmpFilter);
      }
      const res = await fetch(`/api/payroll/deductions?${params}`);
      if (!res.ok) throw new Error("Failed to fetch deductions");
      return res.json();
    },
  });

  // ─── Dialog states ───
  const [salaryDialogOpen, setSalaryDialogOpen] = useState(false);
  const [editingSalary, setEditingSalary] = useState<SalaryStructure | null>(null);
  const [deleteSalaryEmpId, setDeleteSalaryEmpId] = useState<string | null>(null);

  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const [deletePeriodId, setDeletePeriodId] = useState<string | null>(null);
  const [processingPeriodId, setProcessingPeriodId] = useState<string | null>(null);

  const [payslipDetailOpen, setPayslipDetailOpen] = useState(false);
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(null);
  const { data: payslipDetail, isLoading: payslipDetailLoading } = useQuery<PaySlipDetail>({
    queryKey: ["payslip-detail", selectedPayslipId],
    queryFn: async () => {
      if (!selectedPayslipId) return null;
      const res = await fetch(`/api/payroll/payslips/${selectedPayslipId}`);
      if (!res.ok) throw new Error("Failed to fetch payslip");
      return res.json();
    },
    enabled: !!selectedPayslipId,
  });

  const [allowanceDialogOpen, setAllowanceDialogOpen] = useState(false);
  const [deleteAllowanceId, setDeleteAllowanceId] = useState<string | null>(null);

  const [deductionDialogOpen, setDeductionDialogOpen] = useState(false);
  const [deleteDeductionId, setDeleteDeductionId] = useState<string | null>(null);

  // ─── Forms ───
  const salaryForm = useForm<SalaryFormValues>({
    resolver: zodResolver(salarySchema),
    defaultValues: {
      employeeId: "",
      basicSalary: 0,
      housingAllowance: 0,
      transportAllowance: 0,
      foodAllowance: 0,
      otherAllowances: 0,
      overtimeRate: 0,
      deductionPerLate: 0,
      deductionPerAbsent: 0,
    },
  });

  const now = new Date();
  const periodForm = useForm<PeriodFormValues>({
    resolver: zodResolver(periodSchema),
    defaultValues: {
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      name: "",
    },
  });

  const allowanceForm = useForm<AllowanceFormValues>({
    resolver: zodResolver(allowanceSchema),
    defaultValues: {
      employeeId: "",
      name: "",
      nameAr: "",
      amount: 0,
      type: "fixed",
      isRecurring: true,
      effectiveDate: "",
      endDate: "",
    },
  });

  const deductionForm = useForm<DeductionFormValues>({
    resolver: zodResolver(deductionSchema),
    defaultValues: {
      employeeId: "",
      name: "",
      nameAr: "",
      amount: 0,
      type: "fixed",
      isRecurring: true,
      effectiveDate: "",
      endDate: "",
    },
  });

  // ─── Salary Mutations ───
  const salaryMutation = useMutation({
    mutationFn: async (values: SalaryFormValues) => {
      const res = await fetch("/api/payroll/salary-structures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save salary structure");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salary-structures"] });
      setSalaryDialogOpen(false);
      setEditingSalary(null);
      salaryForm.reset();
      toast({ title: "Salary structure saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSalaryMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const res = await fetch(`/api/payroll/salary-structures/${employeeId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete salary structure");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salary-structures"] });
      setDeleteSalaryEmpId(null);
      toast({ title: "Salary structure deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete salary structure", variant: "destructive" });
    },
  });

  const bulkSetDefaultMutation = useMutation({
    mutationFn: async () => {
      const employeesWithoutSalary = employees.filter(
        (emp) => !salaryStructures.some((ss) => ss.employeeId === emp.id)
      );
      const results = await Promise.allSettled(
        employeesWithoutSalary.map((emp) => {
          const pos = emp.position?.toLowerCase() || "";
          let basicSalary = 6000;
          let housingAllowance = 1500;
          let transportAllowance = 500;
          let foodAllowance = 250;

          if (pos.includes("manager")) {
            basicSalary = 12000;
            housingAllowance = 3000;
            transportAllowance = 1000;
            foodAllowance = 500;
          } else if (pos.includes("senior")) {
            basicSalary = 10000;
            housingAllowance = 2500;
            transportAllowance = 800;
            foodAllowance = 400;
          } else if (pos.includes("specialist") || pos.includes("analyst") || pos.includes("accountant")) {
            basicSalary = 8000;
            housingAllowance = 2000;
            transportAllowance = 600;
            foodAllowance = 300;
          }

          const overtimeRate = basicSalary / 30 / 8;
          const deductionPerLate = basicSalary / 30 / 8 * 0.5;
          const deductionPerAbsent = basicSalary / 30;

          return fetch("/api/payroll/salary-structures", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              employeeId: emp.id,
              basicSalary,
              housingAllowance,
              transportAllowance,
              foodAllowance,
              otherAllowances: 0,
              overtimeRate: Math.round(overtimeRate * 100) / 100,
              deductionPerLate: Math.round(deductionPerLate * 100) / 100,
              deductionPerAbsent: Math.round(deductionPerAbsent * 100) / 100,
            }),
          });
        })
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        throw new Error(`${failed} employee(s) failed`);
      }
      return results.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["salary-structures"] });
      toast({ title: `Default salary set for ${count} employee(s)` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // ─── Period Mutations ───
  const createPeriodMutation = useMutation({
    mutationFn: async (values: PeriodFormValues) => {
      const res = await fetch("/api/payroll/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create payroll period");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
      setPeriodDialogOpen(false);
      periodForm.reset({ month: now.getMonth() + 1, year: now.getFullYear(), name: "" });
      toast({ title: "Payroll period created" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const processPayrollMutation = useMutation({
    mutationFn: async (periodId: string) => {
      setProcessingPeriodId(periodId);
      const res = await fetch("/api/payroll/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payrollPeriodId: periodId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to process payroll");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
      queryClient.invalidateQueries({ queryKey: ["payslips"] });
      setProcessingPeriodId(null);
      toast({
        title: "Payroll processed",
        description: `${data.summary?.processedCount || 0} payslips generated`,
      });
    },
    onError: (error: Error) => {
      setProcessingPeriodId(null);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const approvePeriodMutation = useMutation({
    mutationFn: async (periodId: string) => {
      const res = await fetch(`/api/payroll/periods/${periodId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to approve payroll period");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
      toast({ title: "Payroll period approved" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePeriodMutation = useMutation({
    mutationFn: async (periodId: string) => {
      const res = await fetch(`/api/payroll/periods/${periodId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete payroll period");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
      setDeletePeriodId(null);
      toast({ title: "Payroll period deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // ─── Payslip Mutations ───
  const markPaidMutation = useMutation({
    mutationFn: async (payslipId: string) => {
      const res = await fetch(`/api/payroll/payslips/${payslipId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      });
      if (!res.ok) throw new Error("Failed to mark as paid");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payslips"] });
      queryClient.invalidateQueries({ queryKey: ["payslip-detail"] });
      setPayslipDetailOpen(false);
      setSelectedPayslipId(null);
      toast({ title: "Pay slip marked as paid" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to mark as paid", variant: "destructive" });
    },
  });

  // ─── Allowance Mutations ───
  const createAllowanceMutation = useMutation({
    mutationFn: async (values: AllowanceFormValues) => {
      const res = await fetch("/api/payroll/allowances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          effectiveDate: values.effectiveDate || undefined,
          endDate: values.endDate || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create allowance");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allowances"] });
      setAllowanceDialogOpen(false);
      allowanceForm.reset();
      toast({ title: "Allowance created" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteAllowanceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/payroll/allowances/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete allowance");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allowances"] });
      setDeleteAllowanceId(null);
      toast({ title: "Allowance deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete allowance", variant: "destructive" });
    },
  });

  // ─── Deduction Mutations ───
  const createDeductionMutation = useMutation({
    mutationFn: async (values: DeductionFormValues) => {
      const res = await fetch("/api/payroll/deductions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          effectiveDate: values.effectiveDate || undefined,
          endDate: values.endDate || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create deduction");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deductions"] });
      setDeductionDialogOpen(false);
      deductionForm.reset();
      toast({ title: "Deduction created" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteDeductionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/payroll/deductions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete deduction");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deductions"] });
      setDeleteDeductionId(null);
      toast({ title: "Deduction deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete deduction", variant: "destructive" });
    },
  });

  // ─── Handlers ───
  const handleEditSalary = (ss: SalaryStructure) => {
    setEditingSalary(ss);
    salaryForm.reset({
      employeeId: ss.employeeId,
      basicSalary: ss.basicSalary,
      housingAllowance: ss.housingAllowance,
      transportAllowance: ss.transportAllowance,
      foodAllowance: ss.foodAllowance,
      otherAllowances: ss.otherAllowances,
      overtimeRate: ss.overtimeRate,
      deductionPerLate: ss.deductionPerLate,
      deductionPerAbsent: ss.deductionPerAbsent,
    });
    setSalaryDialogOpen(true);
  };

  const handleSetSalary = (emp: EmployeeOption) => {
    setEditingSalary(null);
    salaryForm.reset({
      employeeId: emp.id,
      basicSalary: 0,
      housingAllowance: 0,
      transportAllowance: 0,
      foodAllowance: 0,
      otherAllowances: 0,
      overtimeRate: 0,
      deductionPerLate: 0,
      deductionPerAbsent: 0,
    });
    setSalaryDialogOpen(true);
  };

  const openPayslipDetail = (payslipId: string) => {
    setSelectedPayslipId(payslipId);
    setPayslipDetailOpen(true);
  };

  // Compute employees without salary structure
  const employeesWithoutSalary = employees.filter(
    (emp) => !salaryStructures.some((ss) => ss.employeeId === emp.id)
  );

  // ─── Loading Skeleton ───
  if (salaryLoading && activeSubTab === "salary-setup") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Banknote className="h-5 w-5 text-emerald-600" />
        <h1 className="text-xl font-bold">{t("payroll.title")}</h1>
      </div>

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="salary-setup" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            {t("payroll.salarySetup")}
          </TabsTrigger>
          <TabsTrigger value="payroll-runs" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {t("payroll.payrollRuns")}
          </TabsTrigger>
          <TabsTrigger value="pay-slips" className="gap-1.5">
            <Receipt className="h-3.5 w-3.5" />
            {t("payroll.paySlips")}
          </TabsTrigger>
          <TabsTrigger value="allowances-deductions" className="gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />
            {t("payroll.allowancesDeductions")}
          </TabsTrigger>
          <TabsTrigger value="loans" className="gap-1.5">
            <Banknote className="h-3.5 w-3.5" />
            {t("payroll.loans")}
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* SUB-TAB 1: SALARY SETUP                                   */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="salary-setup" className="space-y-4 mt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Salary Structures</h2>
              <p className="text-sm text-muted-foreground">
                {salaryStructures.length} of {employees.length} employees configured
              </p>
            </div>
            <div className="flex items-center gap-2">
              {employeesWithoutSalary.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={bulkSetDefaultMutation.isPending}
                  onClick={() => bulkSetDefaultMutation.mutate()}
                >
                  {bulkSetDefaultMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Settings2 className="h-3.5 w-3.5" />
                  )}
                  Set Default Salary ({employeesWithoutSalary.length})
                </Button>
              )}
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                onClick={() => {
                  setEditingSalary(null);
                  salaryForm.reset({
                    employeeId: "",
                    basicSalary: 0,
                    housingAllowance: 0,
                    transportAllowance: 0,
                    foodAllowance: 0,
                    otherAllowances: 0,
                    overtimeRate: 0,
                    deductionPerLate: 0,
                    deductionPerAbsent: 0,
                  });
                  setSalaryDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Set Salary
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="hidden sm:table-cell">Department</TableHead>
                      <TableHead className="text-right">Basic</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Housing</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Transport</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Food</TableHead>
                      <TableHead className="text-right hidden xl:table-cell">Other</TableHead>
                      <TableHead className="text-right font-semibold">Gross</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No employees found. Seed data first.
                        </TableCell>
                      </TableRow>
                    )}
                    {employees.map((emp) => {
                      const ss = salaryStructures.find((s) => s.employeeId === emp.id);
                      const gross = ss
                        ? ss.basicSalary +
                          ss.housingAllowance +
                          ss.transportAllowance +
                          ss.foodAllowance +
                          ss.otherAllowances
                        : 0;
                      return (
                        <TableRow key={emp.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{emp.name}</p>
                              <p className="text-[10px] text-muted-foreground">{emp.employeeId}</p>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline" className="text-xs">
                              {emp.department || "N/A"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {ss ? formatCurrency(ss.basicSalary) : <Badge variant="secondary" className="text-xs">Not Set</Badge>}
                          </TableCell>
                          <TableCell className="text-right text-sm hidden md:table-cell">
                            {ss ? formatCurrency(ss.housingAllowance) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm hidden lg:table-cell">
                            {ss ? formatCurrency(ss.transportAllowance) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm hidden lg:table-cell">
                            {ss ? formatCurrency(ss.foodAllowance) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm hidden xl:table-cell">
                            {ss ? formatCurrency(ss.otherAllowances) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-sm">
                            {ss ? (
                              <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(gross)}</span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {ss ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleEditSalary(ss)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive"
                                    onClick={() => setDeleteSalaryEmpId(ss.employeeId)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs gap-1"
                                  onClick={() => handleSetSalary(emp)}
                                >
                                  <Plus className="h-3 w-3" />
                                  Set
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* SUB-TAB 2: PAYROLL RUNS                                   */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="payroll-runs" className="space-y-4 mt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Payroll Periods</h2>
              <p className="text-sm text-muted-foreground">
                Create and process payroll for each month
              </p>
            </div>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              onClick={() => setPeriodDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Create Payroll Period
            </Button>
          </div>

          {periodsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-6 w-32 mb-3" />
                    <Skeleton className="h-4 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : periods.length === 0 ? (
            <Card className="p-8 text-center">
              <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">No payroll periods</h3>
              <p className="text-sm text-muted-foreground">
                Create a payroll period to begin processing salaries
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {periods.map((period) => (
                <Card key={period.id} className="relative overflow-hidden">
                  <div
                    className={`h-1.5 ${
                      period.status === "approved"
                        ? "bg-teal-500"
                        : period.status === "completed"
                        ? "bg-emerald-500"
                        : period.status === "processing"
                        ? "bg-amber-500"
                        : "bg-gray-300"
                    }`}
                  />
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-sm">{period.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          {periodStatusBadge(period.status)}
                          <span className="text-[10px] text-muted-foreground">
                            {period._count.paySlips} payslip(s)
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Gross</span>
                        <span className="font-medium">{formatCurrency(period.totalGross)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deductions</span>
                        <span className="font-medium text-destructive">
                          {period.totalDeductions > 0 ? `-${formatCurrency(period.totalDeductions)}` : formatCurrency(0)}
                        </span>
                      </div>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="font-semibold">Total Net</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(period.totalNet)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mt-3">
                      {period.status === "draft" && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 gap-1 flex-1"
                          disabled={processingPeriodId === period.id}
                          onClick={() => processPayrollMutation.mutate(period.id)}
                        >
                          {processingPeriodId === period.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                          {processingPeriodId === period.id ? "Processing..." : "Process"}
                        </Button>
                      )}
                      {period.status === "completed" && (
                        <Button
                          size="sm"
                          className="bg-teal-600 hover:bg-teal-700 gap-1 flex-1"
                          onClick={() => approvePeriodMutation.mutate(period.id)}
                          disabled={approvePeriodMutation.isPending}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                      )}
                      {period.status === "draft" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeletePeriodId(period.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* SUB-TAB 3: PAY SLIPS                                      */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="pay-slips" className="space-y-4 mt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Pay Slips</h2>
              <p className="text-sm text-muted-foreground">
                View individual pay slips for each period
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Periods</SelectItem>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
            </div>
          </div>

          {payslipsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="hidden sm:table-cell">Department</TableHead>
                        <TableHead className="text-right">Basic</TableHead>
                        <TableHead className="text-right hidden md:table-cell">Allowances</TableHead>
                        <TableHead className="text-right hidden md:table-cell">Overtime</TableHead>
                        <TableHead className="text-right hidden lg:table-cell">Deductions</TableHead>
                        <TableHead className="text-right font-semibold">Net Salary</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-16">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(!payslipsData?.payslips || payslipsData.payslips.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            No pay slips found. Process a payroll period first.
                          </TableCell>
                        </TableRow>
                      )}
                      {payslipsData?.payslips.map((ps) => (
                        <TableRow
                          key={ps.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => openPayslipDetail(ps.id)}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{ps.employee.name}</p>
                              <p className="text-[10px] text-muted-foreground">{ps.employee.employeeId}</p>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline" className="text-xs">
                              {ps.employee.department || "N/A"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatCurrency(ps.basicSalary)}
                          </TableCell>
                          <TableCell className="text-right text-sm hidden md:table-cell">
                            {formatCurrency(ps.totalAllowances)}
                          </TableCell>
                          <TableCell className="text-right text-sm hidden md:table-cell">
                            {formatCurrency(ps.overtimePay)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-destructive hidden lg:table-cell">
                            {formatCurrency(ps.totalDeductions)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-sm">
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(ps.netSalary)}
                            </span>
                          </TableCell>
                          <TableCell>{payslipStatusBadge(ps.status)}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                openPayslipDetail(ps.id);
                              }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* SUB-TAB 4: ALLOWANCES & DEDUCTIONS                        */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="allowances-deductions" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ─── Allowances Section ─── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-emerald-600" />
                      Allowances
                    </CardTitle>
                    <CardDescription>Custom recurring or one-time allowances</CardDescription>
                  </div>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 gap-1"
                    onClick={() => {
                      allowanceForm.reset();
                      setAllowanceDialogOpen(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
                <Select value={allowanceEmpFilter} onValueChange={setAllowanceEmpFilter}>
                  <SelectTrigger className="h-8 text-xs mt-2">
                    <SelectValue placeholder="Filter by employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent className="p-0">
                {allowancesLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : allowances.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No allowances configured
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="w-16">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allowances.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="text-xs">
                              <p className="font-medium">{a.employee.name}</p>
                            </TableCell>
                            <TableCell className="text-sm">
                              <div>
                                <p>{a.name}</p>
                                {a.isRecurring && (
                                  <span className="text-[10px] text-muted-foreground">Recurring</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {a.type === "percentage"
                                ? `${a.amount}%`
                                : formatCurrency(a.amount)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">
                                {a.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => setDeleteAllowanceId(a.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ─── Deductions Section ─── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4 text-red-500" />
                      Deductions
                    </CardTitle>
                    <CardDescription>Custom recurring or one-time deductions</CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1"
                    onClick={() => {
                      deductionForm.reset();
                      setDeductionDialogOpen(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
                <Select value={deductionEmpFilter} onValueChange={setDeductionEmpFilter}>
                  <SelectTrigger className="h-8 text-xs mt-2">
                    <SelectValue placeholder="Filter by employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent className="p-0">
                {deductionsLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : deductions.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No deductions configured
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="w-16">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deductions.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="text-xs">
                              <p className="font-medium">{d.employee.name}</p>
                            </TableCell>
                            <TableCell className="text-sm">
                              <div>
                                <p>{d.name}</p>
                                {d.isRecurring && (
                                  <span className="text-[10px] text-muted-foreground">Recurring</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-sm text-destructive">
                              {d.type === "percentage"
                                ? `${d.amount}%`
                                : formatCurrency(d.amount)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">
                                {d.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => setDeleteDeductionId(d.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
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
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* SUB-TAB 5: LOANS / ADVANCES                               */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="loans" className="space-y-4 mt-4">
          <LoansTab />
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DIALOG: Salary Structure                                   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Dialog open={salaryDialogOpen} onOpenChange={setSalaryDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSalary ? "Edit Salary Structure" : "Set Salary Structure"}
            </DialogTitle>
            <DialogDescription>
              Configure salary components for the employee
            </DialogDescription>
          </DialogHeader>
          <Form {...salaryForm}>
            <form
              onSubmit={salaryForm.handleSubmit((v) => salaryMutation.mutate(v))}
              className="space-y-4"
            >
              <FormField
                control={salaryForm.control}
                name="employeeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!!editingSalary}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name} ({e.employeeId})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={salaryForm.control}
                  name="basicSalary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Basic Salary</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={salaryForm.control}
                  name="housingAllowance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Housing Allowance</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={salaryForm.control}
                  name="transportAllowance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transport Allowance</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={salaryForm.control}
                  name="foodAllowance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Food Allowance</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={salaryForm.control}
                  name="otherAllowances"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Other Allowances</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={salaryForm.control}
                  name="overtimeRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Overtime Rate (/hr)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={salaryForm.control}
                  name="deductionPerLate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Deduction / Late</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={salaryForm.control}
                  name="deductionPerAbsent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Deduction / Absent</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Gross salary preview */}
              <SalaryGrossPreview control={salaryForm.control} />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSalaryDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={salaryMutation.isPending}
                >
                  {salaryMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DIALOG: Create Payroll Period                              */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Dialog open={periodDialogOpen} onOpenChange={setPeriodDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Payroll Period</DialogTitle>
            <DialogDescription>
              Select the month and year for the payroll period
            </DialogDescription>
          </DialogHeader>
          <Form {...periodForm}>
            <form
              onSubmit={periodForm.handleSubmit((v) => createPeriodMutation.mutate(v))}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={periodForm.control}
                  name="month"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Month *</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(parseInt(v))}
                        value={String(field.value)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select month" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MONTH_NAMES.map((m, i) => (
                            <SelectItem key={i} value={String(i + 1)}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={periodForm.control}
                  name="year"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Year *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={2020}
                          max={2099}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : 2025)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={periodForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period Name (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Auto-generated from month/year" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPeriodDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={createPeriodMutation.isPending}
                >
                  {createPeriodMutation.isPending ? "Creating..." : "Create Period"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DIALOG: Pay Slip Detail                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Dialog open={payslipDetailOpen} onOpenChange={setPayslipDetailOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-600" />
              Pay Slip Detail
            </DialogTitle>
          </DialogHeader>
          {payslipDetailLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : payslipDetail ? (
            <div className="space-y-4">
              {/* Employee Info */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">{payslipDetail.employee.name}</span>
                  <span className="text-muted-foreground">{payslipDetail.employee.employeeId}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{payslipDetail.employee.department || "N/A"}</span>
                  <span>{payslipDetail.payrollPeriod.name}</span>
                </div>
              </div>

              {/* Attendance Summary */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Attendance Summary</h4>
                <div className="grid grid-cols-5 gap-2 text-center">
                  <div className="bg-muted/50 rounded p-2">
                    <p className="text-lg font-bold">{payslipDetail.workingDays}</p>
                    <p className="text-[10px] text-muted-foreground">Working</p>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded p-2">
                    <p className="text-lg font-bold text-emerald-600">{payslipDetail.presentDays}</p>
                    <p className="text-[10px] text-muted-foreground">Present</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded p-2">
                    <p className="text-lg font-bold text-destructive">{payslipDetail.absentDays}</p>
                    <p className="text-[10px] text-muted-foreground">Absent</p>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                    <p className="text-lg font-bold text-amber-600">{payslipDetail.lateDays}</p>
                    <p className="text-[10px] text-muted-foreground">Late</p>
                  </div>
                  <div className="bg-teal-50 dark:bg-teal-900/20 rounded p-2">
                    <p className="text-lg font-bold text-teal-600">{payslipDetail.overtimeHours}</p>
                    <p className="text-[10px] text-muted-foreground">OT Hrs</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Salary Breakdown */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Earnings</h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span>Basic Salary</span>
                    <span>{formatCurrency(payslipDetail.basicSalary)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Allowances</span>
                    <span>{formatCurrency(payslipDetail.totalAllowances)}</span>
                  </div>
                  {payslipDetail.overtimePay > 0 && (
                    <div className="flex justify-between">
                      <span>Overtime Pay</span>
                      <span>{formatCurrency(payslipDetail.overtimePay)}</span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Deductions */}
              <div>
                <h4 className="text-sm font-semibold mb-2 text-destructive">Deductions</h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-destructive">
                    <span>Total Deductions</span>
                    <span>{formatCurrency(payslipDetail.totalDeductions)}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Net Salary */}
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold">Net Salary</span>
                  <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(payslipDetail.netSalary)}
                  </span>
                </div>
              </div>

              {/* Status & Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  {payslipStatusBadge(payslipDetail.status)}
                </div>
                {payslipDetail.status === "pending" && (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                    size="sm"
                    disabled={markPaidMutation.isPending}
                    onClick={() => markPaidMutation.mutate(payslipDetail.id)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Mark as Paid
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="py-4 text-center text-muted-foreground text-sm">
              No payslip data available
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DIALOG: Add Allowance                                      */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Dialog open={allowanceDialogOpen} onOpenChange={setAllowanceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Allowance</DialogTitle>
            <DialogDescription>Add a custom allowance for an employee</DialogDescription>
          </DialogHeader>
          <Form {...allowanceForm}>
            <form
              onSubmit={allowanceForm.handleSubmit((v) => createAllowanceMutation.mutate(v))}
              className="space-y-4"
            >
              <FormField
                control={allowanceForm.control}
                name="employeeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name} ({e.employeeId})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={allowanceForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Performance Bonus" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={allowanceForm.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={allowanceForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="fixed">Fixed (SAR)</SelectItem>
                          <SelectItem value="percentage">Percentage (%)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={allowanceForm.control}
                  name="isRecurring"
                  render={({ field }) => (
                    <FormItem className="flex items-end gap-2 pb-2">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="h-4 w-4 rounded"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Recurring</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAllowanceDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={createAllowanceMutation.isPending}
                >
                  {createAllowanceMutation.isPending ? "Creating..." : "Add Allowance"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DIALOG: Add Deduction                                      */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Dialog open={deductionDialogOpen} onOpenChange={setDeductionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Deduction</DialogTitle>
            <DialogDescription>Add a custom deduction for an employee</DialogDescription>
          </DialogHeader>
          <Form {...deductionForm}>
            <form
              onSubmit={deductionForm.handleSubmit((v) => createDeductionMutation.mutate(v))}
              className="space-y-4"
            >
              <FormField
                control={deductionForm.control}
                name="employeeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name} ({e.employeeId})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={deductionForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Loan Repayment" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={deductionForm.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={deductionForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="fixed">Fixed (SAR)</SelectItem>
                          <SelectItem value="percentage">Percentage (%)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={deductionForm.control}
                  name="isRecurring"
                  render={({ field }) => (
                    <FormItem className="flex items-end gap-2 pb-2">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="h-4 w-4 rounded"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Recurring</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeductionDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={createDeductionMutation.isPending}
                >
                  {createDeductionMutation.isPending ? "Creating..." : "Add Deduction"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ALERT: Delete Salary Structure                            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteSalaryEmpId} onOpenChange={() => setDeleteSalaryEmpId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Salary Structure</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the salary structure for this employee. Pay slips already
              generated will not be affected. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteSalaryEmpId) deleteSalaryMutation.mutate(deleteSalaryEmpId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ALERT: Delete Payroll Period                               */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!deletePeriodId} onOpenChange={() => setDeletePeriodId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payroll Period</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the payroll period and all associated pay slips. Only draft
              periods can be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletePeriodId) deletePeriodMutation.mutate(deletePeriodId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ALERT: Delete Allowance                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteAllowanceId} onOpenChange={() => setDeleteAllowanceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Allowance</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this allowance from the employee. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteAllowanceId) deleteAllowanceMutation.mutate(deleteAllowanceId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ALERT: Delete Deduction                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteDeductionId} onOpenChange={() => setDeleteDeductionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deduction</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this deduction from the employee. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteDeductionId) deleteDeductionMutation.mutate(deleteDeductionId);
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
