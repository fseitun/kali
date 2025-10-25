export type IndicatorState =
  | "idle"
  | "listening"
  | "active"
  | "processing"
  | "speaking";

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
    this.orb = this.createOrb();
    this.container.appendChild(this.orb);
  }

  private createOrb(): HTMLElement {
    const orb = document.createElement("div");
    orb.className = "status-orb idle";
    return orb;
  }

  setState(state: IndicatorState): void {
    if (this.currentState === state) return;

    this.orb.classList.remove(this.currentState);
    this.orb.classList.add(state);
    this.currentState = state;
  }

  getState(): IndicatorState {
    return this.currentState;
  }
}
