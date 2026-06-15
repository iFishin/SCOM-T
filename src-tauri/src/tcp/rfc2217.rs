//! RFC 2217 — Telnet COM Port Control protocol implementation.
//!
//! Provides a state machine for parsing Telnet IAC sequences and
//! functions for constructing RFC 2217 subnegotiation commands.
//!
//! Many constants and builders here are reserved for future RFC 2217
//! sub-commands — suppressing dead_code rather than removing them.

#![allow(dead_code)]

// Telnet constants
pub const IAC: u8 = 0xFF;
pub const WILL: u8 = 0xFB;
pub const WONT: u8 = 0xFC;
pub const DO: u8 = 0xFD;
pub const DONT: u8 = 0xFE;
pub const SB: u8 = 0xFA;
pub const SE: u8 = 0xF0;

pub const COM_PORT_OPTION: u8 = 44;

// RFC 2217 sub-commands
pub const SET_BAUDRATE: u8 = 1;
pub const SET_DATASIZE: u8 = 2;
pub const SET_PARITY: u8 = 3;
pub const SET_STOPSIZE: u8 = 4;
pub const SET_CONTROL: u8 = 5;
pub const NOTIFY_LINESTATE: u8 = 6;
pub const NOTIFY_MODEMSTATE: u8 = 7;
pub const FLOWCONTROL_SUSPEND: u8 = 8;
pub const FLOWCONTROL_RESUME: u8 = 9;
pub const SET_LINESTATE_MASK: u8 = 10;
pub const SET_MODEMSTATE_MASK: u8 = 11;
pub const PURGE_DATA: u8 = 12;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum TelnetState {
    Data,
    Iac,
    Will,
    Wont,
    Do,
    Dont,
    Sb,
    SbData(u8),
}

/// Result from processing one byte through the Telnet state machine.
pub struct ProcessResult {
    /// Data byte to pass through to the application (None if consumed by Telnet)
    pub data: Option<u8>,
    /// IAC commands that should be sent back to the remote side
    pub commands: Vec<u8>,
    /// Debounced/signalled serial parameter changes from remote
    pub serial_update: Option<SerialUpdate>,
}

#[derive(Debug, Clone)]
pub struct SerialUpdate {
    pub baud_rate: Option<u32>,
    pub data_size: Option<u8>,
    pub parity: Option<u8>,
    pub stop_size: Option<u8>,
}

impl Default for ProcessResult {
    fn default() -> Self {
        Self {
            data: None,
            commands: Vec::new(),
            serial_update: None,
        }
    }
}

/// Process a single byte through the Telnet IAC state machine.
pub fn process_byte(
    byte: u8,
    state: &mut TelnetState,
    sb_option: &mut u8,
    sb_buffer: &mut Vec<u8>,
) -> ProcessResult {
    let mut result = ProcessResult::default();

    match *state {
        TelnetState::Data => {
            if byte == IAC {
                *state = TelnetState::Iac;
            } else {
                result.data = Some(byte);
            }
        }

        TelnetState::Iac => {
            match byte {
                WILL => *state = TelnetState::Will,
                WONT => *state = TelnetState::Wont,
                DO => *state = TelnetState::Do,
                DONT => *state = TelnetState::Dont,
                SB => *state = TelnetState::Sb,
                // Escaped IAC (0xFF 0xFF → single 0xFF)
                IAC => {
                    result.data = Some(IAC);
                    *state = TelnetState::Data;
                }
                SE => {
                    // Ignore spurious SE
                    *state = TelnetState::Data;
                }
                _ => {
                    // Unknown command, ignore
                    *state = TelnetState::Data;
                }
            }
        }

        TelnetState::Will => {
            let option = byte;
            *state = TelnetState::Data;

            if option == COM_PORT_OPTION {
                // Remote wants to offer COM PORT CONTROL — we DO it
                result.commands = vec![IAC, DO, COM_PORT_OPTION];
            } else {
                // Reject other options
                result.commands = vec![IAC, DONT, option];
            }
        }

        TelnetState::Wont => {
            *state = TelnetState::Data;
        }

        TelnetState::Do => {
            let option = byte;
            *state = TelnetState::Data;

            if option == COM_PORT_OPTION {
                // Remote wants us to enable COM PORT CONTROL — we WILL it
                result.commands = vec![IAC, WILL, COM_PORT_OPTION];
            } else {
                // Refuse other options
                result.commands = vec![IAC, WONT, option];
            }
        }

        TelnetState::Dont => {
            *state = TelnetState::Data;
        }

        TelnetState::Sb => {
            *sb_option = byte;
            *sb_buffer = Vec::new();
            *state = TelnetState::SbData(byte);
        }

        TelnetState::SbData(opt) => {
            if byte == IAC {
                // Could be end of subnegotiation (IAC SE) or escaped IAC
                // We need to look ahead — but we're processing byte by byte
                // Transition to a state where we handle this
                *state = TelnetState::Iac;
                // For IAC within SB data, it might be an escaped IAC
                // But we need the next byte to know. If the next byte is SE,
                // this IAC is part of the end marker, not data.
                // If the next byte is IAC, it's an escaped 0xFF.
                // We save this IAC and handle it on the next call.
                // For simplicity, append the IAC into sb_buffer and handle in Iac state.
                // Actually we need a different approach. Let's push a marker.
                sb_buffer.push(IAC);
                // We'll strip trailing IAC+SE after processing all bytes
            } else if byte == SE {
                // Subnegotiation end — but we might have pushed a false IAC
                // Remove trailing IAC that was actually the IAC before SE
                if sb_buffer.last() == Some(&IAC) {
                    sb_buffer.pop();
                }
                process_subnegotiation(opt, sb_buffer, &mut result);
                *state = TelnetState::Data;
                *sb_buffer = Vec::new();
            } else {
                sb_buffer.push(byte);
            }
        }
    }

    result
}

