import { t } from "../i18n/translations";
import { initLogBuffer } from "./log-buffer";

/**
 * Creates an export-logs button with shared styling and click behavior.
 * Appends to document.body; caller may move it or style the container.
 */
export function createExportLogsButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = t("ui.exportLogs");
  button.className = "export-logs-button";
  button.style.cssText = `
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    padding: 0.5rem 1rem;
    background: rgba(0, 200, 255, 0.8);
    color: #000;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
    z-index: 1000;
  `;
  button.addEventListener("click", () => {
    const buffer = initLogBuffer();
    const entries = buffer.getAll();
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: "application/json",
    });
    const name = `kali-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  return button;
}
