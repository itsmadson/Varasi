"use client";
import { Placeholder } from "@/components/Placeholder";
import { useI18n } from "@/i18n/LocaleProvider";
export default function Page() {
  const { t } = useI18n();
  return <Placeholder title={t("nav.detection")} note="Select an AOI, pair imagery through time, and run Open-CD models (TinyCD, ChangeFormer). Sprint 4." />;
}
