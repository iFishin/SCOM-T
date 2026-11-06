import { useState, useEffect, useRef, useCallback } from "react";
import { fetchLatestVersion, compareVersion } from "../utils/versionCheck.ts";

const CHECK_INTERVAL = 1000 * 60 * 60 * 24; // 24 hours
const LAST_CHECK_KEY = "scom_t_last_version_check";
const LAST_VERSION_KEY = "scom_t_last_checked_version";

export function useVersionCheck(currentVersion: string) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const versionRef = useRef(currentVersion);
  // Keep versionRef in sync with currentVersion
  versionRef.current = currentVersion;
  const mountedRef = useRef(true);

  const checkForUpdate = useCallback(async () => {
    // Skip if version is the placeholder
    const ver = versionRef.current.replace(/^v/, "");
    if (!ver || ver === "0.0.0") return;

    let latestTag: string | null = null;
    try {
      // 优先 GitHub API，403 限流时自动回退 raw VERSION（不限 API 配额）
      const result = await fetchLatestVersion();
      if ("error" in result) return;

      // Only update if the version hasn't changed during the fetch
      if (versionRef.current.replace(/^v/, "") !== ver) return;
      latestTag = result.version;

      if (compareVersion(latestTag, ver) > 0) {
        if (mountedRef.current) setUpdateAvailable(true);
      } else if (mountedRef.current) {
        setUpdateAvailable(false);
      }
    } catch {
      // silently ignore
    } finally {
      if (latestTag) {
        try {
          // "We checked" and "we found a newer version" are separate facts.
          // Recording the timestamp on every successful check avoids a request
          // on every single launch when no update exists.
          localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
          if (compareVersion(latestTag, versionRef.current.replace(/^v/, "")) > 0) {
            localStorage.setItem(LAST_VERSION_KEY, latestTag);
          } else {
            localStorage.removeItem(LAST_VERSION_KEY);
          }
        } catch {
          // ignore quota exceeded
        }
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!currentVersion) return;

    const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
    const lastVersion = localStorage.getItem(LAST_VERSION_KEY);
    const parsed = Number.parseInt(lastCheck ?? "", 10);
    const shouldCheck = !Number.isFinite(parsed) || Date.now() - parsed > CHECK_INTERVAL;

    if (shouldCheck) {
      void checkForUpdate();
    } else if (lastVersion) {
      // 启动时不必联网，按上次记录恢复提示状态
      const currentVer = currentVersion.replace(/^v/, "");
      setUpdateAvailable(compareVersion(lastVersion, currentVer) > 0);
    }

    // Always register the timer — even when this launch skipped the immediate
    // check — so a long-running session still re-checks within 24h.
    const interval = setInterval(() => void checkForUpdate(), CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [currentVersion, checkForUpdate]);

  return { updateAvailable, checkForUpdate };
}
