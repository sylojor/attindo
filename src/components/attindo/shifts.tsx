"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  Pencil,
  Trash2,
  CalendarClock,
  Clock,
  Moon,
  Sun,
  Palmtree,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

// Types
interface Shift {
  id: string;
  name: string;
  nameAr: string | null;
  startTime: string;
  endTime: string;
  gracePeriod: number;
  isOvernight: boolean;
  color: string;
  _count: {
    employees: number;
    schedules: number;
  };
}

interface Schedule {
  id: string;
  employeeId: string;
  shiftId: string;
  effectiveDate: string;
  dayOfWeek: number | null;
  isOffDay: boolean;
  endDate: string | null;
  employee: {
    id: string;
    employeeId: string;
    name: string;
    nameAr: string | null;
    department: string | null;
  };
  shift: Shift;
}

interface EmployeeOption {
  id: string;
  employeeId: string;
  name: string;
}

// Zod schemas
const shiftSchema = z.object({
  name: z.string().min(1, "Shift name is required"),
  nameAr: z.string().optional().default(""),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Must be HH:mm format"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Must be HH:mm format"),
  gracePeriod: z.coerce.number().min(0).max(120).default(15),
  isOvernight: z.boolean().default(false),
  color: z.string().default("#10b981"),
});

type ShiftFormValues = z.infer<typeof shiftSchema>;

const scheduleSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  shiftId: z.string().min(1, "Shift is required"),
  effectiveDate: z.string().min(1, "Effective date is required"),
  dayOfWeek: z.string().optional().default("all"),
  isOffDay: z.boolean().default(false),
  endDate: z.string().optional().default(""),
});

type ScheduleFormValues = z.infer<typeof scheduleSchema>;

const shiftColors = [
  "#10b981", "#14b8a6", "#06b6d4", "#f59e0b",
  "#ef4444", "#8b5cf6", "#ec4899", "#6366f1",
];

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayNamesAr = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const dayNamesBilingual = dayNames.map((d, i) => `${dayNamesAr[i]} / ${d}`);

function getDayLabel(dayOfWeek: number | null, isOffDay: boolean) {
  if (isOffDay) {
    const dayAr = dayOfWeek !== null ? dayNamesAr[dayOfWeek] : "كل يوم";
    const dayEn = dayOfWeek !== null ? dayNames[dayOfWeek] : "Every day";
    return `🌴 عطلة ${dayAr} / Day Off ${dayEn}`;
  }
  if (dayOfWeek !== null) {
    return `${dayNamesAr[dayOfWeek]} / ${dayNames[dayOfWeek]}`;
  }
  return "كل يوم / Every day";
}

