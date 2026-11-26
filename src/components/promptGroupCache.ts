import type { PromptRow } from "./promptRow.ts";

/** 组里需要跨标签页共享的那部分状态。 */
export type PromptGroupSnapshot = {
  rows: PromptRow[];
  /** 批量编辑框的文本，切走再切回来不该丢。 */
  batchText: string;
  /** YAML 编辑器里的草稿，同上。 */
  yamlText: string;
};

/**
 * 进程内的组状态缓存。
 *
 * 为什么需要它：PromptPanel 只有一个实例，切标签时靠「换 groupId 再读盘」。
 * 那样一来 a) 同组的两个标签页要等一次磁盘往返才对齐，b) 「写旧文件」是不
 * await 的，紧接着读新文件可能读到写之前的旧内容（丢最后一次编辑）。
 * 把组状态放进内存，切组就是取一次引用，既没有竞态也没有延迟；磁盘只剩
 * 落盘这一个职责。
 *
 * 不做淘汰：组数受标签页上限（4）约束，一份快照就是一个标签页的指令表，
 * 量级和以前每个标签页各存一份没有区别。
 */
export class PromptGroupCache {
  private snapshots = new Map<string, PromptGroupSnapshot>();

  get(groupId: string): PromptGroupSnapshot | undefined {
    return this.snapshots.get(groupId);
  }

  set(groupId: string, snapshot: PromptGroupSnapshot): void {
    this.snapshots.set(groupId, snapshot);
  }

  has(groupId: string): boolean {
    return this.snapshots.has(groupId);
  }

  delete(groupId: string): void {
    this.snapshots.delete(groupId);
  }

  clear(): void {
    this.snapshots.clear();
  }
}

/**
 * 这次状态变化里的 rows 是不是已经属于新的组。
 *
 * 切组后的第一帧：groupId 已经换了，promptRows 还是上一个组的 —— 这时写缓存
 * 会把旧组的内容灌进新组。只有 rows 也跟着变了（新组的数据到位）才算数。
 */
export function rowsBelongToGroup(
  prev: { groupId: string; rows: PromptRow[] },
  next: { groupId: string; rows: PromptRow[] },
): boolean {
  return prev.groupId === next.groupId || prev.rows !== next.rows;
}
