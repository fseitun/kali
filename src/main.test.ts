/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const coreStore = vi.hoisted(() => ({ instances: [] as any[] }));
const uiStore = vi.hoisted(() => ({ instances: [] as any[] }));
const speechStore = vi.hoisted(() => ({ instances: [] as any[] }));
const setupVersionRefreshPromptMock = vi.hoisted(() => vi.fn());
const initLogBufferMock = vi.hoisted(() => vi.fn());
const appendChildMock = vi.hoisted(() => vi.fn());
const getModelMock = vi.hoisted(() => vi.fn(async () => "blob:model-url"));
const revokeObjectURLMock = vi.hoisted(() => vi.fn());

vi.mock("./config", () => ({
  CONFIG: {
    BUILD_ID: "build-123",
    UI: {
      SHOW_EXPORT_BUTTON: false,
    },
  },
}));

vi.mock("./i18n/translations", () => ({
  t: (key: string) => {
    if (key === "ui.startKali") {
      return "Start Kali";
    }
    if (key === "ui.status.initializing") {
      return "Initializing...";
    }
    if (key === "ui.iosInstallHint") {
      return "Install this app from Safari share menu.";
    }
    if (key === "ui.versionNoticeMessage") {
      return "A new version is available.";
    }
    if (key === "ui.versionRefreshButton") {
      return "Refresh";
    }
    if (key === "ui.buildLabel") {
      return "Build: ";
    }
    return key;
  },
}));

vi.mock("./kali-app-core", () => ({
  KaliAppCore: class MockKaliAppCore {
    initialized = false;
    initialize = vi.fn(async () => {
      this.initialized = true;
    });
    dispose = vi.fn(async () => {});

    constructor() {
      coreStore.instances.push(this);
    }

    isInitialized(): boolean {
      return this.initialized;
    }
  },
}));

vi.mock("./services/production-ui-service", () => ({
  ProductionUIService: class MockProductionUIService {
    setButtonState = vi.fn();
    constructor() {
      uiStore.instances.push(this);
    }
  },
}));

vi.mock("./services/speech-service", () => ({
  SpeechService: class MockSpeechService {
    prime = vi.fn();
    constructor() {
      speechStore.instances.push(this);
    }
  },
}));

vi.mock("./pwa-register", () => ({
  setupVersionRefreshPrompt: setupVersionRefreshPromptMock,
}));

vi.mock("./utils/export-logs-button", () => ({
  createExportLogsButton: vi.fn(() => ({ id: "export-logs-button" })),
}));

vi.mock("./utils/log-buffer", () => ({
  initLogBuffer: initLogBufferMock,
}));

vi.mock("./utils/logger", () => ({
  Logger: {
    setUIService: vi.fn(),
  },
}));

vi.mock("@/voice-recognition/model-manager", () => ({
  ModelManager: {
    getInstance: () => ({
      getModel: getModelMock,
    }),
  },
}));

describe("Product scenario: Main Bootstrap", () => {
  let domReadyHandler: (() => void) | null;
  let startClickHandler: (() => Promise<void>) | null;
  let elements: Record<string, any>;

  function setupDom({
    userAgent = "Desktop",
    standalone = false,
    displayModeStandalone = false,
  }: {
    userAgent?: string;
    standalone?: boolean;
    displayModeStandalone?: boolean;
  } = {}): void {
    domReadyHandler = null;
    startClickHandler = null;

    const startButton = {
      textContent: "",
      addEventListener: vi.fn((event: string, cb: () => Promise<void>) => {
        if (event === "click") {
          startClickHandler = cb;
        }
      }),
    };
    const iosHint = { textContent: "", hidden: true };
    const versionNoticeMessage = { textContent: "" };
    const versionRefresh = { textContent: "" };
    const versionCurrent = { textContent: "", title: "" };

    elements = {
      "start-button": startButton,
      "ios-install-hint": iosHint,
      "version-notice-message": versionNoticeMessage,
      "version-refresh": versionRefresh,
      "version-current": versionCurrent,
    };

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        getElementById: (id: string) => elements[id] ?? null,
        addEventListener: vi.fn((event: string, cb: () => void) => {
          if (event === "DOMContentLoaded") {
            domReadyHandler = cb;
          }
        }),
        body: {
          appendChild: appendChildMock,
        },
      },
    });

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        matchMedia: vi.fn(() => ({ matches: displayModeStandalone })),
      },
    });

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        userAgent,
        standalone,
      },
    });

    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURLMock,
      writable: true,
    });
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    coreStore.instances = [];
    uiStore.instances = [];
    speechStore.instances = [];
    setupDom();
  });

  it("Expected outcome: Start button primes speech and initializes only once", async () => {
    await import("./main");
    expect(domReadyHandler).not.toBeNull();
    domReadyHandler?.();
    await Promise.resolve();

    expect(elements["start-button"].textContent).toBe("Start Kali");
    expect(startClickHandler).not.toBeNull();

    await startClickHandler?.();
    await startClickHandler?.();

    const speech = speechStore.instances[0];
    const core = coreStore.instances[0];
    const ui = uiStore.instances[0];

    expect(speech.prime).toHaveBeenCalledTimes(1);
    expect(core.initialize).toHaveBeenCalledTimes(1);
    expect(ui.setButtonState).toHaveBeenCalledWith("Initializing...", true);
  });

  it("Expected outcome: Shows iOS install hint when not installed", async () => {
    setupDom({ userAgent: "iPhone", standalone: false, displayModeStandalone: false });

    await import("./main");
    domReadyHandler?.();
    await Promise.resolve();

    expect(elements["ios-install-hint"].hidden).toBe(false);
    expect(elements["ios-install-hint"].textContent).toBe(
      "Install this app from Safari share menu.",
    );
  });

  it("Expected outcome: Renders version labels and wires refresh prompt", async () => {
    await import("./main");
    domReadyHandler?.();
    await Promise.resolve();

    expect(elements["version-notice-message"].textContent).toBe("A new version is available.");
    expect(elements["version-refresh"].textContent).toBe("Refresh");
    expect(elements["version-current"].textContent).toBe("Build: build-123");
    expect(elements["version-current"].title).toBe("Build: build-123");
    expect(setupVersionRefreshPromptMock).toHaveBeenCalledTimes(1);
    expect(getModelMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:model-url");
  });
});
