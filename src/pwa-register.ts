import { registerSW } from "virtual:pwa-register";

/**
 * Registers the PWA service worker and invokes the callback when a new version
 * is available. The callback receives a reload function; call it when the user
 * chooses to refresh (e.g. from a "New version available" prompt).
 */
export function initPwaRefreshPrompt(showPrompt: (reload: () => void) => void): void {
  const updateSW = registerSW({
    onNeedRefresh() {
      showPrompt(updateSW);
    },
    onOfflineReady() {},
  });
}

/**
 * Registers the SW and wires the default "New version available" notice:
 * shows #version-notice and wires #version-refresh click to reload.
 * Call from both main and debug entry points.
 */
export function setupVersionRefreshPrompt(): void {
  initPwaRefreshPrompt((reload) => {
    const notice = document.getElementById("version-notice");
    const versionCurrent = document.getElementById("version-current");
    const refreshBtn = document.getElementById("version-refresh");
    if (notice) {
      notice.hidden = false;
    }
    if (versionCurrent) {
      versionCurrent.hidden = true;
    }
    refreshBtn?.addEventListener("click", () => reload(), { once: true });
  });
}
