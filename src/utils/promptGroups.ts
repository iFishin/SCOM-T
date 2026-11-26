/**
 * 指令组（issue #60）。
 *
 * 一个组 = 同一套指令网格 + 同一份勾选/执行进度。组内可以有多个标签页
 * （多个串口），它们看到的是同一份数据；不在同一组的标签页互不干扰
 * （issue #19 的默认行为不变）。
 *
 * 当前实现里「组」就是共享的配置文件：**1 个 yaml = 1 个组**。这样老数据
 * 不用迁移，配置文件管理器也继续可用；`groupId` 因此同时是 yaml 文件名。
 * 以后若需要「组名 ≠ 文件名」，在这里加一层 id → 文件映射即可，调用方不用动。
 */

import { DEFAULT_CONFIG_FILE } from "./sessionConfigFile.ts";

/** 组视角下，一个标签页需要暴露的最少信息。 */
export type SessionGroupSource = {
  id: string;
  name: string;
  /** 当前字段。 */
  groupId?: string;
  /** 0.3.92 及以前叫 activeConfigFile，只读兜底。 */
  activeConfigFile?: string;
};

export type PromptGroupMember = { id: string; name: string };

export type PromptGroupSummary = {
  /** 组 ID；当前实现里等于共享的 yaml 文件名。 */
  id: string;
  members: PromptGroupMember[];
};

/**
 * 一个标签页所属的组。旧数据只有 `activeConfigFile`，读的时候按组处理，
 * 保证升级后绑定不丢。
 */
export function sessionGroupId(session: SessionGroupSource): string {
  return session.groupId || session.activeConfigFile || DEFAULT_CONFIG_FILE;
}

/**
 * 组的显示名：`prompts.yaml` → 默认，`prompts-串口2.yaml` → 串口2。
 * 生成规则和 `forkConfigForSession` 对应，所以串口2 自动分到的组看起来就叫
 * 「串口2」，用户不用额外命名。
 */
export function groupDisplayName(groupId: string, lang: "zh" | "en" = "zh"): string {
  if (groupId === DEFAULT_CONFIG_FILE) return lang === "zh" ? "默认" : "Default";
  const base = groupId
    .replace(/\.ya?ml$/i, "")
    .replace(/^prompts-/, "")
    .trim();
  return base || groupId.replace(/\.ya?ml$/i, "");
}

/** 按组聚合标签页；顺序按各组成员第一次出现的顺序，和标签栏一致。 */
export function buildPromptGroups(sessions: SessionGroupSource[]): PromptGroupSummary[] {
  const byId = new Map<string, PromptGroupSummary>();
  for (const session of sessions) {
    const id = sessionGroupId(session);
    const group = byId.get(id);
    if (group) {
      group.members.push({ id: session.id, name: session.name });
    } else {
      byId.set(id, { id, members: [{ id: session.id, name: session.name }] });
    }
  }
  return [...byId.values()];
}

/** 组内除自己以外的成员，用于「和谁共用」的文案。 */
export function otherMembers(group: PromptGroupSummary, selfId?: string): PromptGroupMember[] {
  return selfId ? group.members.filter((m) => m.id !== selfId) : group.members;
}
