use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::io::AsyncReadExt;
use tokio::net::TcpListener;

use super::rfc2217;
use super::state::*;

#[tauri::command]
pub async fn tcp_server_start(
    app: AppHandle,
    state: tauri::State<'_, TcpAppState>,
    listen_port: u16,
    protocol: String,
) -> Result<(), String> {
    // Cancel existing server
    stop_existing_server(&state).await;
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    let addr = format!("0.0.0.0:{}", listen_port);
    let listener =
        TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("TCP 服务器绑定失败: {}", e))?;

    // Create cancellation channel
    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
    *state.server.cancel_tx.lock().await = Some(cancel_tx);

    let app_clone = app.clone();
    let clients = state.server.clients.clone();
    let is_rfc2217 = protocol == "rfc2217";

    tokio::spawn(async move {
        let mut cancel_rx = cancel_rx;

        loop {
            tokio::select! {
                result = listener.accept() => {
                    match result {
                        Ok((stream, addr)) => {
                            let client_id = format!("{}:{}", addr.ip(), addr.port());
                            let client_addr = addr.to_string();
                            let (mut reader, writer) = stream.into_split();

                            // Add to clients list
                            {
                                let mut clients_guard = clients.lock().await;
                                clients_guard.push(ServerClientEntry {
                                    id: client_id.clone(),
                                    writer: Some(writer),
                                });
                            }

                            let _ = app_clone.emit("tcp-server-client-connected", serde_json::json!({
                                "id": client_id,
                                "address": client_addr,
                            }));

                            // Spawn per-client read loop
                            let app_c2 = app_clone.clone();
                            let clients_c2 = clients.clone();
                            let mut cancel_rx_clone = cancel_rx.clone();

                            tokio::spawn(async move {
                                let mut buf = [0u8; 8192];
                                let mut telnet_state = rfc2217::TelnetState::Data;
                                let mut sb_option = 0u8;
                                let mut sb_buffer = Vec::new();

                                loop {
                                    tokio::select! {
                                        result = reader.read(&mut buf) => {
                                            match result {
                                                Ok(0) | Err(_) => break,
                                                Ok(n) => {
                                                    let raw = &buf[..n];

                                                    if is_rfc2217 {
                                                        // Strip Telnet IAC negotiation bytes
                                                        let (stripped, _commands, _serial_update) =
                                                            rfc2217::process_buffer(raw, &mut telnet_state, &mut sb_option, &mut sb_buffer);

                                                        if !stripped.is_empty() {
                                                            let _ = app_c2.emit("tcp-server-data", serde_json::json!({
                                                                "clientId": client_id,
                                                                "data": stripped,
                                                            }));
                                                        }
                                                    } else {
                                                        let _ = app_c2.emit("tcp-server-data", serde_json::json!({
                                                            "clientId": client_id,
                                                            "data": raw.to_vec(),
                                                        }));
                                                    }
                                                }
                                            }
                                        }
                                        _ = cancel_rx_clone.changed() => {
                                            break;
                                        }
                                    }
                                }

                                // Remove client on disconnect
                                let mut guard = clients_c2.lock().await;
                                guard.retain(|c| c.id != client_id);
                                let _ = app_c2.emit("tcp-server-client-disconnected", serde_json::json!({
                                    "id": client_id,
                                }));
                            });
                        }
                        Err(e) => {
                            let _ = app_clone.emit("tcp-error", serde_json::json!({
                                "message": format!("接受连接失败: {}", e)
                            }));
                        }
                    }
                }
                _ = cancel_rx.changed() => {
                    if *cancel_rx.borrow() {
                        break;
                    }
                }
            }
        }
    });

    let _ = app.emit(
        "tcp-server-started",
        serde_json::json!({ "port": listen_port }),
    );
    Ok(())
}

#[tauri::command]
pub async fn tcp_server_stop(
    app: AppHandle,
    state: tauri::State<'_, TcpAppState>,
) -> Result<(), String> {
    stop_existing_server(&state).await;
    let _ = app.emit("tcp-server-stopped", serde_json::json!({}));
    Ok(())
}

#[tauri::command]
pub async fn tcp_server_broadcast(
    state: tauri::State<'_, TcpAppState>,
    data: Vec<u8>,
) -> Result<(), String> {
    let mut clients = state.server.clients.lock().await;
    let mut failed_ids = Vec::new();

    for client in clients.iter_mut() {
        if let Some(ref mut w) = client.writer {
            if let Err(_) = w.write_all(&data).await {
                failed_ids.push(client.id.clone());
            }
        }
    }

    // Remove failed clients
    clients.retain(|c| !failed_ids.contains(&c.id));

    Ok(())
}

#[tauri::command]
pub async fn tcp_server_disconnect_client(
    state: tauri::State<'_, TcpAppState>,
    client_id: String,
) -> Result<(), String> {
    let mut clients = state.server.clients.lock().await;
    clients.retain(|c| c.id != client_id);
    Ok(())
}

async fn stop_existing_server(state: &TcpAppState) {
    // Signal cancellation
    let mut cancel_guard = state.server.cancel_tx.lock().await;
    if let Some(tx) = cancel_guard.as_ref() {
        let _ = tx.send(true);
    }
    *cancel_guard = None;
    drop(cancel_guard);

    // Clear all clients
    state.server.clients.lock().await.clear();
}
