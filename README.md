# Attindo - HR, Payroll & Attendance System

<div align="center">
  <img src="public/logo.png" alt="Attindo Logo" width="128" height="128" />
  
  **Professional HR, Payroll & Attendance Management System**
  
  With official ZKTeco fingerprint device support
</div>

## Features

- 👤 **Employee Management** — Full employee lifecycle management with bilingual (Arabic/English) support
- 🏢 **Department Management** — Organize employees into departments
- 🔐 **ZKTeco Device Integration** — Official ZK protocol support for MB20, F18, SpeedFace, iFace, inBio, and more
- ⏰ **Shift & Schedule Management** — Define work shifts, assign schedules, mark day-offs
- 📅 **Holiday Management** — Track public holidays and recurring holidays
- 📊 **Attendance Tracking** — Real-time attendance monitoring with fingerprint verification
- 💰 **Payroll Processing** — Complete payroll with salary structures, allowances, deductions, loans
- 📈 **Reports** — Comprehensive attendance and payroll reports
- 🔄 **Backup & Restore** — Full database backup and restore capability
- 🔑 **License System** — Free tier: 4 fingerprint devices, Payroll requires license
- 🌙 **Dark Mode** — Full dark/light theme support
- 🌐 **Bilingual** — Arabic and English interface

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: SQLite (via Prisma)
- **Fingerprint Devices**: ZKTeco ZK Protocol (TCP port 4370)
- **Desktop**: Electron + electron-builder (Windows installer)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) runtime
- Node.js 18+

### Installation

```bash
# Clone the repository
git clone https://github.com/attindo/attindo.git
cd attindo

# Install dependencies
bun install

# Set up the database
bun run db:push

# Start the development server
bun run dev
```

### Running as Desktop App

```bash
# Development mode (Electron + Next.js)
bun run electron:dev

# Build Windows installer
bun run electron:build
```

## ZKTeco Device Setup

1. Connect your ZKTeco device to the same network
2. Ensure TCP port 4370 is open on the device
3. Add the device in the Devices section with its IP address
4. Click "Test Connection" to verify connectivity
5. Click "Sync" to pull attendance data

### Supported Devices

- ZKTeco MB20 (Multi-Biometric: Fingerprint + Face + Palm)
- ZKTeco F18 / F22 / F22-Pro
- ZKTeco SpeedFace-V4L / V5L
- ZKTeco iFace302 / iFace402
- ZKTeco inBio160 / inBio260 / inBio460
- ZKTeco K14 / K20 / K40
- ZK T4-C / T5-C
- Any device using ZK TCP protocol on port 4370

## License System

| Feature | Free Tier | Licensed |
|---------|-----------|----------|
| Fingerprint Devices | 4 devices | Unlimited (with license) |
| Employee Management | Unlimited | Unlimited |
| Attendance Tracking | Unlimited | Unlimited |
| Payroll | ❌ | ✅ (with license) |
| Reports | Unlimited | Unlimited |
| Backup & Restore | Unlimited | Unlimited |

### License Keys

- **Fingerprint License**: `ATTD-FP-XXXX-XXXX` — Unlocks unlimited fingerprint devices
- **Payroll License**: `ATTD-PR-XXXX-XXXX` — Unlocks payroll module
- **Full License**: `ATTD-FULL-XXXX-XXXX` — Unlocks everything

## Project Structure

```
attindo/
├── electron/            # Electron desktop wrapper
│   ├── main.ts         # Electron main process
│   └── preload.ts      # Secure preload script
├── mini-services/
│   └── zk-sync-service/ # ZK fingerprint device sync service
├── prisma/
│   └── schema.prisma   # Database schema
├── src/
│   ├── app/
│   │   ├── api/        # API routes
│   │   └── page.tsx    # Main entry point
│   ├── components/
│   │   ├── attindo/    # Application components
│   │   └── ui/         # shadcn/ui components
│   ├── hooks/          # Custom hooks
│   ├── lib/            # Utilities and i18n
│   └── store/          # Zustand store
├── public/             # Static assets
└── db/                 # SQLite database files
```

## License

© 2024-2025 Attindo. All rights reserved.
