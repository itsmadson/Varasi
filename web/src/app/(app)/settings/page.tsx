"use client";
import { Placeholder } from "@/components/Placeholder";
import { useI18n } from "@/i18n/LocaleProvider";
export default function Page() {
  const { t } = useI18n();
  return <Placeholder title={t("nav.settings")} note="Organization, members, API keys and notification channels." />;
}
