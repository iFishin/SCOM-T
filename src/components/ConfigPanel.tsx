import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  PlugZap,
  Plug,
  Globe,
  Server,
} from "lucide-react";
import { Button } from "./ui/Button";
import type {
  ConnectionType,
  PortSummary,
  SerialConfig,
  SelectOption,
  TcpClientInfo,
  TcpConnectionStatus,
  TcpProtocol,
  TcpServerStatus,
} from "../hooks/useSerialPort.ts";
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
  // TCP state
  tcpConnectionStatus: TcpConnectionStatus;
  tcpServerStatus: TcpServerStatus;
  tcpServerClients: TcpClientInfo[];
  onRefresh: () => Promise<void>;
  onConfigChange: (config: SerialConfig) => void;
  onOpen: () => Promise<void>;
  onClose: () => Promise<void>;
  onSetSignals?: (rts: boolean, dtr: boolean) => void;
};

const CONNECTION_TYPES: ConnectionType[] = ["serial", "tcp-client", "tcp-server"];

const PROTOCOL_OPTIONS: { label: string; value: TcpProtocol }[] = [
  { label: "RFC 2217", value: "rfc2217" },
  { label: "Raw TCP", value: "raw" },
];

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
  tcpConnectionStatus,
  tcpServerStatus,
  tcpServerClients,
  onRefresh,
  onConfigChange,
  onOpen,
  onClose,
  onSetSignals,
}: ConfigPanelProps) {
  const [advOpen, setAdvOpen] = useState(false);

  const isSerialMode = config.connectionType === "serial";
  const isTcpClient = config.connectionType === "tcp-client";
  const isTcpServer = config.connectionType === "tcp-server";

  function setConnectionType(ct: ConnectionType) {
    onConfigChange({ ...config, connectionType: ct });
  }

  const isTcpConnecting = tcpConnectionStatus === "connecting";

  const isServerRunning = tcpServerStatus === "running";
  const isServerStarting = tcpServerStatus === "starting";

  return (
    <aside className="shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="space-y-3 p-3">
        {/* ── Connection type selector ── */}
        <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] p-0.5">
          {CONNECTION_TYPES.map((ct) => (
            <button
              key={ct}
              type="button"
              onClick={() => setConnectionType(ct)}
              disabled={isConnected || isBusy}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-all ${
                config.connectionType === ct
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              } disabled:opacity-40`}
            >
              {ct === "serial" && <Plug size={13} />}
              {ct === "tcp-client" && <Globe size={13} />}
              {ct === "tcp-server" && <Server size={13} />}
              <span>
                {ct === "serial"
                  ? t("connection_serial", lang)
                  : ct === "tcp-client"
                    ? t("connection_tcp_client", lang)
                    : t("connection_tcp_server", lang)}
              </span>
            </button>
          ))}
        </div>

        {/* ── Serial mode ── */}
        {isSerialMode && (
          <div className="grid grid-cols-[auto_auto_1fr] items-center gap-x-3 gap-y-1">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">{t("port", lang)}</label>
            <label className="text-[11px] font-medium text-[var(--text-muted)]">{t("baud", lang)}</label>
            <div></div>

            <select
              className={`${sel} max-w-44 truncate`}
              title={config.path}
              value={config.path}
              onMouseDown={() => void onRefresh()}
              onChange={(e) => onConfigChange({ ...config, path: e.currentTarget.value })}
              disabled={isConnected || isBusy}
            >
              <option value="">{t("select_port", lang)}</option>
              {ports.map((p) => (
                <option key={p.path} value={p.path}>{p.label}</option>
              ))}
            </select>
            <select
              className={sel}
              value={config.baudRate}
              onChange={(e) => onConfigChange({ ...config, baudRate: Number(e.currentTarget.value) })}
              disabled={isConnected || isBusy}
            >
              {baudRates.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
              {!isConnected ? (
                <Button
                  type="button"
                  onClick={() => void onOpen()}
                  disabled={isBusy || !config.path}
                  className="flex items-center justify-center gap-1 rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent)] disabled:opacity-40"
                >
                  <PlugZap size={13} />
                  {t("open_port", lang)}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => void onClose()}
                  disabled={isBusy}
                  className="flex items-center justify-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-input)] disabled:opacity-40"
                >
                  <Plug size={13} />
                  {t("close_port", lang)}
                </Button>
              )}
              <span
                className={`flex items-center gap-1 rounded px-2 py-1.5 text-[11px] font-semibold ${
                  isConnected
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-[var(--bg-input)] text-[var(--text-muted)]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isConnected ? "bg-[var(--accent)] shadow-[0_0_6px_#10b981]" : "bg-[var(--text-muted)]"
                  }`}
                />
                {isConnected ? t("opened", lang) : t("closed", lang)}
              </span>
            </div>
          </div>
        )}

        {/* ── TCP Client mode ── */}
        {isTcpClient && (
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 gap-y-1">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">{t("tcp_host", lang)}</label>
            <label className="text-[11px] font-medium text-[var(--text-muted)]">{t("tcp_port", lang)}</label>
            <label className="text-[11px] font-medium text-[var(--text-muted)]">{t("tcp_protocol", lang)}</label>
            <div></div>

            <input
              className={sel}
              type="text"
              placeholder="192.168.1.100"
              value={config.tcpHost}
              onChange={(e) => onConfigChange({ ...config, tcpHost: e.currentTarget.value })}
              disabled={isConnected || isBusy}
            />
            <input
              className={sel}
              type="number"
              min={1}
              max={65535}
              value={config.tcpPort}
              onChange={(e) => onConfigChange({ ...config, tcpPort: Number(e.currentTarget.value) })}
              disabled={isConnected || isBusy}
            />
            <select
              className={sel}
              value={config.tcpProtocol}
              onChange={(e) =>
                onConfigChange({ ...config, tcpProtocol: e.currentTarget.value as TcpProtocol })
              }
              disabled={isConnected || isBusy}
            >
              {PROTOCOL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
              {!isConnected ? (
                <Button
                  type="button"
                  onClick={() => void onOpen()}
                  disabled={isBusy || isTcpConnecting || !config.tcpHost || !config.tcpPort}
                  className="flex items-center justify-center gap-1 rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent)] disabled:opacity-40"
                >
                  <Globe size={13} />
                  {isTcpConnecting ? t("tcp_connecting", lang) : t("tcp_connect", lang)}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => void onClose()}
                  disabled={isBusy}
                  className="flex items-center justify-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-input)] disabled:opacity-40"
                >
                  <Plug size={13} />
                  {t("tcp_disconnect", lang)}
                </Button>
              )}
              <span
                className={`flex items-center gap-1 rounded px-2 py-1.5 text-[11px] font-semibold ${
                  isConnected
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-[var(--bg-input)] text-[var(--text-muted)]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isConnected ? "bg-[var(--accent)] shadow-[0_0_6px_#10b981]" : "bg-[var(--text-muted)]"
                  }`}
                />
                {isConnected ? t("tcp_connected_status", lang) : t("tcp_disconnected_status", lang)}
              </span>
            </div>
          </div>
        )}

        {/* ── TCP Server mode ── */}
        {isTcpServer && (
          <>
            <div className="grid grid-cols-[auto_auto_1fr] items-center gap-x-3 gap-y-1">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">{t("port", lang)}</label>
              <label className="text-[11px] font-medium text-[var(--text-muted)]">{t("baud", lang)}</label>
              <div></div>

              <select
                className={`${sel} max-w-44 truncate`}
                title={config.path}
                value={config.path}
                onMouseDown={() => void onRefresh()}
                onChange={(e) => onConfigChange({ ...config, path: e.currentTarget.value })}
                disabled={isConnected || isBusy}
              >
                <option value="">{t("select_port", lang)}</option>
                {ports.map((p) => (
                  <option key={p.path} value={p.path}>{p.label}</option>
                ))}
              </select>
              <select
                className={sel}
                value={config.baudRate}
                onChange={(e) => onConfigChange({ ...config, baudRate: Number(e.currentTarget.value) })}
                disabled={isConnected || isBusy}
              >
                {baudRates.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <div className="flex items-center gap-1.5">
                {!isServerRunning ? (
                  <Button
                    type="button"
                    onClick={() => void onOpen()}
                    disabled={isBusy || isServerStarting || !config.path}
                    className="flex items-center justify-center gap-1 rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent)] disabled:opacity-40"
                  >
                    <Server size={13} />
                    {isServerStarting ? t("tcp_server_starting", lang) : t("tcp_server_start", lang)}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => void onClose()}
                    disabled={isBusy}
                    className="flex items-center justify-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-input)] disabled:opacity-40"
                  >
                    <Server size={13} />
                    {t("tcp_server_stop", lang)}
                  </Button>
                )}
                <span
                  className={`flex items-center gap-1 rounded px-2 py-1.5 text-[11px] font-semibold ${
                    isServerRunning
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-[var(--bg-input)] text-[var(--text-muted)]"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isServerRunning ? "bg-[var(--accent)] shadow-[0_0_6px_#10b981]" : "bg-[var(--text-muted)]"
                    }`}
                  />
                  {isServerRunning ? t("tcp_server_running", lang) : t("tcp_server_stopped_status", lang)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-28">
                <label className="text-[11px] font-medium text-[var(--text-muted)]">{t("tcp_server_listen_port", lang)}</label>
                <input
                  className={`${sel} mt-1`}
                  type="number"
                  min={1}
                  max={65535}
                  value={config.tcpPort}
                  onChange={(e) => onConfigChange({ ...config, tcpPort: Number(e.currentTarget.value) })}
                  disabled={isServerRunning || isBusy}
                />
              </div>
              <div className="pt-5 text-[10px] text-[var(--text-muted)] leading-tight">
                {t("tcp_server_hint", lang)}
              </div>

              <div className="ml-auto pt-5">
                <label className="text-[11px] font-medium text-[var(--text-muted)]">
                  {t("tcp_server_clients", lang)} ({tcpServerClients.length})
                </label>
              </div>
            </div>

            {/* Connected clients list */}
            {tcpServerClients.length > 0 && (
              <div className="max-h-20 overflow-y-auto rounded border border-[var(--border)] bg-[var(--bg-input)] p-1">
                {tcpServerClients.map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center gap-2 rounded px-2 py-0.5 text-[10px] text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span className="truncate">{client.address}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Collapsible Advanced (serial params) ── */}
      <Button
        type="button"
        onClick={() => setAdvOpen((v) => !v)}
        className="flex w-full items-center gap-1 border-t border-[var(--border)] px-3 py-2 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
      >
        {advOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="font-semibold uppercase tracking-widest">
          {t("advanced", lang)}
        </span>
        {isTcpClient && config.tcpProtocol === "rfc2217" && (
          <span className="ml-1 text-[9px] opacity-70">RFC 2217</span>
        )}
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

          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="mb-1 text-[10px] text-[var(--text-muted)]">{t("flow_control", lang)}</div>
              <select
                className={sel}
                value={config.flowControl}
                onChange={(e) =>
                  onConfigChange({ ...config, flowControl: e.currentTarget.value as SerialConfig["flowControl"] })
                }
                disabled={isConnected || isBusy}
              >
                <option value="none">{t("flow_control_none", lang)}</option>
                <option value="software">{t("flow_control_software", lang)}</option>
                <option value="hardware">{t("flow_control_hardware", lang)}</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] text-[var(--text-muted)]">{t("rts", lang)}</div>
              <select
                className={sel}
                value={config.rts ? "high" : "low"}
                onChange={(e) => {
                  const rts = e.currentTarget.value === "high";
                  onConfigChange({ ...config, rts });
                  if (isConnected && onSetSignals) onSetSignals(rts, config.dtr);
                }}
                disabled={isBusy}
              >
                <option value="high">High (1)</option>
                <option value="low">Low (0)</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] text-[var(--text-muted)]">{t("dtr", lang)}</div>
              <select
                className={sel}
                value={config.dtr ? "high" : "low"}
                onChange={(e) => {
                  const dtr = e.currentTarget.value === "high";
                  onConfigChange({ ...config, dtr });
                  if (isConnected && onSetSignals) onSetSignals(config.rts, dtr);
                }}
                disabled={isBusy}
              >
                <option value="high">High (1)</option>
                <option value="low">Low (0)</option>
              </select>
            </div>
          </div>

          <p className="text-[10px] text-[var(--text-muted)]">
            {isTcpClient && config.tcpProtocol === "rfc2217"
              ? "RFC 2217 模式下，串口参数将通过 Telnet 协商发送到远程设备。"
              : isTcpServer
                ? "串口参数用于本地串口连接，TCP 客户端通过 RFC 2217 协商可修改这些参数。"
                : t("advanced_note", lang)}
          </p>
        </div>
      )}
    </aside>
  );
}
