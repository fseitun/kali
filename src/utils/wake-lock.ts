/**
 * Screen Wake Lock API integration.
 * Prevents the device screen from turning off while Kali is actively listening.
 * Gracefully degrades when the API is not supported (e.g. older browsers).
 */

type WakeLockRef = {
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
} | null;

let sentinel: WakeLockRef = null;
let wantsLock = false;
let visibilityHandler: (() => void) | null = null;

function isSupported(): boolean {
  return "wakeLock" in navigator;
}

function getWakeLock(): { request(type: "screen"): Promise<WakeLockRef> } | undefined {
  return (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockRef> } })
    .wakeLock;
}

function handleVisibilityChange(): void {
  if (!document.hidden && wantsLock && !sentinel && isSupported()) {
    acquireScreenWakeLock().catch(() => {
      // Re-acquisition failed; ignore (e.g. low battery, user denied)
    });
  }
}

/**
 * Requests a screen wake lock to prevent the device from sleeping.
 * Call when Kali starts listening. Re-requests automatically when the tab
 * becomes visible again after being hidden.
 */
export async function acquireScreenWakeLock(): Promise<void> {
  const wakeLock = getWakeLock();
  if (!wakeLock) {
    return;
  }

  try {
    const s = await wakeLock.request("screen");
    sentinel = s;
    wantsLock = true;

    if (!visibilityHandler) {
      visibilityHandler = handleVisibilityChange;
      document.addEventListener("visibilitychange", visibilityHandler);
    }

    if (s) {
      s.addEventListener("release", () => {
        sentinel = null;
      });
    }
  } catch {
    // Permission denied, low battery, etc. Degrade silently.
  }
}

/**
 * Releases the screen wake lock and stops re-acquiring on visibility change.
 * Call when Kali stops (dispose).
 */
export async function releaseWakeLock(): Promise<void> {
  wantsLock = false;

  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }

  if (sentinel) {
    try {
      await sentinel.release();
    } catch {
      // Already released by browser
    }
    sentinel = null;
  }
}