export function ShiftsView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState("shifts");

  // Shift dialog states
  const [addShiftOpen, setAddShiftOpen] = useState(false);
  const [editShiftOpen, setEditShiftOpen] = useState(false);
  const [deleteShiftId, setDeleteShiftId] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  // Schedule dialog states
  const [addScheduleOpen, setAddScheduleOpen] = useState(false);
  const [deleteScheduleId, setDeleteScheduleId] = useState<string | null>(null);

  // Queries
  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ["shifts"],
    queryFn: async () => {
      const res = await fetch("/api/shifts");
      if (!res.ok) throw new Error("Failed to fetch shifts");
      return res.json();
    },
  });

  const { data: schedules = [], isLoading: schedulesLoading } = useQuery<Schedule[]>({
    queryKey: ["schedules"],
    queryFn: async () => {
      const res = await fetch("/api/schedules");
      if (!res.ok) throw new Error("Failed to fetch schedules");
      return res.json();
    },
  });

  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ["employees-shifts"],
    queryFn: async () => {
      const res = await fetch("/api/employees?limit=100&isActive=true");
      if (!res.ok) return [];
      const data = await res.json();
      return data.employees || [];
    },
  });

  // Shift forms
  const addShiftForm = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftSchema),
    defaultValues: {
      name: "",
      nameAr: "",
      startTime: "08:00",
      endTime: "16:00",
      gracePeriod: 15,
      isOvernight: false,
      color: "#10b981",
    },
  });

  const editShiftForm = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftSchema),
  });

  // Schedule form
  const addScheduleForm = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      employeeId: "",
      shiftId: "",
      effectiveDate: format(new Date(), "yyyy-MM-dd"),
      dayOfWeek: "all",
      isOffDay: false,
      endDate: "",
    },
  });
  const watchedDayOfWeek = addScheduleForm.watch("dayOfWeek");

  // Shift mutations
  const addShiftMutation = useMutation({
    mutationFn: async (values: ShiftFormValues) => {
      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create shift");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      setAddShiftOpen(false);
      addShiftForm.reset();
      toast({ title: "Shift created" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const editShiftMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ShiftFormValues }) => {
      const res = await fetch(`/api/shifts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update shift");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      setEditShiftOpen(false);
      setEditingShift(null);
      toast({ title: "Shift updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/shifts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete shift");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      setDeleteShiftId(null);
      toast({ title: "Shift deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete shift", variant: "destructive" });
    },
  });

  // Schedule mutations
  const addScheduleMutation = useMutation({
    mutationFn: async (values: ScheduleFormValues) => {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          dayOfWeek: values.dayOfWeek && values.dayOfWeek !== "all" ? Number(values.dayOfWeek) : null,
          isOffDay: values.isOffDay,
          endDate: values.endDate || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create schedule");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      setAddScheduleOpen(false);
      addScheduleForm.reset();
      toast({ title: "Schedule created" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete schedule");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      setDeleteScheduleId(null);
      toast({ title: "Schedule deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete schedule", variant: "destructive" });
    },
  });

  const handleEditShift = (shift: Shift) => {
    setEditingShift(shift);
    editShiftForm.reset({
      name: shift.name,
      nameAr: shift.nameAr || "",
      startTime: shift.startTime,
      endTime: shift.endTime,
      gracePeriod: shift.gracePeriod,
      isOvernight: shift.isOvernight,
      color: shift.color,
    });
    setEditShiftOpen(true);
  };

  if (shiftsLoading || schedulesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-6 w-32 mb-3" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList>
          <TabsTrigger value="shifts" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Shifts
          </TabsTrigger>
          <TabsTrigger value="schedules" className="gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" />
            Schedules
          </TabsTrigger>
        </TabsList>

        {/* ─── SHIFTS TAB ─── */}
        <TabsContent value="shifts" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Shifts</h2>
            <Dialog open={addShiftOpen} onOpenChange={setAddShiftOpen}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                  <Plus className="h-4 w-4" />
                  Add Shift
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Shift</DialogTitle>
                  <DialogDescription>Define a work shift with times and grace period</DialogDescription>
                </DialogHeader>
                <Form {...addShiftForm}>
                  <form
                    onSubmit={addShiftForm.handleSubmit((v) => addShiftMutation.mutate(v))}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={addShiftForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="Morning Shift" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addShiftForm.control}
                        name="nameAr"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Arabic Name</FormLabel>
                            <FormControl>
                              <Input placeholder="الوردية الصباحية" dir="rtl" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={addShiftForm.control}
                        name="startTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Time *</FormLabel>
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addShiftForm.control}
                        name="endTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Time *</FormLabel>
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={addShiftForm.control}
                        name="gracePeriod"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Grace Period (min)</FormLabel>
                            <FormControl>
                              <Input type="number" min={0} max={120} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addShiftForm.control}
                        name="isOvernight"
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
                            <FormLabel className="!mt-0">Overnight shift</FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={addShiftForm.control}
                      name="color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Color</FormLabel>
                          <div className="flex items-center gap-2">
                            {shiftColors.map((c) => (
                              <button
                                key={c}
                                type="button"
                                className={`h-6 w-6 rounded-full border-2 transition-all ${
                                  field.value === c ? "border-foreground scale-110" : "border-transparent"
                                }`}
                                style={{ backgroundColor: c }}
                                onClick={() => field.onChange(c)}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setAddShiftOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        disabled={addShiftMutation.isPending}
                      >
                        {addShiftMutation.isPending ? "Creating..." : "Create Shift"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {shifts.length === 0 ? (
            <Card className="p-8 text-center">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">No shifts yet</h3>
              <p className="text-sm text-muted-foreground">
                Create shifts to define work schedules
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {shifts.map((shift) => (
                <Card key={shift.id} className="relative overflow-hidden">
                  <div className="h-1.5" style={{ backgroundColor: shift.color }} />
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-sm">{shift.name}</h3>
                        {shift.nameAr && (
                          <p className="text-xs text-muted-foreground" dir="rtl">
                            {shift.nameAr}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEditShift(shift)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setDeleteShiftId(shift.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Sun className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{shift.startTime}</span>
                        <span className="text-muted-foreground">→</span>
                        <Moon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{shift.endTime}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Grace: {shift.gracePeriod}min</span>
                        {shift.isOvernight && (
                          <Badge variant="outline" className="text-[10px]">
                            Overnight
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{shift._count.employees} employee(s)</span>
                        <span>{shift._count.schedules} schedule(s)</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── SCHEDULES TAB ─── */}
        <TabsContent value="schedules" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Schedules</h2>
            <Dialog open={addScheduleOpen} onOpenChange={setAddScheduleOpen}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                  <Plus className="h-4 w-4" />
                  Assign Schedule
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assign Schedule</DialogTitle>
                  <DialogDescription>Assign a shift to an employee</DialogDescription>
                </DialogHeader>
                <Form {...addScheduleForm}>
                  <form
                    onSubmit={addScheduleForm.handleSubmit((v) => addScheduleMutation.mutate(v))}
                    className="space-y-4"
                  >
                    <FormField
                      control={addScheduleForm.control}
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
                    <FormField
                      control={addScheduleForm.control}
                      name="shiftId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Shift *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select shift" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {shifts.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  <span className="flex items-center gap-2">
                                    <span
                                      className="h-2 w-2 rounded-full"
                                      style={{ backgroundColor: s.color }}
                                    />
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
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={addScheduleForm.control}
                        name="effectiveDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Effective Date *</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addScheduleForm.control}
                        name="dayOfWeek"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>اليوم / Day of Week</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="كل يوم / Every day" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="all">كل يوم / Every day</SelectItem>
                                {dayNamesBilingual.map((d, i) => (
                                  <SelectItem key={i} value={String(i)}>
                                    {d}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={addScheduleForm.control}
                      name="isOffDay"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-3 rounded-lg border p-3 bg-amber-50 dark:bg-amber-950/20">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-4 w-4 rounded accent-amber-600"
                            />
                          </FormControl>
                          <div className="flex items-center gap-2">
                            <Palmtree className="h-4 w-4 text-amber-600" />
                            <div>
                              <FormLabel className="!mt-0 text-sm font-medium cursor-pointer">
                                يوم عطلة / Day Off
                              </FormLabel>
                              <p className="text-[11px] text-muted-foreground">
                                {watchedDayOfWeek && watchedDayOfWeek !== "all"
                                  ? `عطلة يوم ${dayNamesAr[Number(watchedDayOfWeek)]} / Day off on ${dayNames[Number(watchedDayOfWeek)]}`
                                  : "حدد اليوم أعلاه ثم فعّل هذا الخيار / Pick a day above then check this"
                                }
                              </p>
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addScheduleForm.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date (optional)</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setAddScheduleOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        disabled={addScheduleMutation.isPending}
                      >
                        {addScheduleMutation.isPending ? "Creating..." : "Assign"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {schedules.length === 0 ? (
            <Card className="p-8 text-center">
              <CalendarClock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">No schedules yet</h3>
              <p className="text-sm text-muted-foreground">
                Assign shifts to employees to create schedules
              </p>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الموظف / Employee</TableHead>
                        <TableHead>الوردية / Shift</TableHead>
                        <TableHead>من تاريخ / Effective</TableHead>
                        <TableHead className="hidden sm:table-cell">اليوم / Day</TableHead>
                        <TableHead className="hidden md:table-cell">النوع / Type</TableHead>
                        <TableHead className="hidden md:table-cell">إلى تاريخ / End</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schedules.map((schedule) => (
                        <TableRow key={schedule.id} className={schedule.isOffDay ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">
                                {schedule.employee.name}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {schedule.employee.employeeId}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {schedule.isOffDay ? (
                              <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-100 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30">
                                <Palmtree className="h-3 w-3" />
                                يوم عطلة
                              </Badge>
                            ) : (
                              <span className="flex items-center gap-1.5 text-sm">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: schedule.shift.color }}
                                />
                                {schedule.shift.name}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(schedule.effectiveDate), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm">
                            {getDayLabel(schedule.dayOfWeek, schedule.isOffDay)}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {schedule.isOffDay ? (
                              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-100 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30 text-[10px]">
                                <Palmtree className="h-3 w-3 mr-1" />
                                عطلة / Off
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-100 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30 text-[10px]">
                                عمل / Work
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            {schedule.endDate
                              ? format(new Date(schedule.endDate), "MMM d, yyyy")
                              : "مفتوح / Indefinite"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => setDeleteScheduleId(schedule.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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
      </Tabs>

      {/* Edit Shift Dialog */}
      <Dialog open={editShiftOpen} onOpenChange={setEditShiftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Shift</DialogTitle>
            <DialogDescription>Update shift details</DialogDescription>
          </DialogHeader>
          <Form {...editShiftForm}>
            <form
              onSubmit={editShiftForm.handleSubmit((v) => {
                if (editingShift) {
                  editShiftMutation.mutate({ id: editingShift.id, values: v });
                }
              })}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editShiftForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editShiftForm.control}
                  name="nameAr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Arabic Name</FormLabel>
                      <FormControl>
                        <Input dir="rtl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editShiftForm.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Time *</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editShiftForm.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Time *</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editShiftForm.control}
                  name="gracePeriod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grace Period (min)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={120} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editShiftForm.control}
                  name="isOvernight"
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
                      <FormLabel className="!mt-0">Overnight shift</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editShiftForm.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <div className="flex items-center gap-2">
                      {shiftColors.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`h-6 w-6 rounded-full border-2 transition-all ${
                            field.value === c ? "border-foreground scale-110" : "border-transparent"
                          }`}
                          style={{ backgroundColor: c }}
                          onClick={() => field.onChange(c)}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditShiftOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={editShiftMutation.isPending}
                >
                  {editShiftMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Shift Confirmation */}
      <AlertDialog open={!!deleteShiftId} onOpenChange={() => setDeleteShiftId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shift</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the shift and remove all associated schedules.
              Employees assigned to this shift will be unassigned. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteShiftId) deleteShiftMutation.mutate(deleteShiftId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Schedule Confirmation */}
      <AlertDialog open={!!deleteScheduleId} onOpenChange={() => setDeleteScheduleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Remove this schedule assignment. The employee will no longer have
              this shift assigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteScheduleId) deleteScheduleMutation.mutate(deleteScheduleId);
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
