// Base interface
interface BaseControlElement {
  id: string;
  label: string;
  type: "slider" | "checkbox" | "button" | "dropdown";
}

// Specific control interfaces
interface SliderElement extends BaseControlElement {
  type: "slider";
  getValue: () => number;
  setValue: (value: number) => void;
  min: number;
  max: number;
  step: number;
}

interface CheckboxElement extends BaseControlElement {
  type: "checkbox";
  getValue: () => boolean;
  setValue: (value: boolean) => void;
}

interface ButtonElement extends BaseControlElement {
  type: "button";
  callback: () => void;
}

// Add new dropdown interface
interface DropdownElement extends BaseControlElement {
  type: "dropdown";
  getValue: () => string;
  setValue: (value: string) => void;
  options: string[];
}

// Union type for all controls
type ControlElement = SliderElement | CheckboxElement | ButtonElement | DropdownElement;

// Type guards
function isSlider(control: ControlElement): control is SliderElement {
  return control.type === "slider";
}

function isCheckbox(control: ControlElement): control is CheckboxElement {
  return control.type === "checkbox";
}

function isButton(control: ControlElement): control is ButtonElement {
  return control.type === "button";
}

// Add type guard
function isDropdown(control: ControlElement): control is DropdownElement {
  return control.type === "dropdown";
}

class ControlManager {
  private static instance: ControlManager;
  private controlElements: Map<string, ControlElement> = new Map();
  private containerElement: HTMLElement | null = null;

  private constructor() {
    // Create container element if it doesn't exist
    this.containerElement = document.getElementById("controlPanel");
    if (!this.containerElement) {
      this.containerElement = document.createElement("div");
      this.containerElement.id = "controlPanel";
      document.body.appendChild(this.containerElement);
    }

    // Add this CSS
    const style = document.createElement("style");
    style.textContent = `
    
    `;
    document.head.appendChild(style);
  }

  public static getInstance(): ControlManager {
    if (!ControlManager.instance) {
      ControlManager.instance = new ControlManager();
    }
    return ControlManager.instance;
  }

  public addSlider(id: string, label: string, getValue: () => number, setValue: (value: number) => void, min: number, max: number, step: number): void {
    this.controlElements.set(id, { id, label, getValue, setValue, type: "slider", min, max, step });
    this.updateDisplay();
  }

  public addCheckbox(id: string, label: string, getValue: () => boolean, setValue: (value: boolean) => void): void {
    this.controlElements.set(id, { id, label, getValue, setValue, type: "checkbox" });
    this.updateDisplay();
  }
  public addButton(id: string, label: string, callback: () => void): void {
    this.controlElements.set(id, { id, label, callback, type: "button" });
    this.updateDisplay();
  }

  public addDropdown(id: string, label: string, getValue: () => string, setValue: (value: string) => void, options: string[]): void {
    this.controlElements.set(id, {
      id,
      label,
      type: "dropdown",
      getValue,
      setValue,
      options,
    });
    this.updateDisplay();
  }

  private createButton(element: ControlElement, controlWrapper: HTMLDivElement) {
    const button = document.createElement("button");

    button.className = "button-container";
    button.innerText = element.label || element.id;
    button.onclick = () => {
      if (isButton(element)) {
        element.callback();
      }
    };
    controlWrapper.appendChild(button);
  }
  private createSlider(element: ControlElement, controlWrapper: HTMLDivElement) {
    if (isSlider(element)) {
      this.createSliderControl(element, controlWrapper);
    }
  }

  private createSliderControl(element: SliderElement, controlWrapper: HTMLDivElement): void {
    const sliderContainer = document.createElement("div");

    sliderContainer.className = "slider-container";

    // Min value label
    const minLabel = document.createElement("span");
    minLabel.textContent = element.min.toString();
    minLabel.className = "slider-min";

    // Slider input
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = element.min.toString();
    slider.max = element.max.toString();
    slider.step = element.step.toString();
    slider.value = element.getValue().toString();
    slider.className = "slider-input";

    // Value display
    const valueDisplay = document.createElement("span");
    valueDisplay.textContent = element.getValue().toString();
    valueDisplay.className = "slider-value";

    // Max value label
    const maxLabel = document.createElement("span");
    maxLabel.textContent = element.max.toString();
    maxLabel.className = "slider-max";

    // Update value display and call setValue on change
    slider.oninput = () => {
      const value = parseFloat(slider.value);
      valueDisplay.textContent = value.toString();
      element.setValue(value);
    };

    sliderContainer.appendChild(minLabel);
    sliderContainer.appendChild(slider);
    sliderContainer.appendChild(maxLabel);
    sliderContainer.appendChild(valueDisplay);
    controlWrapper.appendChild(sliderContainer);
  }

  private createCheckbox(element: ControlElement, controlWrapper: HTMLDivElement) {
    const input = document.createElement("input");

    input.type = "checkbox";
    if (isCheckbox(element)) {
      input.checked = element.getValue();
      input.onchange = () => {
        const newValue = input.checked;
        element.setValue(newValue);
      };
    }
    controlWrapper.appendChild(input);
  }

  private createDropdownElement(element: DropdownElement, controlWrapper: HTMLDivElement): void {
    const container = document.createElement("div");

    container.className = "control-container";

    const select = document.createElement("select");

    element.options.forEach((option) => {
      const optElement = document.createElement("option");
      optElement.value = option;
      optElement.textContent = option;
      select.appendChild(optElement);
    });

    select.value = element.getValue();
    select.addEventListener("change", (e) => {
      const target = e.target as HTMLSelectElement;
      element.setValue(target.value);
    });

    container.appendChild(select);
    controlWrapper.appendChild(container);
  }

  private clearContainer(componentsToUpdate?: string[]) {
    if (!this.containerElement) return;

    if (componentsToUpdate) {
      componentsToUpdate.forEach((component) => {
        const el = document.getElementById("#" + component);
        if (el) {
          el.remove();
        }
        const label = document.getElementById("#" + component + "_label");
        if (label) {
          label.remove();
        }
      });
    } else {
      this.containerElement.innerHTML = "";
    }
  }

  private createControlWrapper(element: ControlElement): HTMLDivElement {
    const controlWrapper = document.createElement("div");
    controlWrapper.id = "#" + element.id;
    controlWrapper.className = "control-wrapper";
    if (element.type !== "button") {
      const label = document.createElement("label");
      label.id = "#" + element.id + "_label";
      label.innerText = element.label;
      controlWrapper.appendChild(label);
    }
    return controlWrapper;
  }

  public updateDisplay(componentsToUpdate?: string[]): void {
    if (!this.containerElement) return;

    this.clearContainer(componentsToUpdate);

    this.controlElements.forEach((element) => {
      if (componentsToUpdate && !componentsToUpdate.includes(element.id)) return;
      const controlWrapper = this.createControlWrapper(element);
      switch (element.type) {
        case "slider":
          this.createSlider(element, controlWrapper);
          break;
        case "checkbox":
          this.createCheckbox(element, controlWrapper);
          break;
        case "button":
          this.createButton(element, controlWrapper);
          break;
        case "dropdown":
          this.createDropdownElement(element, controlWrapper);
          break;
      }

      this.containerElement?.appendChild(controlWrapper);
    });
  }
}

export const controlManager = ControlManager.getInstance();
