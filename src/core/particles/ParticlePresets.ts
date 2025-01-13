import * as THREE from "three";
import { BounceBehavior, DragBehavior, GravityBehavior, OscillationBehavior, PlanetaryGravityBehavior, TrailBehavior, VortexBehavior } from "./Behaviours";
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
      behaviors: [
        new VortexBehavior(0.2), // Reduced strength for more stable swirling
        new GravityBehavior(-1.5),
        new DragBehavior(0.15), // Increased drag to stabilize motion
      ],
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
      behaviors: [
        new GravityBehavior(0.3),
        new VortexBehavior(0.08), // Reduced for gentler swirling
        new DragBehavior(0.15), // Increased for more floating effect
        new OscillationBehavior(0.2, 0.3), // Gentler oscillation
      ],
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
      behaviors: [
        new VortexBehavior(0.6), // Halved for more controlled rotation
        new OscillationBehavior(0.2, 1.5), // Reduced frequency
        new TurbulenceModifier(0.15, 0.6), // Reduced for less chaos
      ],
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
      behaviors: [
        new VortexBehavior(1.2), // Reduced significantly for more controlled rotation
        new OscillationBehavior(0.3, 1.5), // Gentler oscillation
        new TurbulenceModifier(0.1, 0.5), // Reduced turbulence
      ],
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
      behaviors: [
        new VortexBehavior(0.8), // Reduced for smoother motion
        new OscillationBehavior(0.4, 2), // Reduced frequency
      ],
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
    const system = new ParticleSystem({
      count: 300, // Reduced for better performance
      emitter: new PointEmitter(position),
      behaviors: [new GravityBehavior(1), new DragBehavior(0.02)], // Added slight drag
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(0.7, 0.7, 1), // Added blue tint
        startSize: 2,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add trail behavior for comet effect
    system.addBehavior(
      new TrailBehavior({
        length: 25,
        fade: 0.98,
        speedInfluence: true,
        minLength: 20,
        maxLength: 30,
      })
    );

    // Configure initial velocities
    const particles = system.particlePool["objects"];
    particles.forEach((particle) => {
      if (particle) {
        particle.velocity.set(5, 0, 0); // Initial velocity for immediate trail effect
      }
    });

    return system;
  }

  static createElectricArcEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const system = new ParticleSystem({
      count: 200, // Reduced count for better performance
      emitter: new SphereEmitter(position, 0.5),
      behaviors: [
        new VortexBehavior(2), // Reduced for more controlled arcs
        new TurbulenceModifier(0.3, 0.5), // Added for arc-like movement
      ],
      appearance: {
        startColor: new THREE.Color(0.3, 0.8, 1), // Brighter blue
        endColor: new THREE.Color(0, 0.4, 1),
        startSize: 1.5,
        endSize: 0.3,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add trail behavior for electric arcs
    system.addBehavior(
      new TrailBehavior({
        length: 15,
        fade: 0.96,
        speedInfluence: true,
        minLength: 10,
        maxLength: 20,
      })
    );

    // Configure initial velocities
    const particles = system.particlePool["objects"];
    particles.forEach((particle) => {
      if (particle) {
        // Random initial velocity for varied arcs
        particle.velocity.set(Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random() * 4 - 2);
      }
    });

    return system;
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

  static createNebulaEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const system = new ParticleSystem({
      count: 1000,
      emitter: new SphereEmitter(position, 3),
      behaviors: [
        new VortexBehavior(0.1), // Very gentle swirl
        new OscillationBehavior(0.05, 0.5), // Slow, gentle oscillation
        new TurbulenceModifier(0.02, 2), // Subtle, large-scale turbulence
      ],
      appearance: {
        startColor: new THREE.Color(0.5, 0.2, 1), // Purple base
        endColor: new THREE.Color(0.1, 0.6, 0.8), // Cyan fade
        startSize: 4,
        endSize: 6,
        startOpacity: 0.4,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add star-like sparkles within the nebula
    const sparkleSystem = new ParticleSystem({
      count: 200,
      emitter: new SphereEmitter(position, 2.5),
      behaviors: [new OscillationBehavior(0.1, 1)],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(0.8, 0.8, 1),
        startSize: 0.2,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(sparkleSystem);
    return system;
  }

  static createVortexStormEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const system = new ParticleSystem({
      count: 2000,
      emitter: new CylinderEmitter(position, 2, 4),
      behaviors: [
        new VortexBehavior(2), // Strong vortex force
        new GravityBehavior(-0.5), // Slight upward pull
        new TurbulenceModifier(0.4, 1), // Chaotic movement
      ],
      appearance: {
        startColor: new THREE.Color(0.3, 0.3, 0.35), // Dark gray
        endColor: new THREE.Color(0.5, 0.5, 0.55), // Light gray
        startSize: 0.8,
        endSize: 0.2,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.NormalBlending,
      },
    });

    // Add debris particles
    const debrisSystem = new ParticleSystem({
      count: 300,
      emitter: new CylinderEmitter(position, 2.2, 4.2),
      behaviors: [new VortexBehavior(1.5), new GravityBehavior(0.2), new BounceBehavior(0, 0.4)],
      appearance: {
        startColor: new THREE.Color(0.4, 0.3, 0.2), // Brown
        endColor: new THREE.Color(0.2, 0.15, 0.1),
        startSize: 0.4,
        endSize: 0.2,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.NormalBlending,
      },
    });

    system.add(debrisSystem);
    return system;
  }

  static createCrystalShatterEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const system = new ParticleSystem({
      count: 500,
      emitter: new SphereEmitter(position, 0.1),
      behaviors: [
        new GravityBehavior(5),
        new BounceBehavior(0, 0.8), // High bounce factor
        new DragBehavior(0.05),
      ],
      appearance: {
        startColor: new THREE.Color(0.6, 0.8, 1), // Light blue
        endColor: new THREE.Color(0.3, 0.5, 1), // Darker blue
        startSize: 0.6,
        endSize: 0.3,
        startOpacity: 0.9,
        endOpacity: 0.2,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add sparkle effect for the shards
    const sparkleSystem = new ParticleSystem({
      count: 200,
      emitter: new SphereEmitter(position, 0.2),
      behaviors: [new GravityBehavior(4), new OscillationBehavior(0.8, 4)],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(0.7, 0.9, 1),
        startSize: 0.2,
        endSize: 0,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(sparkleSystem);
    return system;
  }

  static createHealingAuraEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const system = new ParticleSystem({
      count: 600,
      emitter: new SphereEmitter(position, 1),
      behaviors: [
        new GravityBehavior(-0.1), // Gentle upward drift
        new OscillationBehavior(0.2, 1), // Gentle wave motion
        new VortexBehavior(0.15), // Very slight spin
      ],
      appearance: {
        startColor: new THREE.Color(0.2, 1, 0.5), // Bright green
        endColor: new THREE.Color(0.4, 1, 0.7), // Lighter green
        startSize: 0.8,
        endSize: 0.2,
        startOpacity: 0.7,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add floating symbols effect
    const symbolSystem = new ParticleSystem({
      count: 100,
      emitter: new SphereEmitter(position, 1.2),
      behaviors: [new GravityBehavior(-0.2), new OscillationBehavior(0.3, 2)],
      appearance: {
        startColor: new THREE.Color(1, 1, 0.8), // Warm white
        endColor: new THREE.Color(0.7, 1, 0.8), // Pale green
        startSize: 0.4,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(symbolSystem);
    return system;
  }

  static createDarkMatterEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const system = new ParticleSystem({
      count: 800,
      emitter: new SphereEmitter(position, 2),
      behaviors: [new VortexBehavior(0.3), new OscillationBehavior(0.1, 0.8), new TurbulenceModifier(0.15, 1.5)],
      appearance: {
        startColor: new THREE.Color(0.1, 0, 0.2), // Deep purple
        endColor: new THREE.Color(0, 0, 0.1), // Almost black
        startSize: 3,
        endSize: 1,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add energy distortion effect
    const distortionSystem = new ParticleSystem({
      count: 200,
      emitter: new SphereEmitter(position, 1.8),
      behaviors: [new VortexBehavior(0.5), new OscillationBehavior(0.2, 2)],
      appearance: {
        startColor: new THREE.Color(0.2, 0, 0.3),
        endColor: new THREE.Color(0.1, 0, 0.2),
        startSize: 0.5,
        endSize: 2,
        startOpacity: 0.6,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(distortionSystem);
    return system;
  }

  static createFairyDustEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const system = new ParticleSystem({
      count: 400,
      emitter: new SphereEmitter(position, 1),
      behaviors: [new VortexBehavior(0.4), new GravityBehavior(-0.1), new OscillationBehavior(0.3, 3)],
      appearance: {
        startColor: new THREE.Color(1, 0.9, 0.6), // Warm gold
        endColor: new THREE.Color(1, 0.7, 0.9), // Pink tint
        startSize: 0.3,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add twinkling effect
    const twinkleSystem = new ParticleSystem({
      count: 100,
      emitter: new SphereEmitter(position, 1.2),
      behaviors: [new OscillationBehavior(0.8, 5)],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(1, 0.9, 0.8),
        startSize: 0.2,
        endSize: 0,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(twinkleSystem);
    return system;
  }

  static createLaserBeamEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create intense core beam
    const emitterPos = position.clone();
    const coreEmitter = new CylinderEmitter(emitterPos, 0.02, 8); // Much narrower cylinder
    const system = new ParticleSystem({
      count: 2000, // More particles for density
      emitter: coreEmitter,
      behaviors: [
        new DragBehavior(0.001), // Much less drag for faster movement
      ],
      appearance: {
        startColor: new THREE.Color(1, 1, 1), // Pure white core
        endColor: new THREE.Color(1, 0.2, 0.2), // Fade to red
        startSize: 0.05, // Very small particles
        endSize: 0.02,
        startOpacity: 1,
        endOpacity: 0.8, // Higher end opacity for more solid beam
        blending: THREE.AdditiveBlending,
      },
    });

    // Enhanced inner glow with trails
    const innerGlowSystem = new ParticleSystem({
      count: 800,
      emitter: new CylinderEmitter(emitterPos, 0.05, 8),
      behaviors: [new DragBehavior(0.001)],
      appearance: {
        startColor: new THREE.Color(1, 0.3, 0.3),
        endColor: new THREE.Color(1, 0, 0),
        startSize: 0.1,
        endSize: 0.05,
        startOpacity: 0.8,
        endOpacity: 0.4,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add subtle energy discharge
    const dischargeSystem = new ParticleSystem({
      count: 100,
      emitter: new CylinderEmitter(emitterPos, 0.08, 8),
      behaviors: [
        new TurbulenceModifier(0.05, 0.2), // Subtle turbulence
        new DragBehavior(0.05),
      ],
      appearance: {
        startColor: new THREE.Color(1, 0.4, 0.4),
        endColor: new THREE.Color(1, 0.1, 0.1),
        startSize: 0.15,
        endSize: 0,
        startOpacity: 0.4,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add impact point glow
    const impactSystem = new ParticleSystem({
      count: 50,
      emitter: new SphereEmitter(new THREE.Vector3(position.x, position.y, position.z + 8), 0.1),
      behaviors: [new OscillationBehavior(0.2, 2)],
      appearance: {
        startColor: new THREE.Color(1, 0.8, 0.8),
        endColor: new THREE.Color(1, 0.2, 0.2),
        startSize: 0.3,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(innerGlowSystem);
    system.add(dischargeSystem);
    system.add(impactSystem);
    return system;
  }

  static createTimeDistortionEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const system = new ParticleSystem({
      count: 1200,
      emitter: new SphereEmitter(position, 2),
      behaviors: [new VortexBehavior(1.5), new OscillationBehavior(0.4, 2), new TurbulenceModifier(0.3, 1)],
      appearance: {
        startColor: new THREE.Color(0.4, 0.8, 0.9), // Light blue
        endColor: new THREE.Color(0.2, 0.4, 0.8), // Darker blue
        startSize: 0.5,
        endSize: 2,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add time ripple effect
    const rippleSystem = new ParticleSystem({
      count: 400,
      emitter: new RingEmitter(position, 1.8, 2.2),
      behaviors: [new VortexBehavior(0.8), new OscillationBehavior(0.2, 3)],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(0.6, 0.8, 1),
        startSize: 0.2,
        endSize: 1,
        startOpacity: 0.5,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(rippleSystem);
    return system;
  }

  static createBlackHoleEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create the main singularity
    const system = new ParticleSystem({
      count: 2000,
      emitter: new SphereEmitter(position, 3),
      behaviors: [
        new VortexBehavior(4), // Strong inward spiral
        new GravityBehavior(2), // Pull towards center
        new TurbulenceModifier(0.8, 2), // Chaotic movement near event horizon
      ],
      appearance: {
        startColor: new THREE.Color(0.1, 0, 0.2), // Deep purple
        endColor: new THREE.Color(0, 0, 0), // Pure black
        startSize: 0.8,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add accretion disk
    const accretionSystem = new ParticleSystem({
      count: 1000,
      emitter: new RingEmitter(position, 1, 4),
      behaviors: [new VortexBehavior(2), new OscillationBehavior(0.5, 3)],
      appearance: {
        startColor: new THREE.Color(1, 0.4, 0), // Orange
        endColor: new THREE.Color(0.6, 0, 0.3), // Dark red-purple
        startSize: 1.2,
        endSize: 0.2,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(accretionSystem);
    return system;
  }

  static createDiscoInfernoEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create the main disco ball effect
    const system = new ParticleSystem({
      count: 1000,
      emitter: new SphereEmitter(position, 2),
      behaviors: [
        new OscillationBehavior(1, 4), // Funky oscillation
        new VortexBehavior(0.5), // Gentle spin
      ],
      appearance: {
        startColor: new THREE.Color(Math.random(), Math.random(), Math.random()), // Random colors
        endColor: new THREE.Color(Math.random(), Math.random(), Math.random()),
        startSize: 0.4,
        endSize: 0.2,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add rotating light beams
    const beamSystem = new ParticleSystem({
      count: 500,
      emitter: new CylinderEmitter(position, 0.1, 5),
      behaviors: [new VortexBehavior(2), new OscillationBehavior(0.8, 2)],
      appearance: {
        startColor: new THREE.Color(1, 0, 0), // Start red
        endColor: new THREE.Color(0, 1, 1), // End cyan
        startSize: 0.6,
        endSize: 0.3,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(beamSystem);
    return system;
  }

  static createQuantumTangleEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create quantum particle system A
    const system = new ParticleSystem({
      count: 800,
      emitter: new SphereEmitter(position, 1),
      behaviors: [
        new OscillationBehavior(0.4, 6), // Rapid oscillation
        new TurbulenceModifier(0.5, 1), // Quantum uncertainty
      ],
      appearance: {
        startColor: new THREE.Color(0, 1, 0.8), // Cyan
        endColor: new THREE.Color(0.5, 0, 1), // Purple
        startSize: 0.3,
        endSize: 0.1,
        startOpacity: 0.9,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Create entangled particle system B
    const entangledSystem = new ParticleSystem({
      count: 800,
      emitter: new SphereEmitter(new THREE.Vector3(position.x + 2, position.y, position.z), 1),
      behaviors: [
        new OscillationBehavior(0.4, 6), // Matching oscillation
        new TurbulenceModifier(0.5, 1), // Matching uncertainty
      ],
      appearance: {
        startColor: new THREE.Color(0.5, 0, 1), // Opposite colors
        endColor: new THREE.Color(0, 1, 0.8),
        startSize: 0.3,
        endSize: 0.1,
        startOpacity: 0.9,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add quantum tunneling effect
    const tunnelSystem = new ParticleSystem({
      count: 200,
      emitter: new CylinderEmitter(new THREE.Vector3(position.x + 1, position.y, position.z), 0.2, 2),
      behaviors: [new OscillationBehavior(0.2, 8)],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(0.5, 0.5, 1),
        startSize: 0.1,
        endSize: 0.05,
        startOpacity: 0.5,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(entangledSystem);
    system.add(tunnelSystem);
    return system;
  }

  static createBubbleTeaEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create the tea swirl effect
    const system = new ParticleSystem({
      count: 1000,
      emitter: new CylinderEmitter(position, 1.5, 3),
      behaviors: [
        new VortexBehavior(0.8), // Gentle swirl
        new TurbulenceModifier(0.2, 1), // Liquid movement
      ],
      appearance: {
        startColor: new THREE.Color(0.6, 0.4, 0.2), // Brown tea color
        endColor: new THREE.Color(0.4, 0.2, 0.1),
        startSize: 0.2,
        endSize: 0.1,
        startOpacity: 0.6,
        endOpacity: 0,
        blending: THREE.NormalBlending,
      },
    });

    // Add bouncing boba pearls
    const bobaSystem = new ParticleSystem({
      count: 100,
      emitter: new CylinderEmitter(position, 1.2, 2.8),
      behaviors: [
        new GravityBehavior(4),
        new BounceBehavior(0, 0.8), // Bouncy pearls
        new DragBehavior(0.3), // Liquid resistance
      ],
      appearance: {
        startColor: new THREE.Color(0.2, 0.1, 0), // Dark brown pearls
        endColor: new THREE.Color(0.15, 0.05, 0),
        startSize: 0.4,
        endSize: 0.3,
        startOpacity: 1,
        endOpacity: 0.8,
        blending: THREE.NormalBlending,
      },
    });

    system.add(bobaSystem);
    return system;
  }

  static createGlitchEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create main glitch particles
    const system = new ParticleSystem({
      count: 1000,
      emitter: new BoxEmitter(position, 2, 2, 2),
      behaviors: [
        new OscillationBehavior(2, 10), // Rapid, erratic oscillation
        new TurbulenceModifier(1, 0.5), // Sharp, quick turbulence
      ],
      appearance: {
        startColor: new THREE.Color(0, 1, 1), // Cyan
        endColor: new THREE.Color(1, 0, 1), // Magenta
        startSize: 0.2,
        endSize: 0.1,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add digital artifacts
    const artifactSystem = new ParticleSystem({
      count: 200,
      emitter: new BoxEmitter(position, 2.2, 2.2, 2.2),
      behaviors: [new OscillationBehavior(4, 8), new TurbulenceModifier(2, 0.2)],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(0, 1, 0),
        startSize: 0.4,
        endSize: 0,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(artifactSystem);
    return system;
  }

  static createCandyTornadoEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create the tornado spiral
    const system = new ParticleSystem({
      count: 1500,
      emitter: new CylinderEmitter(position, 1, 5),
      behaviors: [
        new VortexBehavior(3), // Strong spiral
        new GravityBehavior(-1), // Upward lift
        new OscillationBehavior(0.5, 2), // Wobbly movement
      ],
      appearance: {
        startColor: new THREE.Color(1, 0.6, 0.8), // Pink
        endColor: new THREE.Color(0.8, 0.3, 0.5),
        startSize: 0.4,
        endSize: 0.2,
        startOpacity: 0.9,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add candy particles
    const candySystem = new ParticleSystem({
      count: 300,
      emitter: new CylinderEmitter(position, 1.2, 5),
      behaviors: [new VortexBehavior(2), new BounceBehavior(0, 0.6), new DragBehavior(0.1)],
      appearance: {
        startColor: new THREE.Color(Math.random(), Math.random(), Math.random()),
        endColor: new THREE.Color(Math.random(), Math.random(), Math.random()),
        startSize: 0.3,
        endSize: 0.15,
        startOpacity: 1,
        endOpacity: 0.2,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(candySystem);
    return system;
  }

  static createRainbowSerpentEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create the main serpent body
    const system = new ParticleSystem({
      count: 1000,
      emitter: new CylinderEmitter(position, 0.5, 8),
      behaviors: [
        new VortexBehavior(0.8, new THREE.Vector3(0, 1, 0)),
        new OscillationBehavior(0.3, 0.5, new THREE.Vector3(1, 0, 0)),
        new OscillationBehavior(0.3, 0.7, new THREE.Vector3(0, 0, 1)),
        new TurbulenceModifier(0.1, 1),
      ],
      appearance: {
        startColor: new THREE.Color(
          Math.sin(performance.now() * 0.001) * 0.5 + 0.5,
          Math.sin(performance.now() * 0.002 + 2) * 0.5 + 0.5,
          Math.sin(performance.now() * 0.003 + 4) * 0.5 + 0.5
        ),
        endColor: new THREE.Color(
          Math.cos(performance.now() * 0.002) * 0.5 + 0.5,
          Math.cos(performance.now() * 0.003 + 2) * 0.5 + 0.5,
          Math.cos(performance.now() * 0.001 + 4) * 0.5 + 0.5
        ),
        startSize: 0.6,
        endSize: 0.3,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add shimmering scales
    const scaleSystem = new ParticleSystem({
      count: 500,
      emitter: new CylinderEmitter(position, 0.6, 8),
      behaviors: [new OscillationBehavior(0.5, 3), new VortexBehavior(0.5), new TurbulenceModifier(0.1, 0.5)],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(0.8, 0.8, 1),
        startSize: 0.2,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(scaleSystem);
    return system;
  }

  static createOrbitalChaosEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create multiple orbital systems with different centers
    const system = new ParticleSystem({
      count: 800,
      emitter: new SphereEmitter(position, 2),
      behaviors: [
        new PlanetaryGravityBehavior(position, 5),
        new VortexBehavior(0.5, new THREE.Vector3(1, 0, 0)), // X-axis vortex
        new OscillationBehavior(0.3, 2, new THREE.Vector3(0, 1, 0)), // Y-axis oscillation
      ],
      appearance: {
        startColor: new THREE.Color(0.2, 0.5, 1),
        endColor: new THREE.Color(1, 0.2, 0.5),
        startSize: 0.3,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add secondary orbital system with different axis
    const secondarySystem = new ParticleSystem({
      count: 400,
      emitter: new SphereEmitter(position, 1.5),
      behaviors: [
        new PlanetaryGravityBehavior(position, 3),
        new VortexBehavior(0.8, new THREE.Vector3(0, 0, 1)), // Z-axis vortex
      ],
      appearance: {
        startColor: new THREE.Color(1, 0.5, 0.2),
        endColor: new THREE.Color(0.5, 0.2, 1),
        startSize: 0.2,
        endSize: 0.05,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(secondarySystem);
    return system;
  }

  static createBouncingGalaxyEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create main galaxy disc
    const system = new ParticleSystem({
      count: 1500,
      emitter: new CylinderEmitter(position, 3, 0.5),
      behaviors: [
        new VortexBehavior(2, new THREE.Vector3(0, 1, 0)),
        new GravityBehavior(0.5),
        new BounceBehavior(-2, 0.95), // High restitution for elastic bounces
      ],
      appearance: {
        startColor: new THREE.Color(0.8, 0.4, 1),
        endColor: new THREE.Color(0.4, 0.1, 0.8),
        startSize: 0.4,
        endSize: 0.2,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add bouncing star clusters
    const starSystem = new ParticleSystem({
      count: 300,
      emitter: new SphereEmitter(position, 2),
      behaviors: [new GravityBehavior(1), new BounceBehavior(-2, 0.9), new OscillationBehavior(0.2, 3)],
      appearance: {
        startColor: new THREE.Color(1, 1, 0.8),
        endColor: new THREE.Color(1, 0.8, 0.4),
        startSize: 0.2,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(starSystem);
    return system;
  }

  static createMultiAxisOscillatorEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create particles oscillating on multiple axes
    const system = new ParticleSystem({
      count: 1000,
      emitter: new BoxEmitter(position, 1, 1, 1),
      behaviors: [
        new OscillationBehavior(1, 2, new THREE.Vector3(1, 0, 0)), // X-axis
        new OscillationBehavior(1, 1.5, new THREE.Vector3(0, 1, 0)), // Y-axis
        new OscillationBehavior(1, 1, new THREE.Vector3(0, 0, 1)), // Z-axis
      ],
      appearance: {
        startColor: new THREE.Color(0.3, 1, 0.7),
        endColor: new THREE.Color(0.7, 0.3, 1),
        startSize: 0.3,
        endSize: 0.1,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add central core with different oscillation pattern
    const coreSystem = new ParticleSystem({
      count: 200,
      emitter: new SphereEmitter(position, 0.5),
      behaviors: [new OscillationBehavior(0.5, 4, new THREE.Vector3(1, 1, 1).normalize())],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(0.5, 1, 0.8),
        startSize: 0.2,
        endSize: 0.05,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(coreSystem);
    return system;
  }

  static createPlanetaryRingSystemEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create the central planet
    const system = new ParticleSystem({
      count: 200,
      emitter: new SphereEmitter(position, 1),
      behaviors: [new VortexBehavior(0.2), new OscillationBehavior(0.1, 0.5)],
      appearance: {
        startColor: new THREE.Color(0.8, 0.7, 0.6), // Warm planet color
        endColor: new THREE.Color(0.6, 0.5, 0.4),
        startSize: 1.5,
        endSize: 1.2,
        startOpacity: 1,
        endOpacity: 0.8,
        blending: THREE.NormalBlending,
      },
    });

    // Create multiple ring layers
    const createRingLayer = (radius: number, width: number, color: THREE.Color, particleCount: number) => {
      return new ParticleSystem({
        count: particleCount,
        emitter: new RingEmitter(position, radius - width / 2, radius + width / 2),
        behaviors: [
          new PlanetaryGravityBehavior(position, 8),
          new VortexBehavior(1, new THREE.Vector3(0, 1, 0)),
          new OscillationBehavior(0.1, 0.5, new THREE.Vector3(0, 0, 1)),
        ],
        appearance: {
          startColor: color,
          endColor: color.clone().multiplyScalar(0.7),
          startSize: 0.2,
          endSize: 0.1,
          startOpacity: 0.9,
          endOpacity: 0.1,
          blending: THREE.NormalBlending,
        },
      });
    };

    // Add multiple ring layers with different characteristics
    system.add(createRingLayer(3, 0.5, new THREE.Color(0.9, 0.8, 0.7), 1000)); // Inner ring
    system.add(createRingLayer(4, 0.8, new THREE.Color(0.8, 0.7, 0.6), 1500)); // Middle ring
    system.add(createRingLayer(5, 0.3, new THREE.Color(0.7, 0.6, 0.5), 800)); // Outer ring

    // Add some debris particles between rings
    const debrisSystem = new ParticleSystem({
      count: 500,
      emitter: new RingEmitter(position, 2.5, 5.5),
      behaviors: [new PlanetaryGravityBehavior(position, 6), new VortexBehavior(0.5, new THREE.Vector3(0, 1, 0)), new TurbulenceModifier(0.1, 1)],
      appearance: {
        startColor: new THREE.Color(0.6, 0.5, 0.4),
        endColor: new THREE.Color(0.4, 0.3, 0.2),
        startSize: 0.15,
        endSize: 0.05,
        startOpacity: 0.7,
        endOpacity: 0,
        blending: THREE.NormalBlending,
      },
    });

    system.add(debrisSystem);
    return system;
  }

  static createAtomicModelEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create nucleus
    const system = new ParticleSystem({
      count: 100,
      emitter: new SphereEmitter(position, 0.2),
      behaviors: [new OscillationBehavior(0.1, 1)],
      appearance: {
        startColor: new THREE.Color(1, 0.5, 0),
        endColor: new THREE.Color(1, 0.3, 0),
        startSize: 0.3,
        endSize: 0.2,
        startOpacity: 1,
        endOpacity: 0.8,
        blending: THREE.AdditiveBlending,
      },
    });

    // Create electron shells with different orbital planes
    const createShell = (radius: number, axis: THREE.Vector3, color: THREE.Color) => {
      return new ParticleSystem({
        count: 300,
        emitter: new RingEmitter(position, radius - 0.1, radius + 0.1),
        behaviors: [
          new PlanetaryGravityBehavior(position, 2),
          new VortexBehavior(2, axis),
          new OscillationBehavior(0.2, 3, axis.clone().cross(new THREE.Vector3(0, 1, 0))),
        ],
        appearance: {
          startColor: color,
          endColor: color.clone().multiplyScalar(0.5),
          startSize: 0.1,
          endSize: 0.05,
          startOpacity: 0.8,
          endOpacity: 0,
          blending: THREE.AdditiveBlending,
        },
      });
    };

    // Add three electron shells on different planes
    system.add(createShell(1, new THREE.Vector3(0, 1, 0), new THREE.Color(0, 1, 1)));
    system.add(createShell(1.5, new THREE.Vector3(1, 1, 0).normalize(), new THREE.Color(0, 0.5, 1)));
    system.add(createShell(2, new THREE.Vector3(1, 0, 1).normalize(), new THREE.Color(0.5, 0, 1)));

    return system;
  }

  static createSpringChainEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const system = new ParticleSystem({
      count: 1000,
      emitter: new BoxEmitter(position, 0.2, 4, 0.2),
      behaviors: [new OscillationBehavior(1, 2, new THREE.Vector3(1, 0, 0)), new GravityBehavior(0.5), new DragBehavior(0.1)],
      appearance: {
        startColor: new THREE.Color(1, 0.5, 0.2),
        endColor: new THREE.Color(1, 0.2, 0.5),
        startSize: 0.2,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add connected oscillating segments
    for (let i = 1; i <= 3; i++) {
      const segment = new ParticleSystem({
        count: 300,
        emitter: new BoxEmitter(new THREE.Vector3(position.x, position.y - i * 1.5, position.z), 0.2, 4, 0.2),
        behaviors: [new OscillationBehavior(1, 2 / (i + 1), new THREE.Vector3(1, 0, 0)), new GravityBehavior(0.5), new DragBehavior(0.1 * i)],
        appearance: {
          startColor: new THREE.Color(0.2 + i * 0.2, 0.5, 1 - i * 0.2),
          endColor: new THREE.Color(0.1 + i * 0.1, 0.2, 0.8 - i * 0.2),
          startSize: 0.2,
          endSize: 0.1,
          startOpacity: 1,
          endOpacity: 0,
          blending: THREE.AdditiveBlending,
        },
      });
      system.add(segment);
    }

    return system;
  }

  static createEmitterShowcaseEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create a system that demonstrates all emitter types
    const system = new ParticleSystem({
      count: 500,
      emitter: new ConeEmitter(position, 0.5, 30),
      behaviors: [new GravityBehavior(-0.5), new DragBehavior(0.1)],
      appearance: {
        startColor: new THREE.Color(1, 0.2, 0.5),
        endColor: new THREE.Color(0.5, 0.1, 0.2),
        startSize: 0.3,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add ring emitter system
    const ringSystem = new ParticleSystem({
      count: 300,
      emitter: new RingEmitter(new THREE.Vector3(position.x + 3, position.y, position.z), 1, 1.5),
      behaviors: [new VortexBehavior(1), new OscillationBehavior(0.3, 2)],
      appearance: {
        startColor: new THREE.Color(0.2, 1, 0.5),
        endColor: new THREE.Color(0.1, 0.5, 0.2),
        startSize: 0.2,
        endSize: 0.1,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add sphere emitter system
    const sphereSystem = new ParticleSystem({
      count: 400,
      emitter: new SphereEmitter(new THREE.Vector3(position.x - 3, position.y, position.z), 1),
      behaviors: [new VortexBehavior(0.5), new TurbulenceModifier(0.2, 1)],
      appearance: {
        startColor: new THREE.Color(0.5, 0.2, 1),
        endColor: new THREE.Color(0.2, 0.1, 0.5),
        startSize: 0.25,
        endSize: 0.1,
        startOpacity: 0.9,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add box emitter system
    const boxSystem = new ParticleSystem({
      count: 350,
      emitter: new BoxEmitter(new THREE.Vector3(position.x, position.y + 3, position.z), 1, 1, 1),
      behaviors: [new OscillationBehavior(0.5, 2), new DragBehavior(0.1)],
      appearance: {
        startColor: new THREE.Color(1, 0.8, 0.2),
        endColor: new THREE.Color(0.5, 0.4, 0.1),
        startSize: 0.2,
        endSize: 0.1,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add cylinder emitter system
    const cylinderSystem = new ParticleSystem({
      count: 400,
      emitter: new CylinderEmitter(new THREE.Vector3(position.x, position.y - 3, position.z), 0.5, 2),
      behaviors: [new VortexBehavior(0.8), new GravityBehavior(-0.2)],
      appearance: {
        startColor: new THREE.Color(0.2, 0.5, 1),
        endColor: new THREE.Color(0.1, 0.2, 0.5),
        startSize: 0.3,
        endSize: 0.1,
        startOpacity: 0.9,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add point emitter system with radial burst
    const pointSystem = new ParticleSystem({
      count: 200,
      emitter: new PointEmitter(new THREE.Vector3(position.x + 3, position.y + 3, position.z)),
      behaviors: [new VortexBehavior(0.3), new OscillationBehavior(0.4, 3)],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(0.8, 0.8, 0.8),
        startSize: 0.15,
        endSize: 0.05,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(ringSystem);
    system.add(sphereSystem);
    system.add(boxSystem);
    system.add(cylinderSystem);
    system.add(pointSystem);
    return system;
  }

  static createLavaLampEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create base cylinder for the lamp
    const system = new ParticleSystem({
      count: 800,
      emitter: new CylinderEmitter(position, 1, 4),
      behaviors: [new GravityBehavior(-0.2), new VortexBehavior(0.3), new OscillationBehavior(0.2, 1)],
      appearance: {
        startColor: new THREE.Color(1, 0.2, 0),
        endColor: new THREE.Color(0.8, 0.1, 0),
        startSize: 0.8,
        endSize: 0.6,
        startOpacity: 0.9,
        endOpacity: 0.1,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add floating blobs using sphere emitters
    for (let i = 0; i < 3; i++) {
      const blobSystem = new ParticleSystem({
        count: 200,
        emitter: new SphereEmitter(
          new THREE.Vector3(position.x + Math.sin((i * Math.PI * 2) / 3) * 0.3, position.y + i - 1, position.z + Math.cos((i * Math.PI * 2) / 3) * 0.3),
          0.4
        ),
        behaviors: [new GravityBehavior(-0.1 - Math.random() * 0.2), new OscillationBehavior(0.1, 0.5)],
        appearance: {
          startColor: new THREE.Color(1, 0.3, 0),
          endColor: new THREE.Color(0.9, 0.2, 0),
          startSize: 0.6,
          endSize: 0.4,
          startOpacity: 0.8,
          endOpacity: 0.2,
          blending: THREE.AdditiveBlending,
        },
      });
      system.add(blobSystem);
    }

    return system;
  }

  static createTidalWaveEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create main wave body
    const system = new ParticleSystem({
      count: 2000,
      emitter: new BoxEmitter(position, 8, 4, 2),
      behaviors: [new OscillationBehavior(1, 0.5, new THREE.Vector3(0, 1, 0)), new VortexBehavior(0.3, new THREE.Vector3(0, 0, 1)), new GravityBehavior(-0.2)],
      appearance: {
        startColor: new THREE.Color(0.2, 0.5, 1),
        endColor: new THREE.Color(0.1, 0.3, 0.8),
        startSize: 0.3,
        endSize: 0.1,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add foam particles
    const foamSystem = new ParticleSystem({
      count: 500,
      emitter: new BoxEmitter(position, 8.5, 4.2, 2.2),
      behaviors: [new OscillationBehavior(1, 0.5, new THREE.Vector3(0, 1, 0)), new BounceBehavior(-2, 0.8), new DragBehavior(0.2)],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(0.8, 0.9, 1),
        startSize: 0.2,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add spray particles
    const spraySystem = new ParticleSystem({
      count: 300,
      emitter: new BoxEmitter(position, 9, 4.5, 2.5),
      behaviors: [new GravityBehavior(1), new TurbulenceModifier(0.3, 1), new DragBehavior(0.1)],
      appearance: {
        startColor: new THREE.Color(0.8, 0.9, 1),
        endColor: new THREE.Color(0.6, 0.8, 1),
        startSize: 0.1,
        endSize: 0.05,
        startOpacity: 0.6,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(foamSystem);
    system.add(spraySystem);
    return system;
  }

  static createLightningStrikeEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const system = new ParticleSystem({
      count: 100,
      emitter: new PointEmitter(position),
      behaviors: [
        new GravityBehavior(0.1),
        new TurbulenceModifier(0.2, 1),
        new TrailBehavior({
          length: 30,
          fade: 0.98,
          speedInfluence: true,
          minLength: 20,
          maxLength: 40,
        }),
      ],
      appearance: {
        startColor: new THREE.Color(0.9, 0.9, 1),
        endColor: new THREE.Color(0.6, 0.8, 1),
        startSize: 0.4,
        endSize: 0.2,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Configure collision properties
    const particle = system.particlePool["objects"][0];
    if (particle) {
      particle.radius = 0.2;
      particle.elasticity = 0.8;
      particle.subEmitOnCollision = true;
      particle.subEmitCount = 5;
      // Initialize with high velocity for better trail effects
      particle.velocity.set(0, -10, 0);
    }

    // Add branching lightning
    const branchSystem = new ParticleSystem({
      count: 50,
      emitter: new PointEmitter(position),
      behaviors: [new GravityBehavior(0.05), new TurbulenceModifier(0.3, 0.5)],
      appearance: {
        startColor: new THREE.Color(0.8, 0.9, 1),
        endColor: new THREE.Color(0.5, 0.7, 1),
        startSize: 0.2,
        endSize: 0.1,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(branchSystem);
    return system;
  }

  static createBilliardBallsEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const system = new ParticleSystem({
      count: 8, // Reduced count for better performance
      emitter: new BoxEmitter(position, 3, 0.1, 3),
      behaviors: [
        new GravityBehavior(0),
        new DragBehavior(0.05), // Increased drag for more realistic table friction
        new BounceBehavior(0, 0.85), // Reduced bounce for more realistic behavior
      ],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(1, 1, 1),
        startSize: 0.3, // Smaller size for better scale
        endSize: 0.3,
        startOpacity: 1,
        endOpacity: 1,
        blending: THREE.NormalBlending,
      },
    });

    // Add trail behavior for billiard balls
    system.addBehavior(
      new TrailBehavior({
        length: 15,
        fade: 0.97,
        speedInfluence: true,
        minLength: 10,
        maxLength: 20,
      })
    );

    // Configure collision properties
    const particles = system.particlePool["objects"];
    particles.forEach((particle, i) => {
      if (particle) {
        particle.radius = 0.15;
        particle.elasticity = 0.8;
        particle.friction = 0.4;
        particle.subEmitOnCollision = true;
        particle.subEmitCount = 2;
        particle.color.setHSL(i / particles.length, 0.8, 0.5);
      }
    });

    // Minimal collision effect system
    const collisionSystem = new ParticleSystem({
      count: 50, // Reduced count
      emitter: new SphereEmitter(position, 0.1),
      behaviors: [new GravityBehavior(0.2), new DragBehavior(0.2)],
      appearance: {
        startColor: new THREE.Color(1, 1, 0.8),
        endColor: new THREE.Color(1, 0.8, 0.4),
        startSize: 0.05,
        endSize: 0,
        startOpacity: 0.6,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    system.add(collisionSystem);
    return system;
  }

  static createFireworksEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Launch system with fewer particles
    const system = new ParticleSystem({
      count: 10, // Reduced count
      emitter: new ConeEmitter(position, 0.1, 15), // Narrower cone for more directed launches
      behaviors: [
        new GravityBehavior(-4), // Stronger upward force
        new DragBehavior(0.02), // Less drag for faster movement
      ],
      appearance: {
        startColor: new THREE.Color(1, 0.6, 0.2),
        endColor: new THREE.Color(1, 0.4, 0.1),
        startSize: 0.2,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0.8,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add trail behavior for firework launches
    system.addBehavior(
      new TrailBehavior({
        length: 20,
        fade: 0.98,
        speedInfluence: true,
        minLength: 15,
        maxLength: 25,
      })
    );

    // Configure launch particles
    const particles = system.particlePool["objects"];
    particles.forEach((particle, i) => {
      if (particle) {
        particle.subEmitOnDeath = true;
        particle.subEmitCount = 20;
        particle.subEmitVelocityFactor = 1.2;
        particle.subEmitInheritColor = true;
        particle.lifetime = 1.5 + Math.random() * 0.5;
        particle.color.setHSL(i / particles.length, 1, 0.5);
      }
    });

    // More efficient explosion system
    const explosionSystem = new ParticleSystem({
      count: 400, // Reduced count
      emitter: new SphereEmitter(position, 0.1),
      behaviors: [
        new GravityBehavior(1),
        new DragBehavior(0.1),
        new OscillationBehavior(0.5, 2), // Add sparkle effect
      ],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(1, 0.8, 0.4),
        startSize: 0.15,
        endSize: 0,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });

    // Add trail behavior for explosion particles
    explosionSystem.addBehavior(
      new TrailBehavior({
        length: 8,
        fade: 0.95,
        speedInfluence: true,
        minLength: 5,
        maxLength: 10,
      })
    );

    // Configure explosion particles
    const sparkles = explosionSystem.particlePool["objects"];
    sparkles.forEach((particle) => {
      if (particle) {
        particle.lifetime = 0.8 + Math.random() * 0.4; // Shorter, varied lifetimes
      }
    });

    system.add(explosionSystem);
    return system;
  }
}
