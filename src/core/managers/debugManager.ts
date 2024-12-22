type DebugValue = string | (() => string);

interface DebugElement {
  id: string;
  value: DebugValue;
}

class DebugManager {
  private static instance: DebugManager;
  private debugElements: Map<string, DebugElement> = new Map();
  private containerElement: HTMLElement | null = null;
  private on: boolean = true;

  private constructor() {
    // Create container element if it doesn't exist
    this.containerElement = document.getElementById("debugText");
    if (!this.containerElement) {
      this.containerElement = document.createElement("div");
      this.containerElement.id = "debugText";
      document.body.appendChild(this.containerElement);
    }
  }

  public static getInstance(): DebugManager {
    if (!DebugManager.instance) {
      DebugManager.instance = new DebugManager();
    }
    return DebugManager.instance;
  }

  public set(id: string, value: DebugValue): void {
    this.debugElements.set(id, { id, value });
    this.updateDisplay();
  }

  public remove(id: string): void {
    this.debugElements.delete(id);
    this.updateDisplay();
  }

  public update(id: string, value: DebugValue): void {
    if (!this.debugElements.has(id)) {
      this.set(id, value);
    } else {
      this.debugElements.set(id, { id, value });
      this.updateDisplay();
    }
  }

  public clear(): void {
    this.debugElements.clear();
    this.updateDisplay();
  }

  private updateDisplay(): void {
    if (!this.containerElement) return;

    const content = Array.from(this.debugElements.values())
      .map((element) => {
        const value = typeof element.value === "function" ? element.value() : element.value;
        return value;
      })
      .join("<br>");

    this.containerElement.innerHTML = content;
  }

  // Start auto-updating the display
  public startAutoUpdate(interval: number = 100): void {
    setInterval(() => this.updateDisplay(), interval);
  }

  public isDebugMode() {
    return this.on;
  }
}

export const debugManager = DebugManager.getInstance();
