export type IndicatorState = "idle" | "listening" | "active" | "processing" | "speaking";

export interface IStatusIndicator {
  setState(state: IndicatorState): void;
  getState(): IndicatorState;
}

/**
 * No-op status indicator that accepts setState/getState but renders nothing.
 * Used by the debug UI where the pulsating orb is not shown.
 */
export class NoOpStatusIndicator {
  private currentState: IndicatorState = "idle";

  setState(state: IndicatorState): void {
    this.currentState = state;
  }

  getState(): IndicatorState {
    return this.currentState;
  }
}

export class StatusIndicator {
  private container: HTMLElement;
  private orb: HTMLElement;
  private currentState: IndicatorState = "idle";

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element with id "${containerId}" not found`);
    }
    this.container = container;
    const existing = container.querySelector(".status-orb");
    this.orb = (existing as HTMLElement) ?? this.createOrb();
    if (!existing) {
      this.container.appendChild(this.orb);
    }
  }

  private createOrb(): HTMLElement {
    const orb = document.createElement("div");
    orb.className = "status-orb idle";
    return orb;
  }

  setState(state: IndicatorState): void {
    if (this.currentState === state) {
      return;
    }

    this.orb.classList.remove(this.currentState);
    this.orb.classList.add(state);
    this.currentState = state;
  }

  getState(): IndicatorState {
    return this.currentState;
  }
}
