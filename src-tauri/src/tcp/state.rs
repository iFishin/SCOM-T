use serde::Serialize;
use std::sync::Arc;
use tokio::sync::watch;
use tokio::sync::Mutex;

#[derive(Clone, Copy, PartialEq, Debug, Serialize)]
pub enum Protocol {
    Raw,
    Rfc2217,
}

impl Protocol {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "rfc2217" | "rfc_2217" => Protocol::Rfc2217,
            _ => Protocol::Raw,
        }
    }
}

pub struct TcpClientState {
    /// Watch channel sender — send true to cancel the read loop
    pub cancel_tx: Arc<Mutex<Option<watch::Sender<bool>>>>,
    /// Channel for sending data to the read loop task (which owns the writer)
    pub send_tx: Arc<Mutex<Option<tokio::sync::mpsc::UnboundedSender<Vec<u8>>>>>,
    /// Active protocol mode
    pub protocol: Arc<Mutex<Protocol>>,
}

impl Default for TcpClientState {
    fn default() -> Self {
        Self {
            cancel_tx: Arc::new(Mutex::new(None)),
            send_tx: Arc::new(Mutex::new(None)),
            protocol: Arc::new(Mutex::new(Protocol::Raw)),
        }
    }
}

/// Info about a connected TCP client — reserved for future UI use.
#[allow(dead_code)]
#[derive(Clone, Debug, Serialize)]
pub struct TcpClientInfo {
    pub id: String,
    pub address: String,
}

pub struct ServerClientEntry {
    pub id: String,
    pub writer: Option<tokio::net::tcp::OwnedWriteHalf>,
}

pub struct TcpServerState {
    /// Watch channel sender — send true to cancel the accept loop
    pub cancel_tx: Arc<Mutex<Option<watch::Sender<bool>>>>,
    pub clients: Arc<Mutex<Vec<ServerClientEntry>>>,
}

impl Default for TcpServerState {
    fn default() -> Self {
        Self {
            cancel_tx: Arc::new(Mutex::new(None)),
            clients: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

pub struct TcpAppState {
    pub client: TcpClientState,
    pub server: TcpServerState,
}

impl Default for TcpAppState {
    fn default() -> Self {
        Self {
            client: TcpClientState::default(),
            server: TcpServerState::default(),
        }
    }
}
