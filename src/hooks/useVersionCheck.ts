import { useState, useEffect } from "react";

const GITHUB_REPO = "iFishin/SCOM-T";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const CHECK_INTERVAL = 1000 * 60 * 60 * 24; // 24 hours
const LAST_CHECK_KEY = "scom_t_last_version_check";
const LAST_VERSION_KEY = "scom_t_last_checked_version";

export function useVersionCheck(currentVersion: string) {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  function compareVersion(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] ?? 0;
      const nb = pb[i] ?? 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }

  async function checkForUpdate() {
    try {
      const res = await fetch(GITHUB_API);
      if (!res.ok) return;
      const data = await res.json();
      const latestTag: string = (data.tag_name || "").replace(/^v/, "");
      const currentVer = currentVersion.replace(/^v/, "");

      if (compareVersion(latestTag, currentVer) > 0) {
        setUpdateAvailable(true);
        // 记录已检查的版本和时间
        try {
          localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
          localStorage.setItem(LAST_VERSION_KEY, latestTag);
        } catch {
          // ignore quota exceeded
        }
      }
    } catch {
      // silently ignore
    }
  }

  useEffect(() => {
    if (!currentVersion) return;

    // 检查距离上次检查是否已超过 CHECK_INTERVAL
    const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
    const lastVersion = localStorage.getItem(LAST_VERSION_KEY);

    const shouldCheck = !lastCheck || Date.now() - parseInt(lastCheck, 10) > CHECK_INTERVAL;

    if (shouldCheck) {
      checkForUpdate();
      const interval = setInterval(checkForUpdate, CHECK_INTERVAL);
      return () => clearInterval(interval);
    } else if (lastVersion && currentVersion) {
      const currentVer = currentVersion.replace(/^v/, "");
      // 如果本地版本已升级到或超过上次记录的新版本，清除更新提示
      if (compareVersion(lastVersion, currentVer) <= 0) {
        setUpdateAvailable(false);
      } else {
        // 否则恢复该状态
        setUpdateAvailable(true);
      }
    }
  }, [currentVersion]);

  return { updateAvailable };
}
