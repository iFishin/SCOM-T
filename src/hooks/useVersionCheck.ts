import { useState, useEffect } from "react";

const GITHUB_REPO = "iFishin/SCOM-T";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const CHECK_INTERVAL = 1000 * 60 * 60 * 24; // 24 hours
const LAST_CHECK_KEY = "scom_t_last_version_check";
const LAST_VERSION_KEY = "scom_t_last_checked_version";

export function useVersionCheck() {
  const [version, setVersion] = useState("0.1.0");
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
      const currentVer = version.replace(/^v/, "");

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
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const v = await getVersion();
        setVersion(v);
      } catch {
        // not in Tauri context (dev), keep default
      }
    })();
  }, []);

  useEffect(() => {
    // 检查距离上次检查是否已超过 CHECK_INTERVAL
    const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
    const lastVersion = localStorage.getItem(LAST_VERSION_KEY);

    const shouldCheck = !lastCheck || Date.now() - parseInt(lastCheck, 10) > CHECK_INTERVAL;

    if (shouldCheck) {
      checkForUpdate();
      const interval = setInterval(checkForUpdate, CHECK_INTERVAL);
      return () => clearInterval(interval);
    } else if (lastVersion && version) {
      // 如果上次检查有新版本记录，恢复该状态
      if (compareVersion(lastVersion, version.replace(/^v/, "")) > 0) {
        setUpdateAvailable(true);
      }
    }
  }, [version]);

  return { updateAvailable, version };
}
