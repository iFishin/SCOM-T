import { useState, useEffect } from "react";

const GITHUB_REPO = "iFishin/SCOM-T";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const CHECK_INTERVAL = 1000 * 60 * 60 * 24; // 24 hours

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
    checkForUpdate();
    const interval = setInterval(checkForUpdate, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [version]);

  return { updateAvailable, version };
}
