import { GameScene } from "./core/scenes/GameScene";
import "./style.css";

// let mode = "GAME";

// if (mode === "PLAY") {
//   new PlaygroundScene();
// } else if (mode === "TEST") {
//   // set your project configs for test scene
//   const config = { scenes: [TestScene] };

//   // load the ammo.js file and start the project
//   PhysicsLoader("src/ammo", () => new Project(config));
// } else if (mode === "MENU") {
//   console.log("MENU");

//   // set your project configs
//   const config = { scenes: [MenuScene] };

//   // load the ammo.js file from the /lib folder and start the project
//   PhysicsLoader("src/ammo", () => new Project(config));
// } else {
//   // set your project configs
//   const config = { scenes: [GameScene] };

//   // load the ammo.js file from the /lib folder and start the project
//   PhysicsLoader("src/ammo", () => new Project(config));
// }

// Create a test scene
// const testScene = new TestPhysicsScene();

// // Add random objects to the scene
// testScene.addRandomObjects(10);

// // Simulate the scene for 100 steps with a deltaTime of 0.1
// testScene.simulate(100, 0.1);

// Create a test scene
// const testScene = new FBXViewerScene();
const testScene = new GameScene();

// Add random objects to the scene

// setInterval(() => {
//   // Simulate the scene for 100 steps with a deltaTime of 0.1
//   testScene.simulate(100, 0.1);
// }, 30);
