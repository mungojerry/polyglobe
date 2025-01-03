import * as THREE from "three";
import { FBXLoader, OrbitControls } from "three-stdlib";
export class FBXViewerScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private loader: FBXLoader;
  private modelsPath: string = "assets/models/fbx/";
  private modelsPath2: string = "assets/models/nature/";
  private gridSize: number = 1.5; // Adjust grid size as needed

  private moveForward: boolean = false;
  private moveBackward: boolean = false;
  private rotateLeft: boolean = false;
  private rotateRight: boolean = false;
  private strafeLeft: boolean = false;
  private strafeRight: boolean = false;
  private moveSpeed: number = 0.2;
  private rotateSpeed: number = 0.02;

  private modelFiles: string[] = [
    "Ax_01.fbx",
    "BigRock_01.fbx",
    "BigRock_02.fbx",
    "BigRock_03.fbx",
    "Branch_01.fbx",
    "Branch_02.fbx",
    "Branch_03.fbx",
    "Branch_04.fbx",
    "Bridge_01.fbx",
    "Bush_01.fbx",
    "Bush_02.fbx",
    "Bush_03.fbx",
    "Bush_04.fbx",
    "Crystal_01.fbx",
    "Crystal_02.fbx",
    "Crystal_03.fbx",
    "Fence_01.fbx",
    "Fence_02.fbx",
    "Fence_03.fbx",
    "Fence_04.fbx",
    "Fence_05.fbx",
    "Fence_06.fbx",
    "Fire_01.fbx",
    "Fire_02.fbx",
    "Flower_01.fbx",
    "Flower_02.fbx",
    "Flower_03.fbx",
    "Flower_04.fbx",
    "Flower_05.fbx",
    "Flower_06.fbx",
    "Flower_07.fbx",
    "Flower_08.fbx",
    "Flower_09.fbx",
    "Flower_10.fbx",
    "Grass_01.fbx",
    "Grass_02.fbx",
    "Grass_03.fbx",
    "Grass_04.fbx",
    "Grass_05.fbx",
    "Grass_06.fbx",
    "Grass_07.fbx",
    "Grass_08.fbx",
    "Grass_09.fbx",
    "Grass_10.fbx",
    "Grass_11.fbx",
    "Grass_12.fbx",
    "Grass_13.fbx",
    "Gravestone_01.fbx",
    "Gravestone_02.fbx",
    "Gravestone_03.fbx",
    "Gravestone_04.fbx",
    "House_01.fbx",
    "Lantern_01.fbx",
    "Mushroom_01.fbx",
    "Mushroom_02.fbx",
    "Mushroom_03.fbx",
    "Mushroom_04.fbx",
    "Mushroom_05.fbx",
    "Mushroom_06.fbx",
    "Mushroom_07.fbx",
    "Mushroom_08.fbx",
    "Mushroom_09.fbx",
    "Mushroom_10.fbx",
    "Mushroom_11.fbx",
    "Mushroom_12.fbx",
    "Mushroom_13.fbx",
    "Mushroom_14.fbx",
    "Mushroom_15.fbx",
    "Mushroom_16.fbx",
    "Mushroom_17.fbx",
    "Mushroom_18.fbx",
    "Pointer_01.fbx",
    "Reeds_01.fbx",
    "Rock_01.fbx",
    "Rock_02.fbx",
    "Rock_03.fbx",
    "Rock_04.fbx",
    "Rock_05.fbx",
    "Rock_06.fbx",
    "Rock_07.fbx",
    "Rock_08.fbx",
    "Rock_09.fbx",
    "Rock_10.fbx",
    "Rock_11.fbx",
    "Rock_12.fbx",
    "Rock_13.fbx",
    "Rock_14.fbx",
    "Rock_15.fbx",
    "Rock_16.fbx",
    "Rock_17.fbx",
    "Rock_18.fbx",
    "Rock_19.fbx",
    "Ruins_01.fbx",
    "Ruins_02.fbx",
    "Ruins_03.fbx",
    "Ruins_04.fbx",
    "Ruins_05.fbx",
    "Ruins_06.fbx",
    "Ruins_07.fbx",
    "Ruins_08.fbx",
    "Ruins_09.fbx",
    "Stump_01.fbx",
    "Stump_02.fbx",
    "Stump_03.fbx",
    "Stump_04.fbx",
    "Stump_05.fbx",
    "Stump_06.fbx",
    "Stump_07.fbx",
    "Stump_08.fbx",
    "Stump_09.fbx",
    "Stump_10.fbx",
    "Stump_11.fbx",
    "Tile_01.fbx",
    "Tile_02.fbx",
    "Tile_03.fbx",
    "Tile_04.fbx",
    "Tile_05.fbx",
    "Tile_06.fbx",
    "Tile_07.fbx",
    "Tile_08.fbx",
    "Tree_01.fbx",
    "Tree_02.fbx",
    "Tree_03.fbx",
    "Tree_04.fbx",
    "Tree_05.fbx",
    "Tree_06.fbx",
    "Tree_07.fbx",
    "Tree_08.fbx",
    "Tree_09.fbx",
    "Tree_10.fbx",
    "Tree_11.fbx",
    "Tree_12.fbx",
    "Tree_13.fbx",
    "Tree_14.fbx",
    "Tree_15.fbx",
    "Tree_16.fbx",
    "Tree_17.fbx",
    "Tree_18.fbx",
    "Tree_19.fbx",
    "Tree_20.fbx",
    "Tree_21.fbx",
    "Tree_22.fbx",
    "Tree_23.fbx",
    "Tree_24.fbx",
    "Tree_25.fbx",
    "Tree_26.fbx",
    "Tree_27.fbx",
    "Tree_28.fbx",
    "Tree_29.fbx",
    "Tree_30.fbx",
    "Tree_31.fbx",
    "Tree_32.fbx",
  ];

  modelFiles2 = [
    "BirchTree_1.fbx",
    "BirchTree_2.fbx",
    "BirchTree_3.fbx",
    "BirchTree_4.fbx",
    "BirchTree_5.fbx",
    "BirchTree_Autumn_1.fbx",
    "BirchTree_Autumn_2.fbx",
    "BirchTree_Autumn_3.fbx",
    "BirchTree_Autumn_4.fbx",
    "BirchTree_Autumn_5.fbx",
    "BirchTree_Dead_1.fbx",
    "BirchTree_Dead_2.fbx",
    "BirchTree_Dead_3.fbx",
    "BirchTree_Dead_4.fbx",
    "BirchTree_Dead_5.fbx",
    "BirchTree_Dead_Snow_1.fbx",
    "BirchTree_Dead_Snow_2.fbx",
    "BirchTree_Dead_Snow_3.fbx",
    "BirchTree_Dead_Snow_4.fbx",
    "BirchTree_Dead_Snow_5.fbx",
    "BirchTree_Snow_1.fbx",
    "BirchTree_Snow_2.fbx",
    "BirchTree_Snow_3.fbx",
    "BirchTree_Snow_4.fbx",
    "BirchTree_Snow_5.fbx",
    "BushBerries_1.fbx",
    "BushBerries_2.fbx",
    "Bush_1.fbx",
    "Bush_2.fbx",
    "Bush_Snow_1.fbx",
    "Bush_Snow_2.fbx",
    "CactusFlower_1.fbx",
    "CactusFlowers_2.fbx",
    "CactusFlowers_3.fbx",
    "CactusFlowers_4.fbx",
    "CactusFlowers_5.fbx",
    "Cactus_1.fbx",
    "Cactus_2.fbx",
    "Cactus_3.fbx",
    "Cactus_4.fbx",
    "Cactus_5.fbx",
    "CommonTree_1.fbx",
    "CommonTree_2.fbx",
    "CommonTree_3.fbx",
    "CommonTree_4.fbx",
    "CommonTree_5.fbx",
    "CommonTree_Autumn_1.fbx",
    "CommonTree_Autumn_2.fbx",
    "CommonTree_Autumn_3.fbx",
    "CommonTree_Autumn_4.fbx",
    "CommonTree_Autumn_5.fbx",
    "CommonTree_Dead_1.fbx",
    "CommonTree_Dead_2.fbx",
    "CommonTree_Dead_3.fbx",
    "CommonTree_Dead_4.fbx",
    "CommonTree_Dead_5.fbx",
    "CommonTree_Dead_Snow_1.fbx",
    "CommonTree_Dead_Snow_2.fbx",
    "CommonTree_Dead_Snow_3.fbx",
    "CommonTree_Dead_Snow_4.fbx",
    "CommonTree_Dead_Snow_5.fbx",
    "CommonTree_Snow_1.fbx",
    "CommonTree_Snow_2.fbx",
    "CommonTree_Snow_3.fbx",
    "CommonTree_Snow_4.fbx",
    "CommonTree_Snow_5.fbx",
    "Corn_1.fbx",
    "Corn_2.fbx",
    "Flowers.fbx",
    "Grass.fbx",
    "Grass_2.fbx",
    "Grass_Short.fbx",
    "Lilypad.fbx",
    "PalmTree_1.fbx",
    "PalmTree_2.fbx",
    "PalmTree_3.fbx",
    "PalmTree_4.fbx",
    "PineTree_1.fbx",
    "PineTree_2.fbx",
    "PineTree_3.fbx",
    "PineTree_4.fbx",
    "PineTree_5.fbx",
    "PineTree_Autumn_1.fbx",
    "PineTree_Autumn_2.fbx",
    "PineTree_Autumn_3.fbx",
    "PineTree_Autumn_4.fbx",
    "PineTree_Autumn_5.fbx",
    "PineTree_Snow_1.fbx",
    "PineTree_Snow_2.fbx",
    "PineTree_Snow_3.fbx",
    "PineTree_Snow_4.fbx",
    "PineTree_Snow_5.fbx",
    "Plant_1.fbx",
    "Plant_2.fbx",
    "Plant_3.fbx",
    "Plant_4.fbx",
    "Plant_5.fbx",
    "Rock_1.fbx",
    "Rock_2.fbx",
    "Rock_3.fbx",
    "Rock_4.fbx",
    "Rock_5.fbx",
    "Rock_6.fbx",
    "Rock_7.fbx",
    "Rock_Moss_1.fbx",
    "Rock_Moss_2.fbx",
    "Rock_Moss_3.fbx",
    "Rock_Moss_4.fbx",
    "Rock_Moss_5.fbx",
    "Rock_Moss_6.fbx",
    "Rock_Moss_7.fbx",
    "Rock_Snow_1.fbx",
    "Rock_Snow_2.fbx",
    "Rock_Snow_3.fbx",
    "Rock_Snow_4.fbx",
    "Rock_Snow_5.fbx",
    "Rock_Snow_6.fbx",
    "Rock_Snow_7.fbx",
    "TreeStump.fbx",
    "TreeStump_Moss.fbx",
    "TreeStump_Snow.fbx",
    "Wheat.fbx",
    "Willow_1.fbx",
    "Willow_2.fbx",
    "Willow_3.fbx",
    "Willow_4.fbx",
    "Willow_5.fbx",
    "Willow_Autumn_1.fbx",
    "Willow_Autumn_2.fbx",
    "Willow_Autumn_3.fbx",
    "Willow_Autumn_4.fbx",
    "Willow_Autumn_5.fbx",
    "Willow_Dead_1.fbx",
    "Willow_Dead_2.fbx",
    "Willow_Dead_3.fbx",
    "Willow_Dead_4.fbx",
    "Willow_Dead_5.fbx",
    "Willow_Dead_Snow_1.fbx",
    "Willow_Dead_Snow_2.fbx",
    "Willow_Dead_Snow_3.fbx",
    "Willow_Dead_Snow_4.fbx",
    "Willow_Dead_Snow_5.fbx",
    "Willow_Snow_1.fbx",
    "Willow_Snow_2.fbx",
    "Willow_Snow_3.fbx",
    "Willow_Snow_4.fbx",
    "Willow_Snow_5.fbx",
    "WoodLog.fbx",
    "WoodLog_Moss.fbx",
    "WoodLog_Snow.fbx",
  ];
  private controls!: OrbitControls;
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 2, 10);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    // Add a green floor
    const floorGeometry = new THREE.PlaneGeometry(200, 200); // Adjust size as needed
    const floorMaterial = new THREE.MeshPhongMaterial({ color: 0x00bb00, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.receiveShadow = true;
    floor.rotation.x = -Math.PI / 2; // Rotate the floor to lie horizontally
    floor.position.y = 0; // Position the floor below the models
    this.scene.add(floor);

    // this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    // this.controls.enableDamping = true; // Smooth camera movement
    // this.controls.dampingFactor = 0.05;
    // this.controls.enableZoom = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 4096;
    directionalLight.shadow.mapSize.height = 4096;

    const shadowCameraSize = 50;
    directionalLight.target = floor;
    this.scene.add(directionalLight.target);
    directionalLight.shadow.camera.left = -shadowCameraSize;
    directionalLight.shadow.camera.right = shadowCameraSize;
    directionalLight.shadow.camera.top = shadowCameraSize;
    directionalLight.shadow.camera.bottom = -shadowCameraSize;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 4700;
    directionalLight.shadow.bias = -0.00001;
    directionalLight.shadow.normalBias = 0.02;
    directionalLight.position.set(0, 600, 600);
    this.scene.add(directionalLight);

    const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    this.scene.add(shadowHelper);

    this.loader = new FBXLoader();
    this.loadModels();

    const gridHelper = new THREE.GridHelper(100, 100);
    this.scene.add(gridHelper);
    this.animate();

    this.addEventListeners();
  }

  private addEventListeners() {
    window.addEventListener("keydown", this.onKeyDown, false);
    window.addEventListener("keyup", this.onKeyUp, false);
  }
  private onKeyDown = (event: KeyboardEvent) => {
    switch (event.code) {
      case "KeyW":
        this.moveForward = true;
        break;
      case "KeyS":
        this.moveBackward = true;
        break;
      case "KeyA":
        this.rotateLeft = true;
        break;
      case "KeyD":
        this.rotateRight = true;
        break;
      case "KeyQ":
        this.strafeLeft = true;
        break;
      case "KeyE":
        this.strafeRight = true;
        break;
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    switch (event.code) {
      case "KeyW":
        this.moveForward = false;
        break;
      case "KeyS":
        this.moveBackward = false;
        break;
      case "KeyA":
        this.rotateLeft = false;
        break;
      case "KeyD":
        this.rotateRight = false;
        break;
      case "KeyQ":
        this.strafeLeft = false;
        break;
      case "KeyE":
        this.strafeRight = false;
        break;
    }
  };

  private loadModels() {
    const columns = Math.ceil(Math.sqrt(this.modelFiles2.length));
    const spacing = this.gridSize * 5;

    this.modelFiles2.forEach((file, index) => {
      this.loader.load(
        `${this.modelsPath2}${file}`,
        (object) => {
          const row = Math.floor(index / columns);
          const col = index % columns;
          object.position.set((col - Math.floor(columns / 2)) * spacing, 0, (row - Math.floor(columns / 2)) * spacing);
          this.scene.add(object);
          object.castShadow = true;
          object.receiveShadow = true;
          object.scale.set(0.01, 0.01, 0.01);
          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              if (child.material) {
                child.material.transparent = false;
                child.material.opacity = 1;
                child.material.shininess = 0;
                child.material.vertexColors = false;
                child.material.flatShading = true;
                child.material.reflectivity = 0;
                child.material.side = THREE.FrontSide;
              }
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          // Create and add label
          const label = this.createLabelSprite(file);
          label.position.set(
            object.position.x,
            object.position.y + 2, // Adjust height as needed
            object.position.z + 0.8
          );
          this.scene.add(label);
        },
        undefined,
        (error) => {
          console.error(`Error loading ${file}:`, error);
        }
      );
    });
  }

  private createLabelSprite(text: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to get canvas context");
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    const fontSize = 48;
    context.font = `${fontSize * devicePixelRatio}px Arial`;
    const textMetrics = context.measureText(text);
    const padding = 2 * devicePixelRatio;
    canvas.width = (textMetrics.width + padding * 2) * devicePixelRatio;
    canvas.height = (fontSize + padding * 2) * devicePixelRatio;

    // Scale the context to account for device pixel ratio
    context.scale(devicePixelRatio, devicePixelRatio);

    // Background
    context.fillStyle = "rgba(0, 0, 0, 0.5)";
    context.fillRect(0, 0, canvas.width / devicePixelRatio, canvas.height / devicePixelRatio);

    // Text
    context.fillStyle = "white";
    context.textBaseline = "middle";
    context.textAlign = "center";
    context.fillText(text, canvas.width / devicePixelRatio / 2, canvas.height / devicePixelRatio / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter; // Improve texture rendering

    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMaterial);

    // Adjust the sprite scale based on the text size and device pixel ratio
    const spriteScale = new THREE.Vector3((textMetrics.width + padding * 2) / 100, (fontSize + padding * 2) / 100, 1);
    sprite.scale.copy(spriteScale);

    return sprite;
  }
  private animate = () => {
    requestAnimationFrame(this.animate);

    // Update camera rotation based on key presses
    if (this.rotateLeft) this.camera.rotation.y += this.rotateSpeed;
    if (this.rotateRight) this.camera.rotation.y -= this.rotateSpeed;

    // Calculate forward direction based on camera's rotation
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    direction.y = 0; // Keep movement horizontal
    direction.normalize();

    // Update camera position based on key presses and direction
    if (this.moveForward) this.camera.position.add(direction.clone().multiplyScalar(this.moveSpeed));
    if (this.moveBackward) this.camera.position.sub(direction.clone().multiplyScalar(this.moveSpeed));

    const right = direction.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    if (this.strafeLeft) this.camera.position.sub(right.multiplyScalar(this.moveSpeed));
    if (this.strafeRight) this.camera.position.add(right.multiplyScalar(this.moveSpeed));

    // this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
