pub mod client;
pub mod rfc2217;
pub mod server;
pub mod state;

// Only re-export the state type — command functions are referenced via
// their full module paths in lib.rs for Tauri's generate_handler! macro.
pub use state::TcpAppState;
