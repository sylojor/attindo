import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/seed - Seed the database with sample data
export async function POST() {
  try {
    // Check if data already exists
    const existingEmployees = await db.employee.count();
    if (existingEmployees > 0) {
      return NextResponse.json(
        { error: "Database already has data. Clear it first before seeding." },
        { status: 409 }
      );
    }

    // ── Create Default Settings ──
    await db.settings.create({
      data: {
        id: "default",
        currency: "SAR",
        lang: "ar",
        companyName: "Attindo",
        companyNameAr: "أتندو",
      },
    });

    // ── Create Departments ──
    const departmentData = [
      { name: "Engineering", nameAr: "الهندسة", manager: "Ahmed Al-Rashid" },
      { name: "HR", nameAr: "الموارد البشرية", manager: "Sara Al-Otaibi" },
      { name: "Finance", nameAr: "المالية", manager: "Noura Al-Farsi" },
      { name: "Marketing", nameAr: "التسويق", manager: "Layla Al-Dosari" },
      { name: "Operations", nameAr: "العمليات", manager: "Yusuf Al-Shammari" },
      { name: "IT Support", nameAr: "دعم تقنية المعلومات", manager: "Ali Al-Zahrani" },
    ];

    const departments = await Promise.all(
      departmentData.map((d) => db.department.create({ data: d }))
    );

    const departmentMap = new Map(departments.map((d) => [d.name, d.id]));

    // ── Create Shifts ──
    const shifts = await Promise.all([
      db.shift.create({
        data: {
          name: "Morning Shift",
          nameAr: "الوردية الصباحية",
          startTime: "08:00",
          endTime: "16:00",
          gracePeriod: 15,
          isOvernight: false,
          color: "#10b981",
        },
      }),
      db.shift.create({
        data: {
          name: "Evening Shift",
          nameAr: "الوردية المسائية",
          startTime: "16:00",
          endTime: "00:00",
          gracePeriod: 10,
          isOvernight: true,
          color: "#f59e0b",
        },
      }),
      db.shift.create({
        data: {
          name: "Night Shift",
          nameAr: "الوردية الليلية",
          startTime: "00:00",
          endTime: "08:00",
          gracePeriod: 10,
          isOvernight: true,
          color: "#6366f1",
        },
      }),
    ]);

    // ── Create Employees ──
    const employeeData = [
      { employeeId: "EMP-001", name: "Ahmed Al-Rashid", nameAr: "أحمد الراشد", departmentName: "Engineering", position: "Senior Developer", phone: "+966501001001", email: "ahmed@attindo.com", fingerprintId: 1 },
      { employeeId: "EMP-002", name: "Fatima Hassan", nameAr: "فاطمة حسن", departmentName: "Engineering", position: "Frontend Developer", phone: "+966501001002", email: "fatima@attindo.com", fingerprintId: 2 },
      { employeeId: "EMP-003", name: "Mohammed Al-Said", nameAr: "محمد السعيد", departmentName: "Engineering", position: "Backend Developer", phone: "+966501001003", email: "mohammed@attindo.com", fingerprintId: 3 },
      { employeeId: "EMP-004", name: "Sara Al-Otaibi", nameAr: "سارة العتيبي", departmentName: "HR", position: "HR Manager", phone: "+966501001004", email: "sara@attindo.com", fingerprintId: 4 },
      { employeeId: "EMP-005", name: "Khalid Mansour", nameAr: "خالد منصور", departmentName: "HR", position: "Recruitment Specialist", phone: "+966501001005", email: "khalid@attindo.com", fingerprintId: 5 },
      { employeeId: "EMP-006", name: "Noura Al-Farsi", nameAr: "نورة الفارسي", departmentName: "Finance", position: "Accountant", phone: "+966501001006", email: "noura@attindo.com", fingerprintId: 6 },
      { employeeId: "EMP-007", name: "Omar Al-Qahtani", nameAr: "عمر القحطاني", departmentName: "Finance", position: "Financial Analyst", phone: "+966501001007", email: "omar@attindo.com", fingerprintId: 7 },
      { employeeId: "EMP-008", name: "Layla Al-Dosari", nameAr: "ليلى الدوسري", departmentName: "Marketing", position: "Marketing Manager", phone: "+966501001008", email: "layla@attindo.com", fingerprintId: 8 },
      { employeeId: "EMP-009", name: "Yusuf Al-Shammari", nameAr: "يوسف الشمري", departmentName: "Operations", position: "Operations Manager", phone: "+966501001009", email: "yusuf@attindo.com", fingerprintId: 9 },
      { employeeId: "EMP-010", name: "Huda Al-Mutairi", nameAr: "هدى المطيري", departmentName: "Engineering", position: "QA Engineer", phone: "+966501001010", email: "huda@attindo.com", fingerprintId: 10 },
      { employeeId: "EMP-011", name: "Ali Al-Zahrani", nameAr: "علي الزهراني", departmentName: "IT Support", position: "IT Specialist", phone: "+966501001011", email: "ali@attindo.com", fingerprintId: 11 },
      { employeeId: "EMP-012", name: "Rania Al-Ghamdi", nameAr: "رانيا الغامدي", departmentName: "Marketing", position: "Content Creator", phone: "+966501001012", email: "rania@attindo.com", fingerprintId: 12 },
    ];

    const employees = await Promise.all(
      employeeData.map((emp, index) => {
        const { departmentName, ...rest } = emp;
        return db.employee.create({
          data: {
            ...rest,
            departmentId: departmentMap.get(departmentName) || null,
            shiftId: shifts[index % shifts.length].id,
          },
        });
      })
    );

    // ── Create Devices ──
    const deviceData = [
      { name: "Main Entrance", ip: "192.168.1.201", port: 4370, deviceType: "ZKTeco", serialNumber: "ZK20240001", firmware: "Ver 6.60" },
      { name: "Office Floor 1", ip: "192.168.1.202", port: 4370, deviceType: "ZKTeco", serialNumber: "ZK20240002", firmware: "Ver 6.60" },
      { name: "Office Floor 2", ip: "192.168.1.203", port: 4370, deviceType: "ZKTeco", serialNumber: "ZK20240003", firmware: "Ver 6.55" },
    ];

    const devices = await Promise.all(
      deviceData.map((d) =>
        db.device.create({
          data: {
            ...d,
            status: "online",
            lastSyncAt: new Date(),
          },
        })
      )
    );

    // Register devices with ZK sync service (non-blocking)
    for (const device of devices) {
      fetch("http://127.0.0.1:3003/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: device.id,
          name: device.name,
          ip: device.ip,
          port: device.port,
        }),
      }).catch(() => {});
    }

    // ── Create DeviceEmployee records ──
    for (const device of devices) {
      for (const emp of employees) {
        if (emp.fingerprintId !== null) {
          await db.deviceEmployee.create({
            data: {
              deviceId: device.id,
              employeeId: emp.id,
              fingerprintId: emp.fingerprintId,
              isUploaded: true,
              lastSyncAt: new Date(),
            },
          });
        }
      }
    }

    // ── Create Schedules ──
    const effectiveDate = new Date();
    effectiveDate.setMonth(effectiveDate.getMonth() - 1); // Started last month

    for (const emp of employees) {
      // Create a schedule for each employee for their shift
      await db.schedule.create({
        data: {
          employeeId: emp.id,
          shiftId: emp.shiftId!,
          effectiveDate,
          dayOfWeek: null, // Every day
          endDate: null, // Indefinite
        },
      });
    }

    // ── Create Attendance Logs (last 7 days) ──
    const verifyModes = ["fingerprint", "card", "face", "password"];
    const now = new Date();

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const dayDate = new Date(now);
      dayDate.setDate(dayDate.getDate() - dayOffset);
      dayDate.setHours(0, 0, 0, 0);

      // Each employee has ~80% chance of attendance each day
      for (const emp of employees) {
        if (Math.random() < 0.2) continue; // 20% absence

        const device = devices[Math.floor(Math.random() * devices.length)];
        const verifyMode = verifyModes[Math.floor(Math.random() * verifyModes.length)];

        // Get the employee's shift start time for realistic check-in
        const empShift = shifts.find((s) => s.id === emp.shiftId);
        const startHour = empShift ? parseInt(empShift.startTime.split(":")[0]) : 8;
        const startMinute = empShift ? parseInt(empShift.startTime.split(":")[1]) : 0;

        // Check-in: around shift start ± random offset (some late)
        const lateOffset = Math.random() < 0.3 ? Math.floor(Math.random() * 30) + 5 : 0; // 30% chance of being late
        const checkInMinutes = startHour * 60 + startMinute + lateOffset + Math.floor(Math.random() * 10) - 5;
        const checkInHour = Math.floor(checkInMinutes / 60);
        const checkInMin = checkInMinutes % 60;

        const checkInTime = new Date(dayDate);
        checkInTime.setHours(checkInHour, checkInMin, Math.floor(Math.random() * 60));

        await db.attendanceLog.create({
          data: {
            employeeId: emp.id,
            deviceId: device.id,
            timestamp: checkInTime,
            verifyMode,
            status: "check-in",
            ioMode: 0,
            workCode: 0,
            syncedAt: new Date(),
          },
        });

        // Check-out: around shift end
        const endHour = empShift ? parseInt(empShift.endTime.split(":")[0]) : 16;
        const endMinute = empShift ? parseInt(empShift.endTime.split(":")[1]) : 0;

        // Add some random offset for check-out
        const checkOutMinutes = endHour * 60 + endMinute + Math.floor(Math.random() * 30) - 10;
        const checkOutHour = Math.floor(checkOutMinutes / 60);
        const checkOutMin = checkOutMinutes % 60;

        const checkOutTime = new Date(dayDate);
        checkOutTime.setHours(checkOutHour, checkOutMin, Math.floor(Math.random() * 60));

        // Only create check-out if after check-in
        if (checkOutTime > checkInTime) {
          await db.attendanceLog.create({
            data: {
              employeeId: emp.id,
              deviceId: device.id,
              timestamp: checkOutTime,
              verifyMode,
              status: "check-out",
              ioMode: 1,
              workCode: 0,
              syncedAt: new Date(),
            },
          });
        }
      }
    }

    // ── Create Sync Logs ──
    for (const device of devices) {
      // Create a few sync logs for each device
      for (let i = 0; i < 3; i++) {
        const syncDate = new Date(now);
        syncDate.setDate(syncDate.getDate() - i);
        syncDate.setHours(syncDate.getHours() - Math.floor(Math.random() * 4));

        await db.syncLog.create({
          data: {
            deviceId: device.id,
            syncType: i === 0 ? "full" : "incremental",
            status: "completed",
            recordsFetched: Math.floor(Math.random() * 50) + 10,
            recordsUploaded: Math.floor(Math.random() * 12),
            startedAt: syncDate,
            completedAt: new Date(syncDate.getTime() + Math.floor(Math.random() * 30000) + 5000),
          },
        });
      }
    }

    // ── Create Salary Structures ──
    const salaryLevels: Record<string, { basicSalary: number; housingAllowance: number; transportAllowance: number; foodAllowance: number }> = {
      manager: { basicSalary: 12000, housingAllowance: 3000, transportAllowance: 1000, foodAllowance: 500 },
      senior: { basicSalary: 10000, housingAllowance: 2500, transportAllowance: 800, foodAllowance: 400 },
      specialist: { basicSalary: 8000, housingAllowance: 2000, transportAllowance: 600, foodAllowance: 300 },
      analyst: { basicSalary: 8000, housingAllowance: 2000, transportAllowance: 600, foodAllowance: 300 },
      accountant: { basicSalary: 8000, housingAllowance: 2000, transportAllowance: 600, foodAllowance: 300 },
      default: { basicSalary: 6000, housingAllowance: 1500, transportAllowance: 500, foodAllowance: 250 },
    };

    for (const emp of employees) {
      const pos = emp.position?.toLowerCase() || "";
      let level = salaryLevels.default;
      if (pos.includes("manager")) level = salaryLevels.manager;
      else if (pos.includes("senior")) level = salaryLevels.senior;
      else if (pos.includes("specialist")) level = salaryLevels.specialist;
      else if (pos.includes("analyst")) level = salaryLevels.analyst;
      else if (pos.includes("accountant")) level = salaryLevels.accountant;

      const overtimeRate = Math.round((level.basicSalary / 30 / 8) * 100) / 100;
      const deductionPerLate = Math.round((level.basicSalary / 30 / 8 * 0.5) * 100) / 100;
      const deductionPerAbsent = Math.round((level.basicSalary / 30) * 100) / 100;

      await db.salaryStructure.create({
        data: {
          employeeId: emp.id,
          basicSalary: level.basicSalary,
          housingAllowance: level.housingAllowance,
          transportAllowance: level.transportAllowance,
          foodAllowance: level.foodAllowance,
          otherAllowances: 0,
          overtimeRate,
          deductionPerLate,
          deductionPerAbsent,
          currency: "SAR",
        },
      });
    }

    // ── Create Sample Loans ──
    const loanData = [
      { employeeIdx: 0, type: "advance" as const, amount: 3000, monthlyDeduction: 500, notes: "Personal advance - سلفة شخصية" },
      { employeeIdx: 3, type: "loan" as const, amount: 10000, monthlyDeduction: 1000, notes: "Education loan - قرض تعليمي" },
      { employeeIdx: 5, type: "advance" as const, amount: 2000, monthlyDeduction: 400, notes: "Emergency advance - سلفة طارئة" },
      { employeeIdx: 8, type: "loan" as const, amount: 15000, monthlyDeduction: 1500, notes: "Housing loan - قرض سكني" },
      { employeeIdx: 1, type: "advance" as const, amount: 1500, monthlyDeduction: 300, notes: "Medical advance - سلفة طبية" },
    ];

    const loans = [];
    for (const loanInfo of loanData) {
      const emp = employees[loanInfo.employeeIdx];
      if (!emp) continue;
      const loan = await db.loan.create({
        data: {
          employeeId: emp.id,
          type: loanInfo.type,
          amount: loanInfo.amount,
          monthlyDeduction: loanInfo.monthlyDeduction,
          remainingBalance: loanInfo.amount,
          issueDate: new Date(),
          status: "active",
          notes: loanInfo.notes,
        },
      });
      loans.push(loan);
    }

    // ── Create Payroll Period for Current Month ──
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();
    const MONTH_NAMES = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

    const payrollPeriod = await db.payrollPeriod.create({
      data: {
        name: `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`,
        month: currentMonth,
        year: currentYear,
        startDate,
        endDate,
        status: "completed",
      },
    });

    // ── Create Pay Slips for the Period ──
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    for (const emp of employees) {
      const salary = await db.salaryStructure.findUnique({
        where: { employeeId: emp.id },
      });
      if (!salary) continue;

      // Simulate attendance for the full month
      const periodStart = new Date(startDate);
      const periodEnd = new Date(endDate);
      let workingDays = 0;
      let presentDays = 0;
      let absentDays = 0;
      let lateDays = 0;

      const dayIterator = new Date(periodStart);
      while (dayIterator <= periodEnd) {
        const dayOfWeek = dayIterator.getDay();
        if (dayOfWeek !== 5 && dayOfWeek !== 6) { // Exclude Friday & Saturday
          workingDays++;
          // Simulate: 85% present, 15% absent
          if (Math.random() < 0.85) {
            presentDays++;
            // 25% chance of being late
            if (Math.random() < 0.25) {
              lateDays++;
            }
          } else {
            absentDays++;
          }
        }
        dayIterator.setDate(dayIterator.getDate() + 1);
      }

      const overtimeHours = Math.round(Math.random() * 8 * 10) / 10; // 0-8 hours
      const fixedAllowances = salary.housingAllowance + salary.transportAllowance +
        salary.foodAllowance + salary.otherAllowances;
      const totalAllowances = fixedAllowances;
      const lateDeductionAmount = lateDays * salary.deductionPerLate;
      const absentDeductionAmount = absentDays * salary.deductionPerAbsent;
      const overtimePay = overtimeHours * salary.overtimeRate;

      // Get loan deduction for this employee
      const empLoans = loans.filter((l) => l.employeeId === emp.id);
      let loanDeduction = 0;
      for (const loan of empLoans) {
        loanDeduction += loan.monthlyDeduction;
      }

      const totalDeductionsAmount = lateDeductionAmount + absentDeductionAmount;
      const netSalary = salary.basicSalary + totalAllowances + overtimePay - totalDeductionsAmount - loanDeduction;

      await db.paySlip.create({
        data: {
          employeeId: emp.id,
          payrollPeriodId: payrollPeriod.id,
          basicSalary: salary.basicSalary,
          totalAllowances,
          totalDeductions: totalDeductionsAmount,
          loanDeduction,
          overtimePay,
          netSalary,
          workingDays,
          presentDays,
          absentDays,
          lateDays,
          overtimeHours,
          status: "pending",
        },
      });

      totalGross += salary.basicSalary + totalAllowances + overtimePay;
      totalDeductions += totalDeductionsAmount + loanDeduction;
      totalNet += netSalary;
    }

    // Update payroll period totals
    await db.payrollPeriod.update({
      where: { id: payrollPeriod.id },
      data: {
        totalGross,
        totalDeductions,
        totalNet,
        processedAt: new Date(),
      },
    });

    return NextResponse.json({
      message: "Database seeded successfully",
      data: {
        settings: 1,
        departments: departments.length,
        employees: employees.length,
        devices: devices.length,
        shifts: shifts.length,
        schedules: employees.length,
        attendanceDays: 7,
        salaryStructures: employees.length,
        loans: loans.length,
        payrollPeriod: payrollPeriod.name,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to seed database";
    console.error("[Seed] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
