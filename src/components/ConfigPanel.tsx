import { useState } from "react";
import { RefreshCw, ChevronDown, ChevronRight, PlugZap, Plug } from "lucide-react";
import { Button } from "./ui/Button";
import type { PortSummary, SerialConfig, SelectOption } from "../hooks/useSerialPort.ts";
import { t } from "../i18n.ts";
import type { Lang } from "../i18n.ts";

type ConfigPanelProps = {
  ports: PortSummary[];
  config: SerialConfig;
  baudRates: number[];
  dataBitsOptions: SelectOption<SerialConfig["dataBits"]>[];
  parityOptions: SelectOption<SerialConfig["parity"]>[];
  stopBitsOptions: SelectOption<SerialConfig["stopBits"]>[];
  isConnected: boolean;
  isBusy: boolean;
  lang: Lang;
  onRefresh: () => Promise<void>;
  onConfigChange: (config: SerialConfig) => void;
  onOpen: () => Promise<void>;
  onClose: () => Promise<void>;
};

const sel =
  "w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] disabled:opacity-40";

export function ConfigPanel({
  ports,
  config,
  baudRates,
  dataBitsOptions,
  parityOptions,
  stopBitsOptions,
  isConnected,
  isBusy,
  lang,
  onRefresh,
  onConfigChange,
  onOpen,
  onClose,
}: ConfigPanelProps) {
  const [advOpen, setAdvOpen] = useState(false);

  return (
    <aside className="shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="space-y-3 p-3">
        {/* Compact row: Port + Baud + Actions */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">
              {t("port", lang)}
            </label>
            <div className="flex items-center gap-2 mt-1">
              <select
                className={`${sel} w-44 truncate`}
                title={config.path}
                value={config.path}
                onChange={(e) => onConfigChange({ ...config, path: e.currentTarget.value })}
                disabled={isConnected || isBusy}
              >
                <option value="">{t("select_port", lang)}</option>
                {ports.map((p) => (
                  <option key={p.path} value={p.path}>{p.label}</option>
                ))}
              </select>
              <Button
                type="button"
                onClick={() => void onRefresh()}
                disabled={isBusy}
                title={t("refresh_ports", lang)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
              >
                <RefreshCw size={14} />
              </Button>
            </div>
          </div>

          <div className="w-28">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">
              {t("baud", lang)}
            </label>
            <div className="mt-1">
              <select
                className={`${sel} w-full`}
                value={config.baudRate}
                onChange={(e) => onConfigChange({ ...config, baudRate: Number(e.currentTarget.value) })}
                disabled={isConnected || isBusy}
              >
                {baudRates.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

            <div className="w-40 flex flex-col items-end justify-start gap-2">
            {!isConnected ? (
              <Button
                type="button"
                onClick={() => void onOpen()}
                disabled={isBusy || !config.path}
                className="w-full flex items-center justify-center gap-1 rounded bg-[var(--accent)] py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent)] disabled:opacity-40"
              >
                <PlugZap size={14} />
                {t("open_port", lang)}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void onClose()}
                disabled={isBusy}
                className="w-full flex items-center justify-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-input)] py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-input)] disabled:opacity-40"
              >
                <Plug size={14} />
                {t("close_port", lang)}
              </Button>
            )}

            <span
              className={`w-full flex items-center justify-center gap-1 rounded py-2 text-xs font-semibold ${
                isConnected
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-[var(--bg-input)] text-[var(--text-muted)]"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isConnected ? "bg-[var(--accent)] shadow-[0_0_6px_#10b981]" : "bg-[var(--text-muted)]"
                }`}
              />
              {isConnected ? t("opened", lang) : t("closed", lang)}
            </span>
          </div>
        </div>
      </div>

      {/* Collapsible advanced */}
      <Button
        type="button"
        onClick={() => setAdvOpen((v) => !v)}
        className="flex w-full items-center gap-1 border-t border-[var(--border)] px-3 py-2 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
      >
        {advOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="font-semibold uppercase tracking-widest">
          {t("advanced", lang)}
        </span>
        <span className="ml-auto text-[10px] opacity-70">
          {config.dataBits}N{config.stopBits}
          {config.parity !== "none" ? ` ${config.parity[0].toUpperCase()}` : ""}
        </span>
      </Button>

      {advOpen && (
        <div className="space-y-3 p-3 pt-0">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="mb-1 text-[10px] text-[var(--text-muted)]">{t("data_bits", lang)}</div>
              <select
                className={sel}
                value={config.dataBits}
                onChange={(e) =>
                  onConfigChange({ ...config, dataBits: e.currentTarget.value as SerialConfig["dataBits"] })
                }
                disabled={isConnected || isBusy}
              >
                {dataBitsOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] text-[var(--text-muted)]">{t("stop_bits", lang)}</div>
              <select
                className={sel}
                value={config.stopBits}
                onChange={(e) =>
                  onConfigChange({ ...config, stopBits: e.currentTarget.value as SerialConfig["stopBits"] })
                }
                disabled={isConnected || isBusy}
              >
                {stopBitsOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] text-[var(--text-muted)]">{t("parity", lang)}</div>
              <select
                className={sel}
                value={config.parity}
                onChange={(e) =>
                  onConfigChange({ ...config, parity: e.currentTarget.value as SerialConfig["parity"] })
                }
                disabled={isConnected || isBusy}
              >
                {parityOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">
            {t("advanced_note", lang)}
          </p>
        </div>
      )}
    </aside>
  );
}