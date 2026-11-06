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

const FETCH_TIMEOUT_MS = 5000;

/**
 * fetch() has no default timeout. `timeoutMs` is the *remaining* part of a
 * shared deadline, so the API attempt and the raw fallback cannot add up to
 * 2 x 5s when the host is unreachable.
 */
async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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
  // Keep the raw segments for the non-numeric fallback: pa/pb are Number()'d,
  // so comparing them would degrade every pre-release suffix to "NaN".
  const sa = cleanVersion(a).split(".");
  const sb = cleanVersion(b).split(".");
  const pa = sa.map(Number);
  const pb = sb.map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (Number.isNaN(na) || Number.isNaN(nb)) {
      const left = sa[i] ?? "";
      const right = sb[i] ?? "";
      if (left !== right) return left < right ? -1 : 1;
    } else if (na !== nb) {
      return na - nb;
    }
  }
  return 0;
}

export async function fetchLatestVersion(): Promise<LatestVersionResult> {
  // One 5s budget shared by both attempts: an offline "check for updates"
  // must settle in ~5s, not 5s (API) + 5s (raw fallback).
  const deadline = Date.now() + FETCH_TIMEOUT_MS;
  const remaining = () => Math.max(1, deadline - Date.now());

  // 1) GitHub API releases/latest
  try {
    const res = await fetchWithTimeout(API_URL, remaining(), {
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
    const res = await fetchWithTimeout(RAW_VERSION_URL, remaining(), {
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
