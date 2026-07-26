import { Input } from "../ui/Input";
import { t } from "../../i18n.ts";
import type { Lang } from "../../i18n.ts";

export function MarketplaceSettings({
  lang,
  cloudServerUrl,
  cloudAuthToken,
  cloudUploaderName,
  onCloudServerUrlChange,
  onCloudAuthTokenChange,
  onCloudUploaderNameChange,
}: {
  lang: Lang;
  cloudServerUrl?: string;
  cloudAuthToken?: string;
  cloudUploaderName?: string;
  onCloudServerUrlChange?: (url: string) => void;
  onCloudAuthTokenChange?: (token: string) => void;
  onCloudUploaderNameChange?: (name: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-2 text-sm font-semibold">{t("marketplace_server_url", lang)}</div>
        <div className="text-xs text-[var(--text-muted)] mb-3">{t("marketplace_server_url_desc", lang)}</div>
        <Input
          type="text"
          value={cloudServerUrl ?? ""}
          onChange={(e) => onCloudServerUrlChange?.(e.currentTarget.value)}
          placeholder="https://example.com/api"
          className="w-full text-xs mb-2"
        />
        <Input
          type="password"
          value={cloudAuthToken ?? ""}
          onChange={(e) => onCloudAuthTokenChange?.(e.currentTarget.value)}
          placeholder={t("marketplace_auth_token", lang)}
          className="w-full text-xs mb-2"
        />
        <Input
          type="text"
          value={cloudUploaderName ?? ""}
          onChange={(e) => onCloudUploaderNameChange?.(e.currentTarget.value)}
          placeholder={t("marketplace_uploader_name_placeholder", lang)}
          className="w-full text-xs"
        />
      </div>
    </div>
  );
}
