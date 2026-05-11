"use client";

import React, { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  Users,
  Wifi,
  Clock,
  CalendarClock,
  Banknote,
  Moon,
  Sun,
  Database,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAppStore } from "@/store/app-store";
import { useSocket } from "@/hooks/use-socket";
import { DashboardView } from "./dashboard";
import { EmployeesView } from "./employees";
import { DevicesView } from "./devices";
import { AttendanceView } from "./attendance";
import { ShiftsView } from "./shifts";
import { PayrollView } from "./payroll";

const APP_VERSION = "v1.16.0";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "employees", label: "Employees", icon: Users },
  { id: "devices", label: "Devices", icon: Wifi },
  { id: "attendance", label: "Attendance", icon: Clock },
  { id: "shifts", label: "Shifts", icon: CalendarClock },
  { id: "payroll", label: "Payroll", icon: Banknote },
];

export function AttindoLayout() {
  const { activeTab, setActiveTab, syncProgress, isGlobalSyncing } = useAppStore();
  const { theme, setTheme } = useTheme();
  const { isConnected } = useSocket();
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Auto-sync is disabled by default to prevent issues in dev environments
  // where no real devices are connected. In production with real ZKTeco devices,
  // the user can trigger sync manually or enable auto-sync in settings.
  // The sync process runs in the background and is non-blocking.

  const handleSeed = async () => {
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      if (res.ok) {
        window.location.reload();
      }
    } catch {
      // Error handled silently
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardView />;
      case "employees":
        return <EmployeesView />;
      case "devices":
        return <DevicesView />;
      case "attendance":
        return <AttendanceView />;
      case "shifts":
        return <ShiftsView />;
      case "payroll":
        return <PayrollView />;
      default:
        return <DashboardView />;
    }
  };

  const syncEntries = Object.values(syncProgress);
  const activeSyncs = syncEntries.filter((s) => s.status === "running");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4 gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-sm">
              A
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="font-bold text-sm leading-tight">Attindo</span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                HR, Payroll & Attendance
              </span>
            </div>
          </div>

          <Badge
            variant="secondary"
            className="hidden md:inline-flex text-[10px] px-1.5 py-0"
          >
            {APP_VERSION}
          </Badge>

          {/* Sync indicator */}
          {isGlobalSyncing && (
            <div className="hidden md:flex items-center gap-2 text-xs text-emerald-600">
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span>Syncing...</span>
            </div>
          )}

          {/* Active sync progress bars */}
          {activeSyncs.length > 0 && (
            <div className="hidden lg:flex items-center gap-3">
              {activeSyncs.map((sync) => (
                <div
                  key={sync.deviceId}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="text-muted-foreground max-w-[100px] truncate">
                    {sync.deviceName}
                  </span>
                  <Progress value={sync.progress} className="w-20 h-1.5" />
                  <span className="text-emerald-600">{sync.progress}%</span>
                </div>
              ))}
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Socket status */}
          <div className="hidden sm:flex items-center gap-1.5">
            <div
              className={`h-2 w-2 rounded-full ${
                isConnected ? "bg-emerald-500" : "bg-muted-foreground/40"
              }`}
            />
            <span className="text-[10px] text-muted-foreground">
              {isConnected ? "Live" : "Offline"}
            </span>
          </div>

          {/* Seed Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSeed}
            className="hidden sm:inline-flex h-7 text-xs gap-1"
          >
            <Database className="h-3 w-3" />
            Seed Data
          </Button>

          {/* Dark mode toggle */}
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-56 flex-col border-r bg-background">
          <nav className="flex-1 py-4 px-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Sidebar footer */}
          <div className="p-3 border-t">
            <div className="text-[10px] text-muted-foreground text-center">
              Attindo {APP_VERSION}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <div className="p-4 md:p-6">{renderContent()}</div>
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-around h-14">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 text-[10px] font-medium transition-colors ${
                  isActive
                    ? "text-emerald-600"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? "text-emerald-600" : ""}`} />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer (desktop) */}
      <footer className="hidden md:block border-t py-3 px-4 mt-auto">
        <div className="text-center text-xs text-muted-foreground">
          &copy; 2024-2025 Attindo {APP_VERSION} &mdash; HR, Payroll &amp; Attendance &bull; Official ZKTeco Support
        </div>
      </footer>
    </div>
  );
}
