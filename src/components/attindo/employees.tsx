"use client";

import React, { useState, useCallback } from "react";
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

const employeeSchema = z.object({
  employeeId: z.string().min(1, "Employee ID is required"),
  name: z.string().min(1, "Name is required"),
  nameAr: z.string().optional().default(""),
  departmentId: z.string().optional().default(""),
  position: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  email: z.string().optional().default(""),
  fingerprintId: z.coerce.number().optional().nullable(),
  shiftId: z.string().optional().default(""),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

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
  const limit = 20;

  const { data, isLoading } = useQuery<EmployeesResponse>({
    queryKey: ["employees", page, search, departmentFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) params.set("search", search);
      if (departmentFilter && departmentFilter !== "all")
        params.set("departmentId", departmentFilter);
      if (statusFilter && statusFilter !== "all")
        params.set("isActive", statusFilter);
      const res = await fetch(`/api/employees?${params}`);
      if (!res.ok) throw new Error("Failed to fetch employees");
      return res.json();
    },
  });

  const { data: shifts = [] } = useQuery<Shift[]>({
    queryKey: ["shifts-list"],
    queryFn: async () => {
      const res = await fetch("/api/shifts");
      if (!res.ok) throw new Error("Failed to fetch shifts");
      return res.json();
    },
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["departments-list"],
    queryFn: async () => {
      const res = await fetch("/api/departments");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const addForm = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      employeeId: "",
      name: "",
      nameAr: "",
      departmentId: "",
      position: "",
      phone: "",
      email: "",
      fingerprintId: null,
      shiftId: "",
    },
  });

  const editForm = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
  });

  const addMutation = useMutation({
    mutationFn: async (values: EmployeeFormValues) => {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          departmentId: values.departmentId || null,
          shiftId: values.shiftId || null,
          fingerprintId: values.fingerprintId ?? null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create employee");
      }
      return res.json();
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
      const res = await fetch(`/api/employees/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          departmentId: values.departmentId || null,
          shiftId: values.shiftId || null,
          fingerprintId: values.fingerprintId ?? null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update employee");
      }
      return res.json();
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
      const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete employee");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleteId(null);
      toast({ title: t("employees.deactivated") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: "Failed to deactivate employee", variant: "destructive" });
    },
  });

  const handleEdit = useCallback(
    (emp: Employee) => {
      setEditingEmployee(emp);
      editForm.reset({
        employeeId: emp.employeeId,
        name: emp.name,
        nameAr: emp.nameAr || "",
        departmentId: emp.departmentId || "",
        position: emp.position || "",
        phone: emp.phone || "",
        email: emp.email || "",
        fingerprintId: emp.fingerprintId,
        shiftId: emp.shiftId || "",
      });
      setEditOpen(true);
    },
    [editForm]
  );

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  // Department select for forms
  const DepartmentSelect = ({ field, form }: { field: { onChange: (v: string) => void; value: string }; form: ReturnType<typeof useForm<EmployeeFormValues>> }) => (
    <Select onValueChange={field.onChange} value={field.value}>
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
                            <Select onValueChange={field.onChange} value={field.value}>
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
                placeholder={t("employees.search")}
                value={search}
                onChange={handleSearch}
                className="pl-9"
              />
            </div>
            <Select value={departmentFilter} onValueChange={(v) => { setDepartmentFilter(v); setPage(1); }}>
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
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
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
                  <TableHead className="w-20">{t("employees.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.employees.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {t("employees.noEmployees")}
                    </TableCell>
                  </TableRow>
                )}
                {data?.employees.map((emp) => (
                  <TableRow key={emp.id}>
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
                      {emp.fingerprintId ?? "—"}
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
                      <div className="flex items-center gap-1">
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
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">
                {t("employees.showing")} {(page - 1) * limit + 1}–
                {Math.min(page * limit, data.total)} {t("employees.of")} {data.total}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">{page} / {data.totalPages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
                    <Select onValueChange={field.onChange} value={field.value}>
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
            <AlertDialogTitle>{t("employees.deactivate")}</AlertDialogTitle>
            <AlertDialogDescription>{t("employees.deactivateDesc")}</AlertDialogDescription>
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
