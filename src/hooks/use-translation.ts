import { useAppStore } from "@/store/app-store";
import { translations } from "@/lib/i18n";

export function useTranslation() {
  const { lang } = useAppStore();
  const t = (key: string): string => translations[lang]?.[key] ?? key;
  const isRtl = lang === "ar";
  return { t, lang, isRtl };
}