/// Process a complete subnegotiation buffer.
fn process_subnegotiation(option: u8, data: &[u8], result: &mut ProcessResult) {
    if option != COM_PORT_OPTION {
        return;
    }

    if data.is_empty() {
        return;
    }

    let cmd = data[0];

    match cmd {
        SET_BAUDRATE if data.len() >= 5 => {
            let rate = u32::from_le_bytes([data[1], data[2], data[3], data[4]]);
            result.serial_update = Some(SerialUpdate {
                baud_rate: Some(rate),
                data_size: None,
                parity: None,
                stop_size: None,
            });
        }
        SET_DATASIZE if data.len() >= 2 => {
            let size = data[1];
            result.serial_update = Some(SerialUpdate {
                baud_rate: None,
                data_size: Some(size),
                parity: None,
                stop_size: None,
            });
        }
        SET_PARITY if data.len() >= 2 => {
            let parity = data[1];
            result.serial_update = Some(SerialUpdate {
                baud_rate: None,
                data_size: None,
                parity: Some(parity),
                stop_size: None,
            });
        }
        SET_STOPSIZE if data.len() >= 2 => {
            let stop = data[1];
            result.serial_update = Some(SerialUpdate {
                baud_rate: None,
                data_size: None,
                parity: None,
                stop_size: Some(stop),
            });
        }
        _ => {
            // Unsupported command — ignore
        }
    }
}

/// Build IAC DO COM_PORT_OPTION — request/enable RFC 2217 on the remote end.
pub fn build_do_com_port() -> Vec<u8> {
    vec![IAC, DO, COM_PORT_OPTION]
}

/// Build IAC WILL COM_PORT_OPTION — announce RFC 2217 capability.
pub fn build_will_com_port() -> Vec<u8> {
    vec![IAC, WILL, COM_PORT_OPTION]
}

/// Build RFC 2217 SET-BAUDRATE subnegotiation (32-bit unsigned LE).
pub fn build_set_baudrate(rate: u32) -> Vec<u8> {
    let mut buf = vec![IAC, SB, COM_PORT_OPTION, SET_BAUDRATE];
    buf.extend_from_slice(&rate.to_le_bytes());
    buf.push(IAC);
    buf.push(SE);
    buf
}

/// Build RFC 2217 SET-DATASIZE subnegotiation.
pub fn build_set_datasize(bits: u8) -> Vec<u8> {
    vec![IAC, SB, COM_PORT_OPTION, SET_DATASIZE, bits, IAC, SE]
}

/// Build RFC 2217 SET-PARITY subnegotiation.
/// Parity values: 0=None, 1=Odd, 2=Even, 3=Mark, 4=Space
pub fn build_set_parity(parity: u8) -> Vec<u8> {
    vec![IAC, SB, COM_PORT_OPTION, SET_PARITY, parity, IAC, SE]
}

/// Build RFC 2217 SET-STOPSIZE subnegotiation.
/// Stop size: 1=1, 2=2, 3=1.5
pub fn build_set_stopsize(stop: u8) -> Vec<u8> {
    vec![IAC, SB, COM_PORT_OPTION, SET_STOPSIZE, stop, IAC, SE]
}

/// Escape 0xFF bytes in data for RFC 2217 transmission (double them).
pub fn escape_iac(data: &[u8]) -> Vec<u8> {
    let mut result = Vec::with_capacity(data.len());
    for &b in data {
        result.push(b);
        if b == IAC {
            result.push(IAC);
        }
    }
    result
}

/// Process a complete stream buffer through the Telnet state machine.
/// Returns the stripped data bytes and any commands to send back.
pub fn process_buffer(
    buf: &[u8],
    state: &mut TelnetState,
    sb_option: &mut u8,
    sb_buffer: &mut Vec<u8>,
) -> (Vec<u8>, Vec<u8>, Option<SerialUpdate>) {
    let mut data_out = Vec::with_capacity(buf.len());
    let mut commands = Vec::new();
    let mut serial_update: Option<SerialUpdate> = None;

    for &byte in buf {
        let r = process_byte(byte, state, sb_option, sb_buffer);
        if let Some(d) = r.data {
            data_out.push(d);
        }
        commands.extend_from_slice(&r.commands);
        if r.serial_update.is_some() {
            serial_update = r.serial_update;
        }
    }

    (data_out, commands, serial_update)
}
