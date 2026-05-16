"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings as SettingsIcon,
  Globe,
  Coins,
  Building2,
  Database,
  Download,
  Upload,
  AlertTriangle,
  Key,
  Fingerprint,
  Banknote,
  CheckCircle2,
  XCircle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";
import { useAppStore } from "@/store/app-store";
import { fetchJson } from "@/lib/utils";
import type { Lang } from "@/lib/i18n";

export const CURRENCIES = [
  { value: "SAR", label: "SAR - Saudi Riyal / ريال سعودي" },
  { value: "JOD", label: "JOD - Jordanian Dinar / دينار أردني" },
  { value: "USD", label: "USD - US Dollar / دولار أمريكي" },
  { value: "EUR", label: "EUR - Euro / يورو" },
  { value: "AED", label: "AED - UAE Dirham / درهم إماراتي" },
  { value: "KWD", label: "KWD - Kuwaiti Dinar / دينار كويتي" },
  { value: "QAR", label: "QAR - Qatari Riyal / ريال قطري" },
  { value: "BHD", label: "BHD - Bahraini Dinar / دينار بحريني" },
  { value: "OMR", label: "OMR - Omani Rial / ريال عماني" },
  { value: "EGP", label: "EGP - Egyptian Pound / جنيه مصري" },
];

interface LicenseStatusResponse {
  fingerprint: {
    licensed: boolean;
    slotsUsed: number;
    maxSlots: number | null;
    freeLimit: number;
    limitReached: boolean;
    licenseType: string | null;
    licenseKey: string | null;
  };
  payroll: {
    licensed: boolean;
    licenseType: string | null;
    licenseKey: string | null;
  };
  licenses: Array<{
    id: string;
    type: string;
    licenseKey: string;
    maxFingerprints: number | null;
    isActive: boolean;
    issuedTo: string | null;
    issuedAt: string;
    expiresAt: string | null;
  }>;
}

