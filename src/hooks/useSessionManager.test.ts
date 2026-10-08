import { describe, it, expect } from "vitest";
import { nextSessionName } from "./useSessionManager";

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
