/**
 * 获取远端最新版本号。
 *
 * 优先走 GitHub API（releases/latest，能拿到准确的发布 tag）；若 API 因
 * 速率限制/网络返回 403 或失败，回退到 raw.githubusercontent 读取仓库根
 * 的 VERSION 文件（发布时更新为 release 版本；静态文件服务，不受 API
 * 配额限制）。
 */

const REPO = "iFishin/SCOM-T";

const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const RAW_VERSION_URL = `https://raw.githubusercontent.com/${REPO}/main/VERSION`;

export type LatestVersionResult = { version: string } | { error: string };

function cleanVersion(v: unknown): string {
  return String(v ?? "").replace(/^v/, "").trim();
}

/**
 * Numeric, segment-wise version comparison. Returns >0 if a is newer than b,
 * <0 if older, 0 if equal. Missing segments count as 0, so "0.4" === "0.4.0"
 * and "0.3.10" is correctly newer than "0.3.9" (not lexicographic).
 */
export function compareVersion(a: string, b: string): number {
  const pa = cleanVersion(a).split(".").map(Number);
  const pb = cleanVersion(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (Number.isNaN(na) || Number.isNaN(nb)) {
      // Non-numeric segment: fall back to string comparison of that segment.
      const sa = String(pa[i] ?? "");
      const sb = String(pb[i] ?? "");
      if (sa !== sb) return sa < sb ? -1 : 1;
    } else if (na !== nb) {
      return na - nb;
    }
  }
  return 0;
}

export async function fetchLatestVersion(): Promise<LatestVersionResult> {
  // 1) GitHub API releases/latest
  try {
    const res = await fetch(API_URL, {
      headers: {
        "User-Agent": "SCOM-T",
        Accept: "application/vnd.github+json",
      },
    });
    if (res.ok) {
      const data = await res.json();
      const v = cleanVersion(data?.tag_name);
      if (v) return { version: v };
    }
    // 非 2xx（如 403 限流）→ 走 raw fallback
  } catch {
    // 网络异常 → 走 raw fallback
  }

  // 2) raw VERSION 文件（仓库根，发布时更新为 release 版本；不限 API 配额）
  try {
    const res = await fetch(RAW_VERSION_URL, {
      headers: { "User-Agent": "SCOM-T" },
    });
    if (res.ok) {
      const v = cleanVersion(await res.text());
      if (v) return { version: v };
    }
    return { error: `无法获取版本（HTTP ${res.status}）` };
  } catch {
    return { error: "网络错误，无法检查更新" };
  }
}
