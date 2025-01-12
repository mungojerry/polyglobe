import * as THREE from "three";
import { BounceBehavior, DragBehavior, GravityBehavior, OscillationBehavior, VortexBehavior } from "./Behaviours";
import { BoxEmitter, ConeEmitter, CylinderEmitter, PointEmitter, RingEmitter, SphereEmitter } from "./Emitters";
import { AttractorModifier, TurbulenceModifier } from "./Modifiers";
import { ParticleSystem } from "./ParticleSystem";

export class ParticlePresets {
  static createThrustEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create emitter at position and point downward
    const emitterPos = position.clone();
    const emitter = new ConeEmitter(emitterPos, 0.5, 15);
    const direction = new THREE.Vector3(0, -1, 0);
    emitter.setDirection(direction);
    return new ParticleSystem({
      count: 1000,
      emitter,
      behaviors: [
        new GravityBehavior(-2), // Strong upward force
        new DragBehavior(0.1), // Air resistance
        new TurbulenceModifier(0.2, 0.5), // Slight turbulence
      ],
      appearance: {
        startColor: new THREE.Color(1, 0.8, 0.3),
        endColor: new THREE.Color(1, 0.2, 0),
        startSize: 2.5,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });
  }

  static createFireEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create emitter at position and point upward
    const emitterPos = position.clone();
    const emitter = new ConeEmitter(emitterPos, 0.3, 30);
    const direction = new THREE.Vector3(0, 1, 0);
    emitter.setDirection(direction);
    const system = new ParticleSystem({
      count: 800,
      emitter,
      behaviors: [new GravityBehavior(-1.5), new VortexBehavior(0.4), new DragBehavior(0.05)],
      appearance: {
        startColor: new THREE.Color(1, 0.7, 0.2),
        endColor: new THREE.Color(0.7, 0.1, 0),
        startSize: 2.5,
        endSize: 0.8,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add ember effect
    const emberSystem = new ParticleSystem({
      count: 200,
      emitter: new SphereEmitter(position, 0.2),
      behaviors: [new GravityBehavior(-0.5), new VortexBehavior(0.2), new OscillationBehavior(0.2, 2)],
      appearance: {
        startColor: new THREE.Color(1, 1, 0.3),
        endColor: new THREE.Color(1, 0.3, 0),
        startSize: 0.5,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(emberSystem);
    return system;
  }

  static createSmokeEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create emitter at position and point upward with wide angle
    const emitterPos = position.clone();
    const emitter = new ConeEmitter(emitterPos, 0.5, 20);
    const direction = new THREE.Vector3(0, 1, 0);
    emitter.setDirection(direction);
    return new ParticleSystem({
      count: 300,
      emitter,
      behaviors: [new GravityBehavior(-0.15), new DragBehavior(0.02), new TurbulenceModifier(0.1, 0.3)],
      appearance: {
        startColor: new THREE.Color(0.8, 0.8, 0.8),
        endColor: new THREE.Color(0.2, 0.2, 0.2),
        startSize: 1.5,
        endSize: 5,
        startOpacity: 0.7,
        endOpacity: 0,
        blending: THREE.NormalBlending,
      },
    });
  }

  static createSparkleEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 150,
      emitter: new SphereEmitter(position, 1),
      behaviors: [new GravityBehavior(0.3), new OscillationBehavior(0.2, 4), new DragBehavior(0.01)],
      appearance: {
        startColor: new THREE.Color(1, 1, 0.9),
        endColor: new THREE.Color(1, 0.8, 0.4),
        startSize: 0.4,
        endSize: 0,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });
  }

  static createRainEffect(position: THREE.Vector3 = new THREE.Vector3(0, 10, 0)): ParticleSystem {
    const system = new ParticleSystem({
      count: 2000,
      emitter: new BoxEmitter(position, 20, 0.1, 20), // Wide area rain
      behaviors: [
        new GravityBehavior(9.81),
        new DragBehavior(0.1), // Air resistance
      ],
      appearance: {
        startColor: new THREE.Color(0.8, 0.8, 1),
        endColor: new THREE.Color(0.7, 0.7, 1),
        startSize: 0.15,
        endSize: 0.1,
        startOpacity: 0.6,
        endOpacity: 0.4,
        blending: THREE.NormalBlending,
      },
    });

    // Add splash effect
    const splashSystem = new ParticleSystem({
      count: 500,
      emitter: new RingEmitter(new THREE.Vector3(0, 0, 0), 0.1, 0.3),
      behaviors: [new GravityBehavior(3), new DragBehavior(0.2)],
      appearance: {
        startColor: new THREE.Color(0.8, 0.8, 1),
        endColor: new THREE.Color(0.7, 0.7, 1),
        startSize: 0.1,
        endSize: 0,
        startOpacity: 0.5,
        endOpacity: 0,
        blending: THREE.NormalBlending,
      },
    });

    system.add(splashSystem);
    return system;
  }

  static createSnowEffect(position: THREE.Vector3 = new THREE.Vector3(0, 10, 0)): ParticleSystem {
    return new ParticleSystem({
      count: 1000,
      emitter: new BoxEmitter(position, 20, 0.1, 20),
      behaviors: [new GravityBehavior(0.3), new VortexBehavior(0.15), new DragBehavior(0.1), new OscillationBehavior(0.3, 0.5)],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(0.95, 0.95, 1),
        startSize: 0.25,
        endSize: 0.15,
        startOpacity: 0.9,
        endOpacity: 0.7,
        blending: THREE.NormalBlending,
      },
    });
  }

  static createIonThrusterEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create emitter at position and point downward with narrow angle
    const emitterPos = position.clone();
    const emitter = new ConeEmitter(emitterPos, 0.3, 10);
    const direction = new THREE.Vector3(0, -1, 0);
    emitter.setDirection(direction);
    const system = new ParticleSystem({
      count: 1000,
      emitter,
      behaviors: [new GravityBehavior(-0.5), new DragBehavior(0.05), new OscillationBehavior(0.1, 3)],
      appearance: {
        startColor: new THREE.Color(0.4, 0.7, 1),
        endColor: new THREE.Color(0, 0.3, 0.8),
        startSize: 1.5,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add energy field effect
    const fieldSystem = new ParticleSystem({
      count: 200,
      emitter: new SphereEmitter(position, 0.5),
      behaviors: [new VortexBehavior(0.5)],
      appearance: {
        startColor: new THREE.Color(0.6, 0.8, 1),
        endColor: new THREE.Color(0.2, 0.5, 1),
        startSize: 0.5,
        endSize: 0.2,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(fieldSystem);
    return system;
  }

  static createPlasmaEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const system = new ParticleSystem({
      count: 600,
      emitter: new SphereEmitter(position, 0.5),
      behaviors: [new VortexBehavior(1.2), new OscillationBehavior(0.3, 2), new TurbulenceModifier(0.2, 0.8)],
      appearance: {
        startColor: new THREE.Color(0.6, 0.2, 1),
        endColor: new THREE.Color(0.3, 0, 0.8),
        startSize: 1.8,
        endSize: 0.4,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add energy arcs
    const arcSystem = new ParticleSystem({
      count: 200,
      emitter: new SphereEmitter(position, 0.6),
      behaviors: [new VortexBehavior(2), new OscillationBehavior(0.5, 4)],
      appearance: {
        startColor: new THREE.Color(0.8, 0.6, 1),
        endColor: new THREE.Color(0.4, 0.2, 1),
        startSize: 0.4,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(arcSystem);
    return system;
  }

  static createExplosionEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const system = new ParticleSystem({
      count: 1500,
      emitter: new SphereEmitter(position, 0.1),
      behaviors: [new GravityBehavior(1), new DragBehavior(0.05), new TurbulenceModifier(0.3, 1)],
      appearance: {
        startColor: new THREE.Color(1, 0.8, 0.2),
        endColor: new THREE.Color(1, 0.2, 0),
        startSize: 3,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add shockwave effect
    const shockwaveSystem = new ParticleSystem({
      count: 200,
      emitter: new RingEmitter(position, 0, 0.1),
      behaviors: [new GravityBehavior(0), new DragBehavior(0.01)],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(1, 0.5, 0),
        startSize: 0.5,
        endSize: 5,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add debris effect
    const debrisSystem = new ParticleSystem({
      count: 300,
      emitter: new SphereEmitter(position, 0.2),
      behaviors: [new GravityBehavior(9.81), new DragBehavior(0.1), new BounceBehavior(0, 0.6)],
      appearance: {
        startColor: new THREE.Color(0.6, 0.6, 0.6),
        endColor: new THREE.Color(0.3, 0.3, 0.3),
        startSize: 0.3,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.NormalBlending,
      },
    });

    system.add(shockwaveSystem);
    system.add(debrisSystem);
    return system;
  }

  static createMagicEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const system = new ParticleSystem({
      count: 300,
      emitter: new SphereEmitter(position, 1),
      behaviors: [new GravityBehavior(-0.3), new VortexBehavior(0.8), new OscillationBehavior(0.5, 2)],
      appearance: {
        startColor: new THREE.Color(0.8, 0.2, 1),
        endColor: new THREE.Color(0.2, 0.8, 1),
        startSize: 1.2,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add sparkle effect
    const sparkleSystem = new ParticleSystem({
      count: 100,
      emitter: new SphereEmitter(position, 1.2),
      behaviors: [new OscillationBehavior(0.3, 4)],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(0.8, 0.8, 1),
        startSize: 0.3,
        endSize: 0,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(sparkleSystem);
    return system;
  }

  static createPoisonCloudEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 300,
      emitter: new SphereEmitter(position, 1),
      behaviors: [new GravityBehavior(-0.1), new VortexBehavior(0.2)],
      appearance: {
        startColor: new THREE.Color(0.3, 1, 0),
        endColor: new THREE.Color(0.1, 0.3, 0),
        startSize: 3,
        endSize: 5,
        startOpacity: 0.7,
        endOpacity: 0,
        blending: THREE.NormalBlending,
      },
    });
  }

  static createWaterfallEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const system = new ParticleSystem({
      count: 2000,
      emitter: new BoxEmitter(position, 2, 0.1, 0.5),
      behaviors: [new GravityBehavior(9.81), new DragBehavior(0.1), new TurbulenceModifier(0.05, 0.5)],
      appearance: {
        startColor: new THREE.Color(0.6, 0.8, 1),
        endColor: new THREE.Color(0.4, 0.6, 1),
        startSize: 0.8,
        endSize: 0.4,
        startOpacity: 0.9,
        endOpacity: 0.4,
        blending: THREE.NormalBlending,
      },
    });

    // Add mist effect
    const mistSystem = new ParticleSystem({
      count: 500,
      emitter: new BoxEmitter(new THREE.Vector3(position.x, position.y - 2, position.z), 3, 1, 1),
      behaviors: [new GravityBehavior(-0.1), new VortexBehavior(0.2), new TurbulenceModifier(0.1, 0.3)],
      appearance: {
        startColor: new THREE.Color(0.8, 0.9, 1),
        endColor: new THREE.Color(0.7, 0.8, 1),
        startSize: 2,
        endSize: 4,
        startOpacity: 0.3,
        endOpacity: 0,
        blending: THREE.NormalBlending,
      },
    });

    // Add splash effect
    const splashSystem = new ParticleSystem({
      count: 300,
      emitter: new RingEmitter(new THREE.Vector3(position.x, position.y - 2, position.z), 0.2, 1),
      behaviors: [new GravityBehavior(4), new DragBehavior(0.2)],
      appearance: {
        startColor: new THREE.Color(0.7, 0.8, 1),
        endColor: new THREE.Color(0.6, 0.7, 1),
        startSize: 0.3,
        endSize: 0.1,
        startOpacity: 0.7,
        endOpacity: 0,
        blending: THREE.NormalBlending,
      },
    });

    system.add(mistSystem);
    system.add(splashSystem);
    return system;
  }

  static createPortalEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const system = new ParticleSystem({
      count: 800,
      emitter: new RingEmitter(position, 1.8, 2),
      behaviors: [new VortexBehavior(3), new OscillationBehavior(0.4, 2), new TurbulenceModifier(0.2, 1)],
      appearance: {
        startColor: new THREE.Color(0.6, 0.2, 1),
        endColor: new THREE.Color(0.2, 0.4, 1),
        startSize: 1.2,
        endSize: 0.2,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add energy tendrils
    const tendrilSystem = new ParticleSystem({
      count: 400,
      emitter: new RingEmitter(position, 0, 2.2),
      behaviors: [new VortexBehavior(1.5), new OscillationBehavior(0.6, 3)],
      appearance: {
        startColor: new THREE.Color(1, 0.6, 1),
        endColor: new THREE.Color(0.4, 0.2, 1),
        startSize: 0.4,
        endSize: 0.1,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(tendrilSystem);
    return system;
  }

  static createSwarmEffect(position = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 1000,
      emitter: new SphereEmitter(position, 5),
      modifiers: [
        new AttractorModifier(
          new THREE.Vector3(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5),
          0.5, // strength
          3 // radius
        ),
        new TurbulenceModifier(0.1, 1),
      ],
      appearance: {
        startColor: new THREE.Color(0xffff00), // Yellow
        endColor: new THREE.Color(0xff6600), // Orange
        startSize: 0.2,
        endSize: 0.1,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });
  }

  static createLanternGlowEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 150,
      emitter: new SphereEmitter(position, 0.2),
      behaviors: [],
      appearance: {
        startColor: new THREE.Color(1, 0.8, 0.4),
        endColor: new THREE.Color(1, 0.5, 0.1),
        startSize: 2,
        endSize: 1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });
  }

  static createCometTrailEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 500,
      emitter: new PointEmitter(position),
      behaviors: [new GravityBehavior(1)],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(0.7, 0.7, 0.7),
        startSize: 3,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });
  }

  static createElectricArcEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 300,
      emitter: new SphereEmitter(position, 0.5),
      behaviors: [new VortexBehavior(3)],
      appearance: {
        startColor: new THREE.Color(0, 0.8, 1),
        endColor: new THREE.Color(0, 0.3, 0.6),
        startSize: 2,
        endSize: 0.5,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });
  }

  static createBoxEmitterEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 500,
      emitter: new BoxEmitter(position, 2, 2, 2),
      behaviors: [new GravityBehavior(-0.2)],
      appearance: {
        startColor: new THREE.Color(0.2, 0.7, 1),
        endColor: new THREE.Color(0, 0, 0.8),
        startSize: 1,
        endSize: 0.2,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });
  }

  static createCylinderEmitterEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 600,
      emitter: new CylinderEmitter(position, 1, 3),
      behaviors: [new GravityBehavior(0.3)],
      appearance: {
        startColor: new THREE.Color(1, 0.3, 0.3),
        endColor: new THREE.Color(1, 0, 0),
        startSize: 1,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });
  }

  static createRingEmitterEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 400,
      emitter: new RingEmitter(position, 1, 2),
      behaviors: [new VortexBehavior(0.5)],
      appearance: {
        startColor: new THREE.Color(1, 1, 0),
        endColor: new THREE.Color(1, 0.2, 0),
        startSize: 1.5,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });
  }
  static createSphereEmitterEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 400,
      emitter: new SphereEmitter(position, 1),
      behaviors: [new OscillationBehavior(0.5)],
      appearance: {
        startColor: new THREE.Color(1, 1, 0),
        endColor: new THREE.Color(1, 0.2, 0),
        startSize: 1.5,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });
  }
}
