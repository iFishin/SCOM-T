# SCOM-T User Guide

SCOM-T is a serial debug tool supporting serial port, TCP client / server connections, data send/receive, log analysis, batch command execution, hotkeys and theme customization.

## Contents

- [Quick Start](#quick-start)
- [Connections](#connections)
- [Sending Data](#sending-data)
- [Receive Log](#receive-log)
- [Command Grid & Batch](#command-grid--batch)
- [Hotkeys](#hotkeys)
- [Theme Customization](#theme-customization)
- [Settings](#settings)
- [Tools](#tools)
- [FAQ](#faq)

---

## Quick Start

1. In the left **Port Config** panel, pick a port and baud rate, then click **Open**.
2. Type a command (e.g. `AT`) in the **Send** box and press **Enter** or click **Send**.
3. Watch the device response in the **Receive Log** area.

> Tip: if there is no response, make sure the terminator is `CRLF` (see "Sending Data → Terminator") and the baud rate matches the device.

---

## Connections

### Serial Port

Configure in the **Port Config** panel:

| Item | Description |
|---|---|
| Port | List of available serial devices |
| Baud rate | Common 9600 ~ 921600, must match the device |
| Data bits / Parity / Stop bits | Usually 8 / None / 1, follow the device manual |
| Flow control | None / Software / Hardware, per device needs |

Click **Open** to connect; **Close** to disconnect. While connected you can adjust **RTS / DTR** signal levels.

### TCP Client

Switch connection type to TCP client, fill in **host** and **port**, connect and exchange data with the remote TCP service. TX/RX logs go to the same log area.

### TCP Server

Switch to TCP server to listen on a local port. Connected clients appear in the config panel; use "Send → Broadcast" or "Command Grid → Broadcast Selected" to push data to all clients.

### Serial Data Timing

If a device splits one line into several USB packets and logs get truncated (half-command fragments), raise the **Idle Flush** value under **Settings → Log → Serial Data Timing** (default 50ms). Usually no change is needed.

---

## Sending Data

### Input & Send

- Type in the input box and press **Enter** to send; **Shift+Enter** or **Alt+Enter** inserts a newline (expand the input first).
- Use the expand icon next to the input for multi-line editing.

### ASCII / HEX Modes

- **ASCII**: plain text.
- **HEX**: hex bytes, e.g. `41 54` (= `AT`), separated by spaces.
- Quick **ASCII→HEX** / **HEX→ASCII** conversion buttons are provided.

### Terminator

A terminator can be appended to the command bytes, chosen from the dropdown:

| Option | Bytes | Note |
|---|---|---|
| CRLF | `0D 0A` | Common (recommended for AT) |
| LF | `0A` | Unix newline |
| CR | `0D` | Carriage return |
| None | none | Not appended |

The log shows the actual appended terminator as bytes, e.g. `AT+QBLEINIT=2,0 [0D 0A]`.

### Custom Terminators

In **Settings → Command Line**, define custom terminators as hex byte sequences (e.g. `0D 0A 1A`). They appear automatically in **all** terminator dropdowns (send panel, command grid, hotkeys, response-set editor).

### Multiple Sessions

Use the top tabs to create multiple sessions, each with its own serial connection and logs.

---

## Receive Log

### Display Modes

| Mode | Description |
|---|---|
| Card | Adjacent same-source data merged into cards, collapsible |
| Text | Line-by-line TX / RX, easy to read and copy |
| HEX | Hex dump with ASCII column |

Switch modes from the toolbar; timestamp format is set under **Settings → Log → Log Timestamp** (Time only / Date & Time / None).

### Search

The log area supports search highlighting with **case-sensitive**, **regex**, and **whole-word** options, plus jump to previous / next match.

### Copy

- Copy a **partial selection**: copies exactly the selected text.
- Copy after **Ctrl+A select-all** (or no selection): exports fully formatted logs (`[RX] [timestamp] content`) with empty lines filtered out.

### Log Management

- **Save to file**: write current logs to a text file; enable **real-time** writing.
- **Log Manager**: view saved logs, delete, or edit as text.
- **Clear**: clear all / received / sent logs separately.

---

## Command Grid & Batch

### Command Grid

Each row is one command:

| Column | Description |
|---|---|
| Send | Send this row's command (Enter also works) |
| Command | AT command or custom text |
| HEX | Send as hex when checked |
| Terminator | Per-row terminator (incl. custom) |
| Interval | Send interval or response wait timeout (ms) |

Click the chevron at the row end to expand **Expected Responses**, capture actual responses, and save to a response set.

### Expected Response Matching

After expanding a row, configure **expected responses** and wait for each device reply, with **text / regex** modes; the row is marked successful when all match.

### Batch Execution

- Select multiple rows, set **loop count**, click **Execute Selected**.
- **Stop** anytime.
- Each row runs with its configured interval and expected-response wait.

### Batch Editor

The **Batch** tab provides a line-numbered editor:
- Paste multi-line commands to auto-fill the grid
- **Ctrl+F** search/replace, **Ctrl+Z / Ctrl+Y** undo/redo
- Built-in **regex clean** presets (e.g. strip timestamps, keep only AT lines)

### YAML Config

The **Config** tab edits `prompts.yaml` directly (command, HEX mode, terminator, timeout, etc.), with save/load named configs and open-config-dir. Grid changes auto-sync back to the file.

### Response Sets

The **Response Set** tab manages sets of "command + expected responses" for reuse and import into the grid.

---

## Hotkeys

### Built-in Shortcuts

| Shortcut | Action |
|---|---|
| Enter | Send command (send box focused) |
| Shift+Enter / Alt+Enter | Insert newline in send box |
| Ctrl+A | Select all log |
| Ctrl+F | Search in batch editor |
| Ctrl+Z / Ctrl+Y | Undo / redo in batch editor |

### Command Hotkeys

In **Settings → Hotkeys**, configure shortcuts for commands (Ctrl / Alt + any key, globally triggered even in inputs), or set a hotkey to a **built-in action** (clear logs, refresh ports, close port, etc.). The **Shortcuts** dialog in the Help menu shows the current mapping.

---

## Theme Customization

Deeply personalize the UI in **Settings → Theme**:

### Base Colors

Primary background, surface background, input background, primary text, muted text, border, accent.

### Advanced Colors

Hover background, placeholder text, focus border, and the dark / light / muted shades of the accent.

### Radius & Spacing

Small / medium / large radius, panel padding, control gap (in rem, scaling with UI font size).

### Style Presets

One-click **Classic / Modern / Flat** presets; manually tweaking any value marks the theme as **Custom**.

### Fonts

UI font, mono font (logs), font size (10–24px), font weight. Font size affects global text (logs, command grid, inputs) and rem-based spacing proportionally.

> Switch light / dark mode in **Settings → General** or the Theme tab header.

---

## Settings

Open **Settings** from the top toolbar:

| Tab | Description |
|---|---|
| General | Light/dark mode, language, compact mode, close behavior (tray/exit), log retention, port filter, multi-instance |
| Log | Timestamp format, serial data timing (idle flush / render batch) |
| Hotkeys | Command hotkeys |
| Theme | Theme personalization (above) |
| Layout | Classic / grid layout and grid item adjustments |
| Command Line | Custom terminators |
| Mock Serial | Built-in response simulation for no-hardware debugging |
| Marketplace | Cloud command/response-set marketplace config |

---

## Tools

The **Tools** menu in the toolbar provides:
- **Codec**: ASCII / HEX / Base64 / Binary / URL conversion, both encode and decode directions.
- **String Tools**: string generation and checking.
- **View**: signal status (RTS/DTR/CTS…), traffic stats, health check, waveform.

The toolbar also has **Help** (tour, docs, shortcuts, about), **Logs** (app log viewer), and **Marketplace** entries.

---

## FAQ

**Q: AT command gets no response or ERROR?**
Make sure the terminator is CRLF and the baud/parity/stop bits match the device. If the device previously received an unterminated (no `\r`) command, it may concatenate the next command — always keep CRLF.

**Q: What does `AT... [0D 0A]` in the log mean?**
The log shows the actual appended terminator as bytes; it means `0D 0A` (CRLF) was really sent, not literal text.

**Q: Received logs are truncated to half commands?**
If the device splits a line into multiple USB packets, raise the **Idle Flush** under **Settings → Log → Serial Data Timing** (e.g. 100ms).

**Q: Copied timestamps have no `[ ]` separators?**
That was old behavior. In current versions, Ctrl+A select-all copy exports `[RX] [timestamp] content`; partial selections copy the literal text.

**Q: Some text doesn't follow the theme font size?**
Please ensure you are on the latest version. Font size affects global text and rem spacing; icon sizes intentionally do not scale.

**Q: Help docs fail to load?**
Online docs require network. Check the connection and click **Retry**, or configure a custom `helpUrl` mirror in settings.

**Q: Port open fails or is busy?**
Close other programs using the port; try **Settings → General → Port Filter** to show all ports.
