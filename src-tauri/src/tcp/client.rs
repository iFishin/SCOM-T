use tauri::{AppHandle, Emitter};
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;

use super::rfc2217;
use super::state::*;

#[tauri::command]
pub async fn tcp_connect(
    app: AppHandle,
    state: tauri::State<'_, TcpAppState>,
    host: String,
    port: u16,
    protocol: String,
) -> Result<(), String> {
    // Cancel existing connection first
    cancel_existing_client(&state).await;

    let addr = format!("{}:{}", host, port);
    let stream = TcpStream::connect(&addr)
        .await
        .map_err(|e| format!("TCP 连接失败: {}", e))?;

    let (mut reader, mut writer) = stream.into_split();
    let proto = Protocol::from_str(&protocol);
    *state.client.protocol.lock().await = proto;

    // Create channels: watch for cancel, mpsc for send
    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
    *state.client.cancel_tx.lock().await = Some(cancel_tx);

    let (send_tx, mut send_rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();
    *state.client.send_tx.lock().await = Some(send_tx);

    // If RFC 2217, send WILL COM PORT OPTION to start negotiation
    if proto == Protocol::Rfc2217 {
        let _ = writer.write_all(&rfc2217::build_will_com_port()).await;
    }

    // Emit connected event
    let _ = app.emit(
        "tcp-connected",
        serde_json::json!({
            "host": host,
            "port": port,
            "protocol": protocol,
        }),
    );

    // Spawn read loop — owns both reader and writer
    let app_clone = app.clone();
    let mut cancel_rx = cancel_rx;

    tokio::spawn(async move {
        let mut buf = [0u8; 8192];
        let mut telnet_state = rfc2217::TelnetState::Data;
        let mut sb_option = 0u8;
        let mut sb_buffer = Vec::new();

        loop {
            tokio::select! {
                result = reader.read(&mut buf) => {
                    match result {
                        Ok(0) => {
                            let _ = app_clone.emit("tcp-disconnected", serde_json::json!({
                                "reason": "远程连接已关闭"
                            }));
                            break;
                        }
                        Ok(n) => {
                            let raw = &buf[..n];

                            if proto == Protocol::Rfc2217 {
                                let (stripped, commands, _serial_update) =
                                    rfc2217::process_buffer(raw, &mut telnet_state, &mut sb_option, &mut sb_buffer);

                                // Send IAC response commands directly (we own the writer)
                                if !commands.is_empty() {
                                    let _ = writer.write_all(&commands).await;
                                }

                                if !stripped.is_empty() {
                                    let _ = app_clone.emit("tcp-data", serde_json::json!({
                                        "data": stripped
                                    }));
                                }
                            } else {
                                // Raw TCP — emit all data as-is
                                let _ = app_clone.emit("tcp-data", serde_json::json!({
                                    "data": raw.to_vec()
                                }));
                            }
                        }
                        Err(e) => {
                            let _ = app_clone.emit("tcp-disconnected", serde_json::json!({
                                "reason": format!("TCP 连接异常断开: {}", e)
                            }));
                            break;
                        }
                    }
                }
                _ = cancel_rx.changed() => {
                    if *cancel_rx.borrow() {
                        break;
                    }
                }
                Some(data) = send_rx.recv() => {
                    // Data from tcp_send command — write to TCP stream
                    let bytes_to_send = if proto == Protocol::Rfc2217 {
                        rfc2217::escape_iac(&data)
                    } else {
                        data
                    };
                    if let Err(e) = writer.write_all(&bytes_to_send).await {
                        let _ = app_clone.emit("tcp-disconnected", serde_json::json!({
                            "reason": format!("TCP 发送失败: {}", e)
                        }));
                        break;
                    }
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn tcp_disconnect(
    app: AppHandle,
    state: tauri::State<'_, TcpAppState>,
) -> Result<(), String> {
    cancel_existing_client(&state).await;
    let _ = app.emit(
        "tcp-disconnected",
        serde_json::json!({ "reason": "用户断开连接" }),
    );
    Ok(())
}

#[tauri::command]
pub async fn tcp_send(
    state: tauri::State<'_, TcpAppState>,
    data: Vec<u8>,
) -> Result<(), String> {
    let send_guard = state.client.send_tx.lock().await;
    let sender = send_guard
        .as_ref()
        .ok_or_else(|| "TCP 未连接，无法发送".to_string())?;

    sender
        .send(data)
        .map_err(|_| "TCP 发送通道已关闭".to_string())?;

    Ok(())
}

/// Cancel any existing TCP client connection.
async fn cancel_existing_client(state: &TcpAppState) {
    // Signal cancellation via watch channel
    let mut cancel_guard = state.client.cancel_tx.lock().await;
    if let Some(tx) = cancel_guard.as_ref() {
        let _ = tx.send(true);
    }
    *cancel_guard = None;
    drop(cancel_guard);

    // Drop the send channel to unblock the read loop
    let mut send_guard = state.client.send_tx.lock().await;
    *send_guard = None;
    drop(send_guard);

    // Small delay for background task to clean up
    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
}

/// Send raw bytes over TCP (for RFC 2217 response commands from IAC negotiation).
#[tauri::command]
pub async fn tcp_send_raw(
    state: tauri::State<'_, TcpAppState>,
    data: Vec<u8>,
) -> Result<(), String> {
    // Same as tcp_send but without IAC escaping (for already-encoded Telnet commands)
    let send_guard = state.client.send_tx.lock().await;
    let sender = send_guard
        .as_ref()
        .ok_or_else(|| "TCP 未连接".to_string())?;

    sender
        .send(data)
        .map_err(|_| "TCP 发送通道已关闭".to_string())?;

    Ok(())
}
