interface LoadingStage {
  name: string;
  progress: number;
  color: string;
}

export class LoadingScreen {
  private container: HTMLDivElement;
  private stages: LoadingStage[] = [
    { name: "Generating Land", progress: 0, color: "#4ade80" }, // Green
    { name: "Creating Chunks", progress: 0, color: "#60a5fa" }, // Blue
    { name: "Placing Objects", progress: 0, color: "#f472b6" }, // Pink
    { name: "Initializing World", progress: 0, color: "#fbbf24" }, // Yellow
  ];
  private currentStageIndex: number = 0;
  private visible: boolean = false;

  constructor() {
    this.container = document.createElement("div");
    this.container.className = "loader";

    // Title
    const title = document.createElement("h1");
    title.textContent = "Loading World";
    title.style.color = "#ffffff";
    title.style.marginBottom = "40px";
    title.style.fontSize = "2.5em";
    title.style.textShadow = "0 0 10px rgba(255, 255, 255, 0.5)";
    this.container.appendChild(title);

    // Progress bars container
    const progressContainer = document.createElement("div");
    progressContainer.style.width = "60%";
    progressContainer.style.maxWidth = "600px";
    this.container.appendChild(progressContainer);

    // Create progress bars for each stage
    this.stages.forEach((stage) => {
      const stageContainer = document.createElement("div");
      stageContainer.style.marginBottom = "20px";

      const label = document.createElement("div");
      label.style.display = "flex";
      label.style.justifyContent = "space-between";
      label.style.marginBottom = "5px";
      label.style.color = "#ffffff";

      const stageName = document.createElement("span");
      stageName.textContent = stage.name;
      label.appendChild(stageName);

      const percentage = document.createElement("span");
      percentage.textContent = "0%";
      percentage.id = `progress-${stage.name.replace(/\s+/g, "-").toLowerCase()}`;
      label.appendChild(percentage);

      const progressBar = document.createElement("div");
      progressBar.style.width = "100%";
      progressBar.style.height = "10px";
      progressBar.style.backgroundColor = "#1f2937";
      progressBar.style.borderRadius = "5px";
      progressBar.style.overflow = "hidden";

      const progress = document.createElement("div");
      progress.id = `bar-${stage.name.replace(/\s+/g, "-").toLowerCase()}`;
      progress.style.width = "0%";
      progress.style.height = "100%";
      progress.style.backgroundColor = stage.color;
      progress.style.transition = "width 0.3s ease-in-out";
      progress.style.borderRadius = "5px";

      progressBar.appendChild(progress);
      stageContainer.appendChild(label);
      stageContainer.appendChild(progressBar);
      progressContainer.appendChild(stageContainer);
    });

    // Overall progress
    const overallContainer = document.createElement("div");
    overallContainer.style.width = "60%";
    overallContainer.style.maxWidth = "600px";
    overallContainer.style.marginTop = "20px";

    const overallLabel = document.createElement("div");
    overallLabel.style.display = "flex";
    overallLabel.style.justifyContent = "space-between";
    overallLabel.style.marginBottom = "5px";
    overallLabel.style.color = "#ffffff";

    const overallText = document.createElement("span");
    overallText.textContent = "Overall Progress";
    overallLabel.appendChild(overallText);

    const overallPercentage = document.createElement("span");
    overallPercentage.textContent = "0%";
    overallPercentage.id = "progress-overall";
    overallLabel.appendChild(overallPercentage);

    const overallBar = document.createElement("div");
    overallBar.style.width = "100%";
    overallBar.style.height = "15px";
    overallBar.style.backgroundColor = "#1f2937";
    overallBar.style.borderRadius = "7.5px";
    overallBar.style.overflow = "hidden";

    const overallProgress = document.createElement("div");
    overallProgress.id = "bar-overall";
    overallProgress.style.width = "0%";
    overallProgress.style.height = "100%";
    overallProgress.style.background = "linear-gradient(90deg, #4ade80, #60a5fa, #f472b6, #fbbf24)";
    overallProgress.style.transition = "width 0.3s ease-in-out";
    overallProgress.style.borderRadius = "7.5px";

    overallBar.appendChild(overallProgress);
    overallContainer.appendChild(overallLabel);
    overallContainer.appendChild(overallBar);
    this.container.appendChild(overallContainer);
  }

  public show(): void {
    if (!this.visible) {
      document.body.appendChild(this.container);
      // Force reflow to ensure transition works
      this.container.offsetHeight;
      this.container.style.opacity = "1";
      this.visible = true;
    }
  }

  public hide(): void {
    if (this.visible) {
      this.container.style.opacity = "0";
      setTimeout(() => {
        if (this.container.parentNode) {
          document.body.removeChild(this.container);
        }
        this.visible = false;
      }, 500);
    }
  }

  public updateStage(stageName: string, progress: number): void {
    if (progress === 0) return;
    const stage = this.stages.find((s) => s.name === stageName);
    if (stage) {
      stage.progress = Math.min(100, Math.max(0, progress));

      this.updateUI();
    }
  }

  private updateUI(): void {
    this.stages.forEach((stage) => {
      const barElement = document.getElementById(`bar-${stage.name.replace(/\s+/g, "-").toLowerCase()}`);
      const percentElement = document.getElementById(`progress-${stage.name.replace(/\s+/g, "-").toLowerCase()}`);

      if (barElement && percentElement) {
        barElement.style.width = `${stage.progress}%`;
        percentElement.textContent = `${Math.round(stage.progress)}%`;
      }
    });

    // Update overall progress
    const overallProgress = this.stages.reduce((sum, stage) => sum + stage.progress, 0) / this.stages.length;
    const overallBar = document.getElementById("bar-overall");
    const overallPercentage = document.getElementById("progress-overall");

    if (overallBar && overallPercentage) {
      overallBar.style.width = `${overallProgress}%`;
      overallPercentage.textContent = `${Math.round(overallProgress)}%`;
    }
  }

  public setStageComplete(stageName: string): void {
    this.updateStage(stageName, 100);
  }

  public reset(): void {
    this.stages.forEach((stage) => {
      stage.progress = 0;
    });
    this.updateUI();
  }
}
