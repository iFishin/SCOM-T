import { useState } from "react";
import { CheckCircle, AlertCircle, Loader } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { t } from "../../i18n.ts";
import type { Lang } from "../../i18n.ts";

const DEFAULT_CLOUD_SERVER_URL = "https://scom-t-marketplace.ifishin.top";

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
  const [testLoading, setTestLoading] = useState(false);
  const [testStatus, setTestStatus] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleTestConnection() {
    const url = (cloudServerUrl || DEFAULT_CLOUD_SERVER_URL).replace(/\/+$/, "");
    const token = cloudAuthToken?.trim();

    if (!token) {
      setTestStatus({ ok: false, message: lang === "zh" ? "请先输入认证令牌" : "Please enter auth token" });
      return;
    }

    setTestLoading(true);
    setTestStatus(null);

    try {
      const res = await fetch(`${url}/items`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setTestStatus({ ok: true, message: lang === "zh" ? "连接成功" : "Connected" });
      } else if (res.status === 401) {
        setTestStatus({ ok: false, message: lang === "zh" ? "认证失败（令牌无效或过期）" : "Auth failed (invalid/expired token)" });
      } else {
        setTestStatus({ ok: false, message: `HTTP ${res.status}` });
      }
    } catch (e) {
      setTestStatus({ ok: false, message: lang === "zh" ? "连接失败，检查服务器地址和网络" : "Connection failed" });
    } finally {
      setTestLoading(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-2 text-sm font-semibold">{t("marketplace_server_url", lang)}</div>
        <div className="text-xs text-[var(--text-muted)] mb-3">{t("marketplace_server_url_desc", lang)}</div>
        <Input
          type="text"
          value={cloudServerUrl ?? ""}
          onChange={(e) => onCloudServerUrlChange?.(e.currentTarget.value)}
          placeholder={DEFAULT_CLOUD_SERVER_URL}
          className="w-full text-xs mb-2"
        />
        <div className="flex items-center gap-2 mb-3">
          <Button
            type="button"
            onClick={handleTestConnection}
            disabled={testLoading}
            className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-40"
          >
            {testLoading ? (
              <>
                <Loader size={12} className="animate-spin" />
                {lang === "zh" ? "测试中..." : "Testing..."}
              </>
            ) : (
              <>
                {lang === "zh" ? "测试连接" : "Test Connection"}
              </>
            )}
          </Button>
          {testStatus && (
            <div className={`flex items-center gap-1 text-xs ${testStatus.ok ? "text-emerald-600" : "text-rose-600"}`}>
              {testStatus.ok ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
              {testStatus.message}
            </div>
          )}
        </div>
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
