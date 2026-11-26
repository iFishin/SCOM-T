import { describe, expect, it } from "vitest";
import {
  buildPromptGroups,
  groupDisplayName,
  otherMembers,
  sessionGroupId,
} from "./promptGroups.ts";
import { PromptGroupCache, rowsBelongToGroup } from "../components/promptGroupCache.ts";
import type { PromptRow } from "../components/promptRow.ts";

describe("sessionGroupId", () => {
  it("prefers the current field", () => {
    expect(sessionGroupId({ id: "a", name: "串口1", groupId: "prompts-a.yaml", activeConfigFile: "old.yaml" }))
      .toBe("prompts-a.yaml");
  });

  it("falls back to the legacy field so upgrades keep their binding", () => {
    expect(sessionGroupId({ id: "a", name: "串口1", activeConfigFile: "prompts-b.yaml" }))
      .toBe("prompts-b.yaml");
  });

  it("uses the shared default when neither field is set", () => {
    expect(sessionGroupId({ id: "a", name: "串口1" })).toBe("prompts.yaml");
  });
});

describe("groupDisplayName", () => {
  it("names the shared default", () => {
    expect(groupDisplayName("prompts.yaml")).toBe("默认");
    expect(groupDisplayName("prompts.yaml", "en")).toBe("Default");
  });

  it("strips the fork prefix and suffix so the group reads like the tab", () => {
    expect(groupDisplayName("prompts-串口2.yaml")).toBe("串口2");
    expect(groupDisplayName("prompts-项目-甲.yml")).toBe("项目-甲");
  });

  it("keeps a hand-named file readable", () => {
    expect(groupDisplayName("主辅模块联调.yaml")).toBe("主辅模块联调");
  });
});

describe("buildPromptGroups", () => {
  it("groups tabs that share a config file", () => {
    const groups = buildPromptGroups([
      { id: "s1", name: "串口1", groupId: "prompts-甲.yaml" },
      { id: "s2", name: "串口2", groupId: "prompts-甲.yaml" },
      { id: "s3", name: "串口3", groupId: "prompts-乙.yaml" },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].id).toBe("prompts-甲.yaml");
    expect(groups[0].members.map((m) => m.name)).toEqual(["串口1", "串口2"]);
    expect(groups[1].members.map((m) => m.name)).toEqual(["串口3"]);
  });

  it("treats legacy sessions as members of their old file", () => {
    const groups = buildPromptGroups([
      { id: "s1", name: "串口1", activeConfigFile: "prompts.yaml" },
      { id: "s2", name: "串口2" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
  });

  it("returns an empty list for no sessions", () => {
    expect(buildPromptGroups([])).toEqual([]);
  });
});

describe("otherMembers", () => {
  it("excludes the tab itself", () => {
    const [group] = buildPromptGroups([
      { id: "s1", name: "串口1", groupId: "a.yaml" },
      { id: "s2", name: "串口2", groupId: "a.yaml" },
    ]);
    expect(otherMembers(group, "s1").map((m) => m.id)).toEqual(["s2"]);
    expect(otherMembers(group).map((m) => m.id)).toEqual(["s1", "s2"]);
  });
});

const row = (id: number): PromptRow => ({
  id, selected: false, command: "", isHex: false, ender: "\r\n", interval: "",
});

describe("PromptGroupCache", () => {
  it("keeps one snapshot per group", () => {
    const cache = new PromptGroupCache();
    cache.set("a.yaml", { rows: [row(1)], batchText: "AT", yamlText: "cmd: AT" });
    expect(cache.get("a.yaml")?.rows).toHaveLength(1);
    expect(cache.has("b.yaml")).toBe(false);
  });

  it("replaces the snapshot instead of merging it", () => {
    const cache = new PromptGroupCache();
    cache.set("a.yaml", { rows: [row(1)], batchText: "", yamlText: "" });
    cache.set("a.yaml", { rows: [row(1), row(2)], batchText: "AT+RST", yamlText: "" });
    expect(cache.get("a.yaml")?.rows).toHaveLength(2);
    expect(cache.get("a.yaml")?.batchText).toBe("AT+RST");
  });

  it("drops a group on delete", () => {
    const cache = new PromptGroupCache();
    cache.set("a.yaml", { rows: [], batchText: "", yamlText: "" });
    cache.delete("a.yaml");
    expect(cache.has("a.yaml")).toBe(false);
  });
});

describe("rowsBelongToGroup", () => {
  const rows = [row(1), row(2)];

  it("accepts an edit inside the same group", () => {
    expect(rowsBelongToGroup({ groupId: "a.yaml", rows }, { groupId: "a.yaml", rows: [...rows] }))
      .toBe(true);
  });

  it("rejects the first frame after a group switch, where rows are still the old group's", () => {
    // 切组那一帧：groupId 已经变了，rows 还是旧引用 —— 写进去就串组了。
    expect(rowsBelongToGroup({ groupId: "a.yaml", rows }, { groupId: "b.yaml", rows }))
      .toBe(false);
  });

  it("accepts the frame where the new group's rows arrive", () => {
    expect(rowsBelongToGroup({ groupId: "a.yaml", rows }, { groupId: "b.yaml", rows: [...rows] }))
      .toBe(true);
  });
});
