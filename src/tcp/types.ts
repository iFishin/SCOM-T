// ── Connection type ──

export type ConnectionType = "serial" | "tcp-client" | "tcp-server";
export type TcpProtocol = "raw" | "rfc2217";
export type TcpConnectionStatus = "disconnected" | "connecting" | "connected";
export type TcpServerStatus = "stopped" | "starting" | "running";

export type TcpClientInfo = {
  id: string;
  address: string;
};
