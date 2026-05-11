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
      { employeeId: "EMP-001", name: "Ahmed Al-Rashid", nameAr: "أحمد الراشد", department: "Engineering", position: "Senior Developer", phone: "+966501001001", email: "ahmed@attindo.com", fingerprintId: 1 },
      { employeeId: "EMP-002", name: "Fatima Hassan", nameAr: "فاطمة حسن", department: "Engineering", position: "Frontend Developer", phone: "+966501001002", email: "fatima@attindo.com", fingerprintId: 2 },
      { employeeId: "EMP-003", name: "Mohammed Al-Said", nameAr: "محمد السعيد", department: "Engineering", position: "Backend Developer", phone: "+966501001003", email: "mohammed@attindo.com", fingerprintId: 3 },
      { employeeId: "EMP-004", name: "Sara Al-Otaibi", nameAr: "سارة العتيبي", department: "HR", position: "HR Manager", phone: "+966501001004", email: "sara@attindo.com", fingerprintId: 4 },
      { employeeId: "EMP-005", name: "Khalid Mansour", nameAr: "خالد منصور", department: "HR", position: "Recruitment Specialist", phone: "+966501001005", email: "khalid@attindo.com", fingerprintId: 5 },
      { employeeId: "EMP-006", name: "Noura Al-Farsi", nameAr: "نورة الفارسي", department: "Finance", position: "Accountant", phone: "+966501001006", email: "noura@attindo.com", fingerprintId: 6 },
      { employeeId: "EMP-007", name: "Omar Al-Qahtani", nameAr: "عمر القحطاني", department: "Finance", position: "Financial Analyst", phone: "+966501001007", email: "omar@attindo.com", fingerprintId: 7 },
      { employeeId: "EMP-008", name: "Layla Al-Dosari", nameAr: "ليلى الدوسري", department: "Marketing", position: "Marketing Manager", phone: "+966501001008", email: "layla@attindo.com", fingerprintId: 8 },
      { employeeId: "EMP-009", name: "Yusuf Al-Shammari", nameAr: "يوسف الشمري", department: "Operations", position: "Operations Manager", phone: "+966501001009", email: "yusuf@attindo.com", fingerprintId: 9 },
      { employeeId: "EMP-010", name: "Huda Al-Mutairi", nameAr: "هدى المطيري", department: "Engineering", position: "QA Engineer", phone: "+966501001010", email: "huda@attindo.com", fingerprintId: 10 },
      { employeeId: "EMP-011", name: "Ali Al-Zahrani", nameAr: "علي الزهراني", department: "IT Support", position: "IT Specialist", phone: "+966501001011", email: "ali@attindo.com", fingerprintId: 11 },
      { employeeId: "EMP-012", name: "Rania Al-Ghamdi", nameAr: "رانيا الغامدي", department: "Marketing", position: "Content Creator", phone: "+966501001012", email: "rania@attindo.com", fingerprintId: 12 },
    ];

    const employees = await Promise.all(
      employeeData.map((emp, index) =>
        db.employee.create({
          data: {
            ...emp,
            shiftId: shifts[index % shifts.length].id,
          },
        })
      )
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

    return NextResponse.json({
      message: "Database seeded successfully",
      data: {
        employees: employees.length,
        devices: devices.length,
        shifts: shifts.length,
        schedules: employees.length,
        attendanceDays: 7,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to seed database";
    console.error("[Seed] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
