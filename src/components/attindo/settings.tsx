"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings as SettingsIcon,
  Globe,
  Coins,
  Building2,
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
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";
import { useAppStore } from "@/store/app-store";
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

  const { data, isLoading } = useQuery<SettingsData>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
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
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency,
          lang: language,
          companyName,
          companyNameAr,
        }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json();
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
            <Select value={currency} onValueChange={setCurrency}>
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
    </div>
  );
}
