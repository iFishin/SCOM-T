/**
 * SerialTextFramer — Byte-preserving line-based text framing for serial data.
 *
 * Responsibilities:
 * - Preserve every received byte without loss or duplication
 * - Split incoming data by LF (0x0A) line endings (CRLF and LF both supported)
 * - Keep track of incomplete lines (pending bytes awaiting a newline)
 * - Provide non-destructive access to pending data (snapshot/idle view)
 * - Drain all accumulated lines and pending data on close
 * - Support explicit buffer drain to emit all accumulated data
 *
 * Design:
 * - Input bytes accumulate into `pending[]` until a newline is found
 * - Each complete line is emitted as an event with the frame content (excluding the line ending byte(s))
 * - CR+LF is treated as a single line ending; lone CR/LF are treated as separate endings
 * - No bytes are dropped or transformed; the framer preserves the exact received bytes
 * - Callbacks are optional; callers can poll the state instead
 */

export interface TextFrameEvent {
  /** Complete line bytes (excluding the newline) */
  line: number[];
  /** Exact delimiter bytes from the wire (LF or CRLF). */
  ending: number[];
  /** Whether the line ended with CR+LF (true) or just LF (false) */
  crlf: boolean;
}

export type TextFrameCallback = (frame: TextFrameEvent) => void;

export class SerialTextFramer {
  private pending: number[] = [];
  private lines: TextFrameEvent[] = [];
  private onFrameCallback: TextFrameCallback | null = null;
  private closed = false;

  /**
   * Register a callback to be invoked each time a complete line is framed.
   * @param callback Function to invoke with each frame
   */
  public onFrame(callback: TextFrameCallback): void {
    this.onFrameCallback = callback;
  }

  /**
   * Feed bytes into the framer. Accumulates in pending buffer and emits complete
   * lines when newlines (LF/CRLF) are encountered.
   *
   * Each byte is preserved; no bytes are lost or reordered.
   * @param bytes Raw bytes received from serial port
   */
  public feed(bytes: number[] | Uint8Array): void {
    if (this.closed) {
      throw new Error("SerialTextFramer: cannot feed data to a closed framer");
    }

    const arr = Array.isArray(bytes) ? bytes : Array.from(bytes);
    if (arr.length === 0) return;

    this.pending.push(...arr);
    this.processPending();
  }

  /**
   * Process the pending buffer to extract complete lines.
   * Each line is delimited by LF (0x0A). CR+LF is treated as one delimiter.
   * Lone CR without following LF is included in the next line (not dropped).
   */
  private processPending(): void {
    while (true) {
      const lfIndex = this.pending.indexOf(0x0A);
      if (lfIndex < 0) {
        // No complete line yet
        break;
      }

      // Extract the line, excluding the LF
      let lineBytes = this.pending.slice(0, lfIndex);
      let crlf = false;

      // Check if the line ends with CR (which would be followed by LF)
      if (lineBytes.length > 0 && lineBytes[lineBytes.length - 1] === 0x0D) {
        // This is CR+LF
        crlf = true;
        lineBytes = lineBytes.slice(0, -1); // Remove the CR
      }

      const ending = crlf ? [0x0D, 0x0A] : [0x0A];
      const frame: TextFrameEvent = { line: lineBytes, ending, crlf };
      this.lines.push(frame);
      if (this.onFrameCallback) {
        this.onFrameCallback(frame);
      }

      // Consume the processed bytes (including LF)
      this.pending = this.pending.slice(lfIndex + 1);
    }
  }

  /**
   * Get a snapshot of pending incomplete bytes without consuming them.
   * Non-destructive; safe to call at any time.
   * @returns Array of bytes awaiting a newline
   */
  public getPending(): number[] {
    return [...this.pending];
  }

  /**
   * Get a copy of all accumulated complete frames since creation or last drain.
   * Non-destructive; does not remove frames from internal state.
   * @returns Array of complete frames
   */
  public getFrames(): TextFrameEvent[] {
    return this.lines.map((frame) => ({
      line: [...frame.line],
      ending: [...frame.ending],
      crlf: frame.crlf,
    }));
  }

  /** Consume completed frames while preserving incomplete pending bytes. */
  public takeFrames(): TextFrameEvent[] {
    const frames = this.getFrames();
    this.lines = [];
    return frames;
  }

  /**
   * Check if there are any pending incomplete bytes.
   * @returns True if there are bytes awaiting a newline
   */
  public hasPending(): boolean {
    return this.pending.length > 0;
  }

  /**
   * Check if there are any accumulated frames.
   * @returns True if frames exist
   */
  public hasFrames(): boolean {
    return this.lines.length > 0;
  }

  /**
   * Drain all accumulated frames and pending bytes. Returns both in a single object.
   * After drain, the framer retains no frames or pending data (reset to empty state).
   * Useful for explicit flushing before close or for bulk retrieval.
   *
   * @returns Object containing frames (complete lines) and pending (incomplete bytes)
   */
  public drain(): { frames: TextFrameEvent[]; pending: number[] } {
    const result = {
      frames: this.lines.map((frame) => ({
        line: [...frame.line],
        ending: [...frame.ending],
        crlf: frame.crlf,
      })),
      pending: [...this.pending],
    };

    this.lines = [];
    this.pending = [];

    return result;
  }

  /**
   * Close the framer. This emits any remaining pending bytes as a final incomplete frame
   * (with crlf=false) if there is pending data. After close, no more data can be fed.
   *
   * @returns Object containing all accumulated frames (including final pending frame if present)
   *         and empty pending (since all data is drained on close)
   */
  public close(): { frames: TextFrameEvent[]; pending: number[] } {
    if (this.closed) {
      // Already closed; return empty result (all data already drained)
      return { frames: [], pending: [] };
    }

    this.closed = true;

    // If there is pending data, move it to a final frame
    if (this.pending.length > 0) {
      const finalFrame: TextFrameEvent = {
        line: [...this.pending],
        ending: [],
        crlf: false, // No actual line ending
      };
      this.lines.push(finalFrame);
      if (this.onFrameCallback) {
        this.onFrameCallback(finalFrame);
      }
      // Clear pending since it's now part of the final frame
      this.pending = [];
    }

    // Return the final drain which now includes the pending data as a frame and empty pending
    return this.drain();
  }

  /**
   * Reset the framer to its initial state (empty pending, no frames, not closed).
   * Useful for testing or reusing a framer instance.
   */
  public reset(): void {
    this.pending = [];
    this.lines = [];
    this.closed = false;
    this.onFrameCallback = null;
  }
}
