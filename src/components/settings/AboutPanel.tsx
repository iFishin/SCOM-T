import React, { useState } from "react";
import { Save } from "lucide-react";
import { t } from "../../i18n.ts";
import type { Lang } from "../../i18n.ts";

const APP_VERSION = "0.1.0";

export function AboutPanel({ lang }: { lang: Lang }) {
  const [showDeveloper, setShowDeveloper] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        <div className="mb-1 text-sm font-semibold">SCOM-T</div>
        <div className="text-xs text-[var(--text-muted)]">{t("about_version", lang)} {APP_VERSION}</div>
      </div>
      <button
        type="button"
        onClick={() => setShowDeveloper((v) => !v)}
        className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
      >
        <Save size={13} />
        {showDeveloper ? t("hide_developer", lang) : t("show_developer", lang)}
      </button>
      {showDeveloper && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4 text-xs leading-6 text-[var(--text-primary)]">
          SCOM-T 是面向串口调试场景的桌面工具，当前版本聚焦串口连接、数据收发、文件发送、热键指令和界面主题自定义。后续可继续扩展命令模板、日志导出和配置导入导出。
        </div>
      )}
    </div>
  );
}
