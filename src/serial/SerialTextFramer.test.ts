import { describe, it, expect, beforeEach, vi } from "vitest";
import { SerialTextFramer } from "./SerialTextFramer";

describe("SerialTextFramer", () => {
  let framer: SerialTextFramer;

  beforeEach(() => {
    framer = new SerialTextFramer();
  });

  describe("feed() and basic line splitting", () => {
    it("should split lines on LF (0x0A)", () => {
      framer.feed([0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x0A]); // "Hello\n"
      const frames = framer.getFrames();
      expect(frames).toHaveLength(1);
      expect(frames[0].line).toEqual([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      expect(frames[0].crlf).toBe(false);
    });

    it("should split lines on CRLF (0x0D 0x0A)", () => {
      framer.feed([0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x0D, 0x0A]); // "Hello\r\n"
      const frames = framer.getFrames();
      expect(frames).toHaveLength(1);
      expect(frames[0].line).toEqual([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      expect(frames[0].crlf).toBe(true);
    });

    it("should preserve empty lines on consecutive LF", () => {
      framer.feed([0x0A, 0x0A]); // "\n\n"
      const frames = framer.getFrames();
      expect(frames).toHaveLength(2);
      expect(frames[0].line).toEqual([]);
      expect(frames[1].line).toEqual([]);
    });

    it("should accumulate multiple lines from a single feed", () => {
      framer.feed([0x41, 0x0A, 0x42, 0x0A, 0x43, 0x0A]); // "A\nB\nC\n"
      const frames = framer.getFrames();
      expect(frames).toHaveLength(3);
      expect(frames[0].line).toEqual([0x41]); // 'A'
      expect(frames[1].line).toEqual([0x42]); // 'B'
      expect(frames[2].line).toEqual([0x43]); // 'C'
    });

    it("should keep incomplete lines in pending buffer", () => {
      framer.feed([0x48, 0x65, 0x6C, 0x6C, 0x6F]); // "Hello" without newline
      expect(framer.hasPending()).toBe(true);
      expect(framer.getPending()).toEqual([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      expect(framer.hasFrames()).toBe(false);
    });

    it("should complete a line when feeding the newline later", () => {
      framer.feed([0x48, 0x65, 0x6C, 0x6C, 0x6F]); // "Hello"
      expect(framer.hasFrames()).toBe(false);
      framer.feed([0x0A]); // "\n"
      expect(framer.hasFrames()).toBe(true);
      const frames = framer.getFrames();
      expect(frames[0].line).toEqual([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      expect(framer.hasPending()).toBe(false);
    });

    it("should complete a line when feeding CRLF across multiple feed calls", () => {
      framer.feed([0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x0D]); // "Hello\r"
      expect(framer.hasPending()).toBe(true);
      framer.feed([0x0A]); // "\n"
      const frames = framer.getFrames();
      expect(frames).toHaveLength(1);
      expect(frames[0].line).toEqual([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      expect(frames[0].crlf).toBe(true);
    });
  });

  describe("byte preservation", () => {
    it("should preserve all bytes without loss or duplication", () => {
      const input = [0x01, 0x02, 0x03, 0x0A, 0x04, 0x05, 0x0A];
      framer.feed(input);
      const frames = framer.getFrames();
      const recovered = [...frames[0].line, 0x0A, ...frames[1].line, 0x0A];
      expect(recovered).toEqual(input);
    });

    it("should preserve binary data including null bytes", () => {
      framer.feed([0x00, 0x01, 0x02, 0x00, 0x0A]); // null bytes mixed with data
      const frames = framer.getFrames();
      expect(frames[0].line).toEqual([0x00, 0x01, 0x02, 0x00]);
    });

    it("should preserve CR bytes that are not part of CRLF", () => {
      framer.feed([0x48, 0x0D, 0x69, 0x0A]); // "H\ri\n" - lone CR before i
      const frames = framer.getFrames();
      expect(frames[0].line).toEqual([0x48, 0x0D, 0x69]);
    });

    it("should preserve high bytes (0xFF)", () => {
      framer.feed([0xFF, 0xFE, 0xFD, 0x0A]);
      const frames = framer.getFrames();
      expect(frames[0].line).toEqual([0xFF, 0xFE, 0xFD]);
    });
  });

  describe("getPending() - non-destructive snapshot", () => {
    it("should return pending bytes without consuming them", () => {
      framer.feed([0x41, 0x42, 0x43]); // "ABC" no newline
      const pending1 = framer.getPending();
      const pending2 = framer.getPending();
      expect(pending1).toEqual([0x41, 0x42, 0x43]);
      expect(pending2).toEqual([0x41, 0x42, 0x43]);
      expect(framer.hasPending()).toBe(true);
    });

    it("should return a copy, not a reference to internal state", () => {
      framer.feed([0x41, 0x42, 0x43]);
      const pending = framer.getPending();
      pending[0] = 0x99;
      const pending2 = framer.getPending();
      expect(pending2[0]).toBe(0x41); // Original unmodified
    });

    it("should reflect changes after subsequent feed calls", () => {
      framer.feed([0x41, 0x42]);
      let pending = framer.getPending();
      expect(pending).toEqual([0x41, 0x42]);
      framer.feed([0x43]);
      pending = framer.getPending();
      expect(pending).toEqual([0x41, 0x42, 0x43]);
    });

    it("should return empty array when no pending data", () => {
      framer.feed([0x41, 0x0A]); // Complete line
      const pending = framer.getPending();
      expect(pending).toEqual([]);
    });
  });

  describe("getFrames() - non-destructive frame access", () => {
    it("should return a copy of frames without consuming them", () => {
      framer.feed([0x41, 0x0A]);
      const frames1 = framer.getFrames();
      const frames2 = framer.getFrames();
      expect(frames1).toHaveLength(1);
      expect(frames2).toHaveLength(1);
      expect(frames1).toEqual(frames2);
    });

    it("should return copies of frame data", () => {
      framer.feed([0x41, 0x42, 0x0A]);
      const frames = framer.getFrames();
      frames[0].line[0] = 0x99;
      const frames2 = framer.getFrames();
      expect(frames2[0].line[0]).toBe(0x41); // Original unmodified
    });
  });

  describe("drain() - consuming retrieval", () => {
    it("should return and clear frames", () => {
      framer.feed([0x41, 0x0A, 0x42, 0x0A]);
      const result = framer.drain();
      expect(result.frames).toHaveLength(2);
      expect(framer.hasFrames()).toBe(false);
      const result2 = framer.drain();
      expect(result2.frames).toHaveLength(0);
    });

    it("should return and clear pending data", () => {
      framer.feed([0x41, 0x42, 0x43]); // No newline
      const result = framer.drain();
      expect(result.pending).toEqual([0x41, 0x42, 0x43]);
      expect(framer.hasPending()).toBe(false);
    });

    it("should return both frames and pending in a single drain", () => {
      framer.feed([0x41, 0x0A, 0x42, 0x43]); // One line, then incomplete
      const result = framer.drain();
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0].line).toEqual([0x41]);
      expect(result.pending).toEqual([0x42, 0x43]);
    });

    it("should allow feeding more data after drain", () => {
      framer.feed([0x41, 0x0A]);
      framer.drain();
      framer.feed([0x42, 0x0A]);
      const result = framer.drain();
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0].line).toEqual([0x42]);
    });
  });

  describe("close() - final drain with pending flush", () => {
    it("should include pending data as final frame when closing", () => {
      framer.feed([0x41, 0x0A, 0x42, 0x43]); // One line + incomplete
      const result = framer.close();
      expect(result.frames).toHaveLength(2);
      expect(result.frames[0].line).toEqual([0x41]);
      expect(result.frames[1].line).toEqual([0x42, 0x43]); // Pending becomes final frame
      expect(result.frames[1].crlf).toBe(false); // No actual line ending
      expect(result.pending).toEqual([]); // All drained
    });

    it("should emit pending data via callback on close", () => {
      const callback = vi.fn();
      framer.onFrame(callback);
      framer.feed([0x41, 0x0A, 0x42, 0x43]);
      framer.close();
      expect(callback).toHaveBeenCalledTimes(2); // One for "A\n", one for pending
      expect(callback).toHaveBeenLastCalledWith({
        line: [0x42, 0x43],
        ending: [],
        crlf: false,
      });
    });

    it("should prevent feeding data after close", () => {
      framer.close();
      expect(() => {
        framer.feed([0x41, 0x0A]);
      }).toThrow("cannot feed data to a closed framer");
    });

    it("should be idempotent - multiple close calls should be safe", () => {
      framer.feed([0x41, 0x0A, 0x42, 0x43]);
      const result1 = framer.close();
      expect(result1.frames).toHaveLength(2);
      expect(result1.pending).toEqual([]);
      const result2 = framer.close();
      expect(result2.frames).toEqual([]);
      expect(result2.pending).toEqual([]);
    });

    it("should close with only pending data (no prior lines)", () => {
      framer.feed([0x41, 0x42]);
      const result = framer.close();
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0].line).toEqual([0x41, 0x42]);
      expect(result.frames[0].crlf).toBe(false);
    });

    it("should close with no data", () => {
      const result = framer.close();
      expect(result.frames).toEqual([]);
      expect(result.pending).toEqual([]);
    });
  });

  describe("onFrame() callback", () => {
    it("should call callback for each complete line", () => {
      const callback = vi.fn();
      framer.onFrame(callback);
      framer.feed([0x41, 0x0A, 0x42, 0x0A]);
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenNthCalledWith(1, {
        line: [0x41],
        ending: [0x0A],
        crlf: false,
      });
      expect(callback).toHaveBeenNthCalledWith(2, {
        line: [0x42],
        ending: [0x0A],
        crlf: false,
      });
    });

    it("should distinguish CRLF from LF in callback", () => {
      const callback = vi.fn();
      framer.onFrame(callback);
      framer.feed([0x41, 0x0A]); // LF only
      framer.feed([0x42, 0x0D, 0x0A]); // CRLF
      expect(callback).toHaveBeenNthCalledWith(1, {
        line: [0x41],
        ending: [0x0A],
        crlf: false,
      });
      expect(callback).toHaveBeenNthCalledWith(2, {
        line: [0x42],
        ending: [0x0D, 0x0A],
        crlf: true,
      });
    });

    it("should allow callback replacement", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      framer.onFrame(cb1);
      framer.feed([0x41, 0x0A]);
      framer.onFrame(cb2); // Replace callback
      framer.feed([0x42, 0x0A]);
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });

  describe("reset()", () => {
    it("should clear frames and pending", () => {
      framer.feed([0x41, 0x0A, 0x42]);
      framer.reset();
      expect(framer.hasFrames()).toBe(false);
      expect(framer.hasPending()).toBe(false);
      expect(framer.getFrames()).toEqual([]);
      expect(framer.getPending()).toEqual([]);
    });

    it("should allow feeding after reset", () => {
      framer.feed([0x41, 0x0A]);
      framer.reset();
      framer.feed([0x42, 0x0A]);
      const frames = framer.getFrames();
      expect(frames).toHaveLength(1);
      expect(frames[0].line).toEqual([0x42]);
    });

    it("should clear closed state", () => {
      framer.close();
      expect(() => framer.feed([0x41])).toThrow();
      framer.reset();
      expect(() => framer.feed([0x41, 0x0A])).not.toThrow();
    });

    it("should clear callback", () => {
      const callback = vi.fn();
      framer.onFrame(callback);
      framer.reset();
      framer.feed([0x41, 0x0A]);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("edge cases and special scenarios", () => {
    it("should handle Uint8Array input", () => {
      const bytes = new Uint8Array([0x41, 0x42, 0x0A]);
      framer.feed(bytes);
      const frames = framer.getFrames();
      expect(frames[0].line).toEqual([0x41, 0x42]);
    });

    it("should handle empty feed calls", () => {
      framer.feed([]);
      expect(framer.hasPending()).toBe(false);
      framer.feed([0x41, 0x0A]);
      framer.feed([]); // Empty after complete line
      const frames = framer.getFrames();
      expect(frames).toHaveLength(1);
    });

    it("should handle very large lines", () => {
      const largeBytes = new Array(10000).fill(0x41);
      largeBytes.push(0x0A);
      framer.feed(largeBytes);
      const frames = framer.getFrames();
      expect(frames[0].line).toHaveLength(10000);
    });

    it("should handle rapid successive feeds", () => {
      for (let i = 0; i < 100; i++) {
        framer.feed([0x41 + (i % 26), 0x0A]); // A-Z cycling
      }
      const frames = framer.getFrames();
      expect(frames).toHaveLength(100);
    });

    it("should preserve data through multiple drain/feed cycles", () => {
      framer.feed([0x41, 0x0A]);
      const result1 = framer.drain();
      expect(result1.frames).toHaveLength(1);

      framer.feed([0x42, 0x0A]);
      framer.feed([0x43, 0x0A]);
      const result2 = framer.drain();
      expect(result2.frames).toHaveLength(2);
    });

    it("should handle all LF/CR boundary conditions", () => {
      // Test: LF
      framer.reset();
      framer.feed([0x41, 0x0A]);
      expect(framer.getFrames()[0].crlf).toBe(false);

      // Test: CRLF
      framer.reset();
      framer.feed([0x41, 0x0D, 0x0A]);
      expect(framer.getFrames()[0].crlf).toBe(true);

      // Test: CR followed by other data (not CRLF)
      framer.reset();
      framer.feed([0x41, 0x0D, 0x42, 0x0A]);
      expect(framer.getFrames()[0].line).toEqual([0x41, 0x0D, 0x42]);
    });
  });

  describe("integration scenarios", () => {
    it("should handle a realistic serial session", () => {
      const callback = vi.fn();
      framer.onFrame(callback);

      const encode = (value: string) => Array.from(new TextEncoder().encode(value));

      // Simulate device echoing prompts and responses
      framer.feed(encode("$ "));
      expect(framer.hasPending()).toBe(true);
      expect(callback).not.toHaveBeenCalled();

      framer.feed(encode("echo hello\r\n"));
      expect(callback).toHaveBeenNthCalledWith(1, {
        line: encode("$ echo hello"),
        ending: [0x0D, 0x0A],
        crlf: true,
      });

      framer.feed(encode("hello\r\n$ "));
      expect(callback).toHaveBeenNthCalledWith(2, {
        line: encode("hello"),
        ending: [0x0D, 0x0A],
        crlf: true,
      });

      expect(framer.getPending()).toEqual(encode("$ "));
    });

    it("should consume completed frames without clearing pending bytes", () => {
      framer.feed([0x41, 0x0A, 0x42]);
      expect(framer.takeFrames()).toEqual([{ line: [0x41], ending: [0x0A], crlf: false }]);
      expect(framer.getFrames()).toEqual([]);
      expect(framer.getPending()).toEqual([0x42]);
    });

    it("should accumulate data for later batch processing via drain", () => {
      // Collect data without processing
      framer.feed([0x41, 0x0A, 0x42, 0x0A, 0x43, 0x0A, 0x44]); // 3 lines + partial
      expect(framer.hasPending()).toBe(true);

      // Batch retrieve all
      const result = framer.drain();
      expect(result.frames).toHaveLength(3);
      expect(result.pending).toEqual([0x44]);
    });

    it("should reconstruct original data from frames and pending", () => {
      const original = [0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x0A, 0x57, 0x6F, 0x72, 0x6C, 0x64];
      framer.feed(original);

      const result = framer.drain();
      const reconstructed = [];
      for (const frame of result.frames) {
        reconstructed.push(...frame.line);
        reconstructed.push(0x0A); // Re-add the delimiter
      }
      reconstructed.push(...result.pending);

      expect(reconstructed).toEqual(original);
    });

    it("reconstructs a line split across many USB chunks before takeFrames", () => {
      // Device echoes "version\r\n" but USB delivers it as versio | n\r\n.
      const chunkA = Array.from(new TextEncoder().encode("versio"));
      const chunkB = Array.from(new TextEncoder().encode("n\r\n"));
      framer.feed(chunkA);
      expect(framer.getFrames()).toEqual([]);
      expect(framer.getPending().length).toBe(6);

      framer.feed(chunkB);
      const frames = framer.takeFrames();
      expect(frames.map((f) => new TextDecoder().decode(new Uint8Array([...f.line, ...f.ending]))))
        .toEqual(["version\r\n"]);
      expect(framer.getPending()).toEqual([]);
    });

    it("accumulates interleaved status + echo + response across chunk boundaries", () => {
      // Device stream: status line (complete), echo (split across chunks),
      // response, then next status line (prefix only this window).
      const prevTail = Array.from(new TextEncoder().encode("[02:00:01.460]standalone:get_version_type=2\r\nversion"));
      const nextChunk = Array.from(new TextEncoder().encode("\r\n[02:00:01.461]Unknown command: version\r\n[02:00:01.462][50]standalone:get_ve"));
      framer.feed(prevTail);
      expect(framer.takeFrames().map((f) => new TextDecoder().decode(new Uint8Array(f.line))))
        .toEqual(["[02:00:01.460]standalone:get_version_type=2"]);

      framer.feed(nextChunk);
      const frames = framer.takeFrames().map((f) => new TextDecoder().decode(new Uint8Array(f.line)));
      expect(frames).toEqual(["version", "[02:00:01.461]Unknown command: version"]);
      expect(framer.getPending()).toEqual(Array.from(new TextEncoder().encode("[02:00:01.462][50]standalone:get_ve")));
    });

    it("keeps incomplete bytes in pending and does not fabricate a line break", () => {
      framer.feed(Array.from(new TextEncoder().encode("standalone:get_ve")));
      expect(framer.getFrames()).toEqual([]);
      expect(framer.getPending()).toEqual(Array.from(new TextEncoder().encode("standalone:get_ve")));
    });

    it("send-time flush surfaces a newline-less line before the next echo", () => {
      // Device sends "standalone:version" with NO trailing newline, then later
      // the command echo "version\r\n" arrives. The framer keeps the standalone
      // pending (no newline); the idle flush drains it before the echo so the
      // echo is NOT concatenated into "standalone:versionversion".
      framer.feed(Array.from(new TextEncoder().encode("standalone:version")));
      expect(framer.getPending().length).toBeGreaterThan(0);

      // Idle flush: pending is drained as an incomplete line.
      const drained = framer.drain();
      expect(new TextDecoder().decode(new Uint8Array(drained.pending))).toBe("standalone:version");

      framer.feed(Array.from(new TextEncoder().encode("version\r\n")));
      const frames = framer.takeFrames().map((f) => new TextDecoder().decode(new Uint8Array(f.line)));
      expect(frames).toEqual(["version"]);
    });

    it("never truncates a line split across USB chunks (v + ersion must reassemble)", () => {
      // Regression: an echo "version\r\n" delivered as "v" then "ersion\r\n"
      // MUST reassemble into "version". Chunk-boundary flushing that drains
      // pending early would produce "v" + "ersion" fragments.
      framer.feed(Array.from(new TextEncoder().encode("v")));
      expect(framer.getFrames()).toEqual([]); // not emitted early

      framer.feed(Array.from(new TextEncoder().encode("ersion\r\n")));
      const frames = framer.takeFrames().map((f) => new TextDecoder().decode(new Uint8Array(f.line)));
      expect(frames).toEqual(["version"]);
      expect(framer.getPending()).toEqual([]);
    });

    it("a complete CRLF line is emitted immediately without waiting for a boundary", () => {
      framer.feed(Array.from(new TextEncoder().encode("get_version\r\n")));
      const frames = framer.takeFrames().map((f) => new TextDecoder().decode(new Uint8Array(f.line)));
      expect(frames).toEqual(["get_version"]);
      expect(framer.getPending()).toEqual([]);
    });

    it("reconstructs the real device byte stream split into arbitrary USB chunks", () => {
      // Device wire bytes for: echo version, response, next status line.
      const wire = new TextEncoder().encode(
        "version\r\n" +
        "[02:00:01.460]Unknown command: version\r\n" +
        "[02:00:01.462][50]standalone:get_version_type=2\r\n",
      );
      // Arbitrary USB chunk boundaries that cut lines mid-word.
      const chunks = [
        Array.from(wire.slice(0, 6)),                              // "versio"
        Array.from(wire.slice(6, 37)),                             // "n\r\n[02:00:01.460]Unknown command: versi"
        Array.from(wire.slice(37, 70)),                            // "on\r\n[02:00:01.462][50]standalone:get_ve"
        Array.from(wire.slice(70)),                                // "rsion_type=2\r\n"
      ];

      const lines: string[] = [];
      for (const chunk of chunks) {
        framer.feed(chunk);
        for (const frame of framer.takeFrames()) {
          lines.push(new TextDecoder().decode(new Uint8Array(frame.line)));
        }
      }
      expect(lines).toEqual([
        "version",
        "[02:00:01.460]Unknown command: version",
        "[02:00:01.462][50]standalone:get_version_type=2",
      ]);
      expect(framer.getPending()).toEqual([]);
    });

    it("chunk-boundary flush keeps real device echo separate from newline-less standalone", () => {
      // Mirrors the hook's bufferAsciiChunk: drain any newline-less pending at
      // each chunk boundary, then frame the chunk. Device sends:
      //   chunk1: "standalone:version"            (no newline — separate message)
      //   chunk2: "version\r\n"                   (echo of user command)
      //   chunk3: "[00:00:03.396]Unknown command: version\r\n"  (response)
      const emit = (chunk: string): string[] => {
        framer.feed(Array.from(new TextEncoder().encode(chunk)));
        return framer.takeFrames().map((f) => new TextDecoder().decode(new Uint8Array(f.line)));
      };

      // Chunk 1 — newline-less standalone stays pending.
      expect(emit("standalone:version")).toEqual([]);
      expect(framer.getPending()).toEqual(Array.from(new TextEncoder().encode("standalone:version")));

      // Chunk 2 — boundary flush surfaces standalone, then echo frames cleanly.
      const drained = framer.drain();
      expect(new TextDecoder().decode(new Uint8Array(drained.pending))).toBe("standalone:version");
      expect(emit("version\r\n")).toEqual(["version"]);

      // Chunk 3 — response frames cleanly.
      expect(emit("[00:00:03.396]Unknown command: version\r\n")).toEqual([
        "[00:00:03.396]Unknown command: version",
      ]);
      expect(framer.getPending()).toEqual([]);
    });
  });
});