// ─── License Section Component ───
function LicenseSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [licenseKey, setLicenseKey] = React.useState("");
  const [activating, setActivating] = React.useState(false);

  const { data: licenseStatus, isLoading } = useQuery<LicenseStatusResponse>({
    queryKey: ["license-status"],
    queryFn: async () => {
      return fetchJson<LicenseStatusResponse>("/api/license");
    },
    staleTime: 30000,
  });

  const handleActivate = async () => {
    if (!licenseKey.trim()) return;
    setActivating(true);
    try {
      const data = await fetchJson<{ error?: string; message?: string }>("/api/license/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: licenseKey.trim() }),
      });
      toast({ title: t("license.activated"), description: data.message });
      setLicenseKey("");
      queryClient.invalidateQueries({ queryKey: ["license-status"] });
    } catch {
      toast({ title: t("common.error"), description: t("license.invalidKey"), variant: "destructive" });
    } finally {
      setActivating(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4 text-emerald-600" />
            {t("license.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const fp = licenseStatus?.fingerprint;
  const pr = licenseStatus?.payroll;
  const licenses = licenseStatus?.licenses ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Key className="h-4 w-4 text-emerald-600" />
          {t("license.title")}
        </CardTitle>
        <CardDescription>{t("license.title")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Fingerprint License Status */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2 text-sm font-semibold">
            <Fingerprint className="h-4 w-4 text-emerald-600" />
            {t("license.fingerprintSlots")}
          </Label>
          <div className="flex items-center gap-3">
            <Badge
              className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
            >
              {t("license.free")}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {fp?.slotsUsed ?? 0} / ∞ — {t("license.fingerprintLimitDesc")}
            </span>
          </div>
        </div>

        <Separator />

        {/* Payroll License Status */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2 text-sm font-semibold">
            <Banknote className="h-4 w-4 text-emerald-600" />
            {t("license.payrollStatus")}
          </Label>
          <div className="flex items-center gap-2">
            {pr?.licensed ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  {t("license.active")}
                </Badge>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-muted-foreground" />
                <Badge className="text-xs bg-muted text-muted-foreground">
                  {t("license.inactive")}
                </Badge>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Active Licenses List */}
        {licenses.length > 0 && (
          <>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">{t("license.title")}</Label>
              <div className="space-y-2">
                {licenses.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {l.type === "fingerprint" ? (
                        <Fingerprint className="h-4 w-4 text-emerald-600" />
                      ) : l.type === "payroll" ? (
                        <Banknote className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Key className="h-4 w-4 text-emerald-600" />
                      )}
                      <span className="font-medium capitalize">{l.type}</span>
                    </div>
                    <code className="text-xs bg-background px-2 py-1 rounded font-mono">
                      {l.licenseKey}
                    </code>
                  </div>
                ))}
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Activate License Key */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">{t("license.enterKey")}</Label>
          <div className="flex gap-2">
            <Input
              placeholder="ATTD-FP-XXXX-XXXX"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              className="font-mono"
            />
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
              onClick={handleActivate}
              disabled={activating || !licenseKey.trim()}
            >
              {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : t("license.activate")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("license.enterKey")}: ATTD-FP-XXXX-XXXX, ATTD-PR-XXXX-XXXX, ATTD-FULL-XXXX-XXXX
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface SettingsData {
  id: string;
  currency: string;
  lang: string;
  companyName: string;
  companyNameAr: string;
}

export function SettingsView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t, lang } = useTranslation();
  const { setLang, setCurrency: setStoreCurrency } = useAppStore();

  const [currency, setCurrency] = React.useState("SAR");
  const [language, setLanguage] = React.useState<string>(lang);
  const [companyName, setCompanyName] = React.useState("Attindo");
  const [companyNameAr, setCompanyNameAr] = React.useState("أتندو");

  // Backup/Restore state
  const [isCreatingBackup, setIsCreatingBackup] = React.useState(false);
  const [isRestoring, setIsRestoring] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<SettingsData>({
    queryKey: ["settings"],
    queryFn: async () => {
      return fetchJson<SettingsData>("/api/settings");
    },
  });

  // Sync form with server data
  React.useEffect(() => {
    if (data) {
      setCurrency(data.currency);
      setLanguage(data.lang);
      setCompanyName(data.companyName);
      setCompanyNameAr(data.companyNameAr);
      // Also sync to global store so other components can use it
      setStoreCurrency(data.currency);
    }
  }, [data, setStoreCurrency]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return fetchJson("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency,
          lang: language,
          companyName,
          companyNameAr,
        }),
      });
    },
    onSuccess: () => {
      setLang(language as Lang);
      setStoreCurrency(currency);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: t("settings.saved") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: "Failed to save settings", variant: "destructive" });
    },
  });

  // Backup handler
  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      const res = await fetch("/api/backup");
      if (!res.ok) throw new Error("Failed to create backup");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attindo-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: t("backup.created") });
    } catch {
      toast({ title: t("common.error"), description: "Failed to create backup", variant: "destructive" });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  // Restore handler
  const handleRestore = async () => {
    if (!selectedFile) return;
    setIsRestoring(true);
    try {
      const fileContent = await selectedFile.text();
      const backupData = JSON.parse(fileContent);
      const errorData = await fetchJson<{ error?: string }>("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backupData),
      });
      // Invalidate all queries to refresh data
      await queryClient.invalidateQueries();
      toast({ title: t("backup.restored") });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      toast({
        title: t("common.error"),
        description: err instanceof Error ? err.message : "Failed to restore backup",
        variant: "destructive",
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

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
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-5 w-5 text-emerald-600" />
        <h1 className="text-xl font-bold">{t("settings.title")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.general")}</CardTitle>
          <CardDescription>{t("settings.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Currency */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-emerald-600" />
              {t("settings.currency")}
            </Label>
            <Select value={currency} onValueChange={(v) => {
              setCurrency(v);
              setStoreCurrency(v);
              // Auto-save currency change immediately
              fetchJson("/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currency: v }),
              }).then(() => {
                queryClient.invalidateQueries({ queryKey: ["settings"] });
                toast({ title: t("settings.saved") });
              }).catch(() => {
                toast({ title: t("common.error"), variant: "destructive" });
              });
            }}>
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-emerald-600" />
              {t("settings.language")}
            </Label>
            <Select
              value={language}
              onValueChange={(v) => {
                setLanguage(v);
                setLang(v as Lang);
                // Auto-save language change immediately
                fetchJson("/api/settings", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ lang: v }),
                }).then(() => {
                  queryClient.invalidateQueries({ queryKey: ["settings"] });
                  toast({ title: t("settings.saved") });
                }).catch(() => {
                  toast({ title: t("common.error"), variant: "destructive" });
                });
              }}
            >
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ar">{t("settings.arabic")}</SelectItem>
                <SelectItem value="en">{t("settings.english")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Company Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-emerald-600" />
                {t("settings.companyName")}
              </Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Attindo"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("settings.companyNameAr")}</Label>
              <Input
                value={companyNameAr}
                onChange={(e) => setCompanyNameAr(e.target.value)}
                placeholder="أتندو"
                dir="rtl"
              />
            </div>
          </div>

          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "..." : t("common.save")}
          </Button>
        </CardContent>
      </Card>

      {/* License Section */}
      <LicenseSection />

      {/* Backup & Restore Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-emerald-600" />
            {t("backup.title")}
          </CardTitle>
          <CardDescription>{t("backup.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Create Backup */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Download className="h-4 w-4 text-emerald-600" />
              {t("backup.create")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("backup.lastBackup")}: {new Date().toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US")}
            </p>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleCreateBackup}
              disabled={isCreatingBackup}
            >
              <Download className="h-4 w-4 mr-2" />
              {isCreatingBackup ? t("backup.creating") : t("backup.create")}
            </Button>
          </div>

          {/* Restore from Backup */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-emerald-600" />
              {t("backup.restore")}
            </Label>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="cursor-pointer"
                />
                {selectedFile && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-orange-500 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                    disabled={!selectedFile || isRestoring}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {isRestoring ? t("backup.restoring") : t("backup.restore")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-orange-500" />
                      {t("backup.confirmRestore")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("backup.confirmRestoreDesc")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="rounded-md bg-orange-50 border border-orange-200 p-3 dark:bg-orange-950/20 dark:border-orange-900">
                    <p className="text-sm text-orange-700 dark:text-orange-400 font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {t("backup.restoreWarning")}
                    </p>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRestore}
                      className="bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      {t("backup.restore")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
