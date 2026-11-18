import { describe, it, expect } from "vitest";
import { nextSessionName, fillMissingConfigFiles } from "./useSessionManager";
import type { SerialSession } from "./useSessionManager";

function session(id: string, activeConfigFile?: string): SerialSession {
  return {
    id,
    name: id,
    config: {
      path: "", baudRate: 115200, dataBits: "8", parity: "none", stopBits: "1",
      flowControl: "none", rts: false, dtr: false, connectionType: "serial",
      tcpHost: "", tcpPort: 23, tcpProtocol: "rfc2217",
    },
    activeConfigFile,
  };
}

describe("fillMissingConfigFiles", () => {
  it("seeds a binding that only exists in the settings mirror", () => {
    const result = fillMissingConfigFiles([session("a"), session("b")], { b: "prompts-b.yaml" });
    expect(result.changed).toBe(true);
    expect(result.sessions[0].activeConfigFile).toBeUndefined();
    expect(result.sessions[1].activeConfigFile).toBe("prompts-b.yaml");
  });

  it("never overwrites a live binding", () => {
    const result = fillMissingConfigFiles([session("a", "prompts-live.yaml")], { a: "prompts-old.yaml" });
    expect(result.changed).toBe(false);
    expect(result.sessions[0].activeConfigFile).toBe("prompts-live.yaml");
  });

  it("returns the original array when nothing changes", () => {
    const sessions = [session("a", "prompts-a.yaml")];
    const result = fillMissingConfigFiles(sessions, { zzz: "prompts-z.yaml" });
    expect(result.changed).toBe(false);
    expect(result.sessions).toBe(sessions);
  });
});

describe("nextSessionName", () => {
  it("starts at 串口1", () => {
    expect(nextSessionName([])).toBe("串口1");
  });

  it("fills the first free slot", () => {
    expect(nextSessionName(["串口1"])).toBe("串口2");
    expect(nextSessionName(["串口2"])).toBe("串口1");
  });

  it("reuses a freed slot instead of colliding", () => {
    // 串口2 was closed; adding should reuse "串口2", not duplicate "串口3".
    expect(nextSessionName(["串口1", "串口3"])).toBe("串口2");
  });

  it("ignores names that are not the default pattern", () => {
    expect(nextSessionName(["My Port", "串口1"])).toBe("串口2");
  });

  it("does not collide when all default slots are taken", () => {
    const taken = ["串口1", "串口2", "串口3", "串口4"];
    const name = nextSessionName(taken);
    expect(taken).not.toContain(name);
  });
});
