// Base interface
interface BaseControlElement {
  id: string;
  label: string;
  type: "slider" | "checkbox" | "button" | "dropdown" | "color" | "accordion";
}

// Specific control interfaces
export interface SliderElement extends BaseControlElement {
  type: "slider";
  getValue: () => number;
  setValue: (value: number) => void;
  min: number;
  max: number;
  step: number;
}

export interface CheckboxElement extends BaseControlElement {
  type: "checkbox";
  getValue: () => boolean;
  setValue: (value: boolean) => void;
}

export interface ButtonElement extends BaseControlElement {
  type: "button";
  callback: () => void;
}

// Add new dropdown interface
export interface DropdownElement extends BaseControlElement {
  type: "dropdown";
  getValue: () => string;
  setValue: (value: string) => void;
  options: string[];
}

// Add new color interface
export interface ColorElement extends BaseControlElement {
  type: "color";
  getValue: () => string;
  setValue: (value: string) => void;
}

// Add to existing interfaces
export interface AccordionElement extends BaseControlElement {
  type: "accordion";
  children: ControlElement[];
  expanded: boolean;
}

// Union type for all controls
type ControlElement = SliderElement | CheckboxElement | ButtonElement | DropdownElement | ColorElement | AccordionElement;

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

function isDropdown(control: ControlElement): control is DropdownElement {
  return control.type === "dropdown";
}

// Add type guard
function isColor(control: ControlElement): control is ColorElement {
  return control.type === "color";
}

// Add type guard
function isAccordion(control: ControlElement): control is AccordionElement {
  return control.type === "accordion";
}

class ControlManager {
  private static instance: ControlManager;
  private controlElements: Map<string, ControlElement> = new Map();
  private containerElement: HTMLElement | null = null;

  private constructor() {
    // Create container element if it doesn't exist
    this.containerElement = document.getElementById("control-panel");
    if (!this.containerElement) {
      this.containerElement = document.createElement("div");
      this.containerElement.id = "control-panel";
      document.body.appendChild(this.containerElement);
    }
  }

  public hidden: boolean = false;

  public static getInstance(): ControlManager {
    if (!ControlManager.instance) {
      ControlManager.instance = new ControlManager();
    }

    ControlManager.instance.addButton("hideshow", ">", () => {
      if (ControlManager.instance.containerElement) {
        ControlManager.instance.hidden = !ControlManager.instance.hidden;
        if (ControlManager.instance.hidden) {
          ControlManager.instance.containerElement.style.width = "450px";
          ControlManager.instance.containerElement.style.height = "auto";
        } else {
          ControlManager.instance.containerElement.style.width = "30px";
          ControlManager.instance.containerElement.style.height = "30px";
        }
      }
    });
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

  public addColor(id: string, label: string, getValue: () => string, setValue: (value: string) => void): void {
    this.controlElements.set(id, { id, label, getValue, setValue, type: "color" });
    this.updateDisplay();
  }

  public addAccordion(id: string, label: string): void {
    this.controlElements.set(id, {
      id,
      label,
      type: "accordion",
      children: [],
      expanded: false,
    });
    this.updateDisplay();
  }

  public addChildToAccordion(accordionId: string, childControl: ControlElement): void {
    const accordion = this.controlElements.get(accordionId);
    if (accordion && isAccordion(accordion)) {
      accordion.children.push(childControl);
      this.updateDisplay();
    }
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
    select.className = "dropdown-select";

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

  private createColorElement(element: ColorElement, controlWrapper: HTMLDivElement): void {
    const container = document.createElement("div");

    container.className = "control-container";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = element.getValue();
    colorInput.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      element.setValue(target.value);
    });

    container.appendChild(colorInput);
    controlWrapper.appendChild(container);
  }

  private createAccordionElement(element: AccordionElement, controlWrapper: HTMLDivElement): void {
    const accordianWrapper = document.createElement("div");
    accordianWrapper.className = "accordion-wrapper";
    const header = document.createElement("div");
    header.className = "accordion-header";
    header.innerHTML = `
      <span>${element.label}</span>
      <span class="accordion-icon">${element.expanded ? "−" : "+"}</span>
    `;

    const content = document.createElement("div");
    content.className = "accordion-content";
    content.style.display = element.expanded ? "block" : "none";

    header.onclick = () => {
      element.expanded = !element.expanded;
      header.innerHTML = `
      <span>${element.label}</span>
      <span class="accordion-icon">${element.expanded ? "−" : "+"}</span>
    `;
      content.style.display = element.expanded ? "block" : "none";
    };

    // Recursively render child controls
    element.children.forEach((childElement) => {
      const childWrapper = this.createControlWrapper(childElement);
      this.renderControl(childElement, childWrapper);
      content.appendChild(childWrapper);
    });

    accordianWrapper.appendChild(header);
    accordianWrapper.appendChild(content);
    controlWrapper.appendChild(accordianWrapper);
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
    if (element.type !== "button" && element.type !== "accordion") {
      const label = document.createElement("label");
      label.id = "#" + element.id + "_label";
      label.innerText = element.label;
      controlWrapper.appendChild(label);
    }
    return controlWrapper;
  }

  private renderControl(element: ControlElement, wrapper: HTMLDivElement): void {
    switch (element.type) {
      case "slider":
        this.createSlider(element, wrapper);
        break;
      case "checkbox":
        this.createCheckbox(element, wrapper);
        break;
      case "button":
        this.createButton(element, wrapper);
        break;
      case "dropdown":
        this.createDropdownElement(element, wrapper);
        break;
      case "color":
        this.createColorElement(element, wrapper);
        break;
      case "accordion":
        this.createAccordionElement(element, wrapper);
        break;
    }
  }

  public updateDisplay(componentsToUpdate?: string[]): void {
    if (!this.containerElement) return;

    this.clearContainer(componentsToUpdate);

    this.controlElements.forEach((element) => {
      if (componentsToUpdate && !componentsToUpdate.includes(element.id)) return;
      const controlWrapper = this.createControlWrapper(element);
      this.renderControl(element, controlWrapper);
      this.containerElement?.appendChild(controlWrapper);
    });
  }
}

export const controlManager = ControlManager.getInstance();
