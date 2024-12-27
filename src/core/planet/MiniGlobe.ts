import * as THREE from "three";
import { IGameObject } from "../objects/BaseGameObject";

export interface Marker {
  mesh: THREE.Mesh;
  object: IGameObject;
}

export class MiniGlobe {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private globe: THREE.Mesh;
  private mainCamera: THREE.Camera;
  private viewportWidth: number;
  private viewportHeight: number;
  private objectMarkers: Marker[] = [];
  private markerRadius = 0.05; // Globe surface radius

  constructor(bufferGeometry: THREE.BufferGeometry, mainCamera: THREE.Camera, width: number = 200, height: number = 200) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.mainCamera = mainCamera;

    this.globe = this.createGlobe(bufferGeometry);
    this.setupScene();
    this.setupUI();
  }

  private createGlobe(bufferGeometry: THREE.BufferGeometry): THREE.Mesh {
    const radius = 0.85; // Smaller radius than the main globe
    const detail = 80; // Lower detail for the mini globe
    const icosahedronGeometry = new THREE.IcosahedronGeometry(radius, detail);

    const numPhi = 512; // Horizontal divisions
    const numTheta = 256; // Vertical divisions

    // Initialize the spherical color map
    const colorMap: THREE.Color[][] = Array.from({ length: numTheta }, () => Array(numPhi).fill(null));

    // Populate the color map with colors from bufferGeometry
    const bufferPositions = bufferGeometry.attributes.position;
    const bufferColors = bufferGeometry.attributes.color;
    const vertex = new THREE.Vector3();

    for (let i = 0; i < bufferPositions.count; i++) {
      vertex.fromBufferAttribute(bufferPositions, i).normalize();
      const theta = Math.acos(vertex.y); // 0 to PI
      const phi = (Math.atan2(vertex.z, vertex.x) + Math.PI) % (2 * Math.PI); // 0 to 2PI

      const thetaIndex = Math.min(Math.floor((theta / Math.PI) * numTheta), numTheta - 1);
      const phiIndex = Math.min(Math.floor((phi / (2 * Math.PI)) * numPhi), numPhi - 1);

      const color = new THREE.Color().fromBufferAttribute(bufferColors, i);

      if (!colorMap[thetaIndex][phiIndex]) {
        colorMap[thetaIndex][phiIndex] = color.clone();
      } else {
        // Average the colors if multiple vertices fall into the same bin
        colorMap[thetaIndex][phiIndex].lerp(color, 0.5);
      }
    }

    // Assign colors to icosahedronGeometry vertices
    const icosahedronPositions = icosahedronGeometry.attributes.position;
    const colors = new Float32Array(icosahedronPositions.count * 3);
    let lastColor = new THREE.Color(0.5, 0.5, 0.5);
    for (let i = 0; i < icosahedronPositions.count; i++) {
      vertex.fromBufferAttribute(icosahedronPositions, i).normalize();
      const theta = Math.acos(vertex.y); // 0 to PI
      const phi = (Math.atan2(vertex.z, vertex.x) + Math.PI) % (2 * Math.PI); // 0 to 2PI

      const thetaIndex = Math.min(Math.floor((theta / Math.PI) * numTheta), numTheta - 1);
      const phiIndex = Math.min(Math.floor((phi / (2 * Math.PI)) * numPhi), numPhi - 1);

      const color = colorMap[thetaIndex][phiIndex] || lastColor;
      lastColor = color;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    icosahedronGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.MeshPhongMaterial({
      side: THREE.FrontSide,
      flatShading: true,
      vertexColors: true,
    });

    const globe = new THREE.Mesh(icosahedronGeometry, material);
    icosahedronGeometry.computeVertexNormals();
    return globe;
  }

  private setupScene(): void {
    this.scene.add(this.globe);

    // Add light
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 7.5);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0xffffff));

    this.camera.position.z = 2;
  }

  private setupUI(): void {
    const miniGlobeElement = this.getElement();
    miniGlobeElement.id = "mini-globe";
    document.body.appendChild(miniGlobeElement);

    miniGlobeElement.style.zIndex = "90";
    miniGlobeElement.style.position = "absolute";
    miniGlobeElement.style.top = "10px";
    miniGlobeElement.style.right = "10px";
    miniGlobeElement.style.width = this.viewportWidth + "px";
    miniGlobeElement.style.height = this.viewportHeight + "px";
    miniGlobeElement.style.background = "#000";
    miniGlobeElement.style.borderRadius = "50%";

    const miniGlobeElementShadow = document.createElement("div");
    miniGlobeElementShadow.id = "mini-globe-shadow";
    document.body.appendChild(miniGlobeElementShadow);
    miniGlobeElementShadow.style.zIndex = "100";
    miniGlobeElementShadow.style.position = "absolute";
    miniGlobeElementShadow.style.top = "10px";
    miniGlobeElementShadow.style.right = "10px";
    miniGlobeElementShadow.style.width = this.viewportWidth + "px";
    miniGlobeElementShadow.style.height = this.viewportHeight + "px";
    miniGlobeElementShadow.style.background = "radial-gradient(circle, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,.71) 80%, rgba(0,0,0,.91) 100%)";
    miniGlobeElementShadow.style.borderRadius = "50%";
  }

  public updateGeometry(bufferGeometry: THREE.BufferGeometry): void {
    // Remove old globe
    this.scene.remove(this.globe);
    this.globe.geometry.dispose();
    (this.globe.material as THREE.Material).dispose();

    // Create new globe with updated geometry
    this.globe = this.createGlobe(bufferGeometry);
    this.scene.add(this.globe);
  }

  public update(): void {
    // Get main camera position and normalize it
    const mainCameraPos = new THREE.Vector3();
    this.mainCamera.getWorldPosition(mainCameraPos);
    const normalizedPos = mainCameraPos.clone().normalize();

    // Position our camera to look at the mini globe from the same relative direction
    const miniGlobeRadius = 2; // Camera distance from mini globe center
    this.camera.position.copy(normalizedPos.multiplyScalar(miniGlobeRadius));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);

    // Update object markers
    this.objectMarkers.forEach((marker) => {
      const objectPos = marker.object.getObject().position.clone().normalize().multiplyScalar(1);
      marker.mesh.position.copy(objectPos);
    });

    this.renderer.render(this.scene, this.camera);
  }

  public addMarkers(gameObjects: IGameObject[], color: number): void {
    this.objectMarkers = [
      ...this.objectMarkers,
      ...gameObjects.map((gameObject) => {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(this.markerRadius, 8, 8),
          new THREE.MeshLambertMaterial({ color, vertexColors: false, flatShading: true, wireframe: false })
        );

        this.scene.add(marker);
        return {
          mesh: marker,
          object: gameObject,
        } as Marker;
      }),
    ];
  }

  public getElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }
}