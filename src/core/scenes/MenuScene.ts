import { THREE.Object3D, Scene3D } from "enable3d";
import * as THREE from "three";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { Font, FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
type MenuItem = {
  text: string;
  position: THREE.Vector3;
  callback: () => void;
};
export class MenuScene extends Scene3D {
  private buttons: THREE.Object3D[] = [];
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;

  constructor() {
    super({ key: "MenuScene" });
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
  }

  init() {
    this.renderer.setClearColor(0x000000);
    this.warpSpeed();
  }
  private font!: Font;

  create() {
    // Set up camera
    this.camera.position.set(0, 0, 5);

    const menuItems: MenuItem[] = [
      { text: "Start Game", position: new THREE.Vector3(0, 10, 0), callback: () => this.startGame() },
      { text: "Options", position: new THREE.Vector3(0, 0, 0), callback: () => this.showOptions() },
      { text: "Exit", position: new THREE.Vector3(0, -100, 0), callback: () => this.exitGame() },
    ];
    const loader = new FontLoader();
    loader.load("assets/font2.json", (font) => {
      this.font = font;
      menuItems.forEach((item, index) => {
        this.createButton(item, 0, 3 - index, -0.1, () => console.log(item.text));
      });

      // Add event listener for clicks
      window.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    });

    // Add ambient and directional light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 0, 5);
    this.scene.add(ambientLight);
    this.scene.add(directionalLight);
  }

  createButton(item: MenuItem, x: number, y: number, z: number, callback: () => void) {
    const geometry = new THREE.BoxGeometry(4, 0.5, 0.1);
    const material = new THREE.MeshPhongMaterial({
      color: 0x4444ff,
      emissive: 0x111111,
      specular: 0x444444,
    });

    const buttonMesh = new THREE.Mesh(geometry, material);

    const button = new THREE.Object3D();
    button.add(buttonMesh);
    button.position.set(x, y, z);
    button.userData = { callback, text: item.text };

    this.world.add.existing(button, {
      mass: 10,
      collisionFlags: 2,
    });

    this.createText(item, button);

    this.buttons.push(button);
    this.scene.add(button);
  }

  createText(item: MenuItem, button: THREE.Object3D) {
    const geometry = new TextGeometry(item.text, {
      font: this.font,
      size: 0.3,
      height: 0.0001,
      depth: 0.00001,
      curveSegments: 12,
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.copy(new THREE.Vector3(0, 0, 0.1));
    button.add(mesh);

    mesh.userData = { callback: item.callback };
  }

  onPointerDown(event: PointerEvent) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.buttons);

    if (intersects.length > 0) {
      const button = intersects[0].object;
      button.userData.callback();
    }

    const mouse = new THREE.Vector2((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);

    const intersectsMenu = raycaster.intersectObjects(this.scene.children);
    if (intersectsMenu.length > 0) {
      const object = intersectsMenu[0].object;
      if (object.userData.callback) {
        object.userData.callback();
      }
    }
  }

  update() {
    // Hover effect
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.buttons);

    // this.buttons.forEach((button) => {
    //   if (intersects.length > 0 && intersects[0].object === button) {
    //     (button.material as THREE.MeshPhongMaterial).emissive.setHex(0x333333);
    //   } else {
    //     (button.material as THREE.MeshPhongMaterial).emissive.setHex(0x111111);
    //   }
    // });
  }

  startGame() {
    console.log("Start Game");
    // Implement start game logic
  }

  showOptions() {
    console.log("Show Options");
    // Implement show options logic
  }

  exitGame() {
    console.log("Exit Game");
    // Implement exit game logic
  }
}
