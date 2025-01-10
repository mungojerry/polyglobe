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
  private markerRadius = 10;

  constructor(bufferGeometry: THREE.BufferGeometry, mainCamera: THREE.Camera, width: number = 200, height: number = 200) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.mainCamera = mainCamera;

    this.globe = this.createGlobe(bufferGeometry);
    this.setupScene();
    this.setupUI();
  }

  dispose() {
    // Remove and dispose of all markers
    this.objectMarkers.forEach((marker) => {
      this.scene.remove(marker.mesh);
      marker.mesh.geometry.dispose();
      (marker.mesh.material as THREE.Material).dispose();
    });
    this.objectMarkers = [];

    // Remove and dispose of the globe
    this.scene.remove(this.globe);
    this.globe.geometry.dispose();
    (this.globe.material as THREE.Material).dispose();

    // Remove UI elements
    const miniGlobe = document.getElementById("mini-globe");
    const miniGlobeShadow = document.getElementById("mini-globe-shadow");
    miniGlobe?.remove();
    miniGlobeShadow?.remove();

    // Dispose of renderer
    if (this.renderer) this.renderer.dispose();
  }

  private createGlobe(bufferGeometry: THREE.BufferGeometry): THREE.Mesh {
    const landGeometry = bufferGeometry.clone();
    const material = new THREE.MeshPhongMaterial({
      side: THREE.FrontSide,
      flatShading: true,
      vertexColors: true,
    });

    const globe = new THREE.Mesh(landGeometry, material);
    landGeometry.computeVertexNormals();
    return globe;
  }

  private setupScene(): void {
    this.scene.add(this.globe);

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
    this.scene.remove(this.globe);
    this.globe.geometry.dispose();
    (this.globe.material as THREE.Material).dispose();

    this.globe = this.createGlobe(bufferGeometry);
    this.scene.add(this.globe);
  }

  public update(): void {
    const mainCameraPos = new THREE.Vector3();
    this.mainCamera.getWorldPosition(mainCameraPos);
    const normalizedPos = mainCameraPos.clone().normalize();

    const miniGlobeRadius = 3000;
    this.camera.position.copy(normalizedPos.multiplyScalar(miniGlobeRadius));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);

    this.objectMarkers.forEach((marker) => {
      const objectPos = marker.object.getObject().position.clone(); //.normalize().multiplyScalar(1);
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
