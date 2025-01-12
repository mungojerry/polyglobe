import * as THREE from "three";
import { GravityBehavior, ParticleSystem, PointEmitter, SphereEmitter, VortexBehavior } from "./ParticleSystem";

export class ParticlePresets {
  static createThrustEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 1000,
      emitter: new PointEmitter(position),
      behaviors: [
        new GravityBehavior(-0.5), // Slight upward force
      ],
      appearance: {
        startColor: new THREE.Color(1, 0.7, 0.3),
        endColor: new THREE.Color(1, 0.1, 0),
        startSize: 2,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });
  }

  static createFireEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 500,
      emitter: new SphereEmitter(position, 0.5),
      behaviors: [new GravityBehavior(-1), new VortexBehavior(0.2)],
      appearance: {
        startColor: new THREE.Color(1, 0.5, 0.1),
        endColor: new THREE.Color(0.5, 0, 0),
        startSize: 3,
        endSize: 0.5,
        startOpacity: 1,
        endOpacity: 0,
      },
    });
  }

  static createSmokeEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 200,
      emitter: new SphereEmitter(position, 0.3),
      behaviors: [new GravityBehavior(-0.1), new VortexBehavior(0.1)],
      appearance: {
        startColor: new THREE.Color(0.7, 0.7, 0.7),
        endColor: new THREE.Color(0.3, 0.3, 0.3),
        startSize: 2,
        endSize: 4,
        startOpacity: 0.6,
        endOpacity: 0,
        blending: THREE.NormalBlending,
      },
    });
  }

  static createSparkleEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 100,
      emitter: new SphereEmitter(position, 1),
      behaviors: [new GravityBehavior(0.5)],
      appearance: {
        startColor: new THREE.Color(1, 1, 0.8),
        endColor: new THREE.Color(1, 0.6, 0.3),
        startSize: 0.5,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
      },
    });
  }

  static createRainEffect(position: THREE.Vector3 = new THREE.Vector3(0, 10, 0)): ParticleSystem {
    return new ParticleSystem({
      count: 1000,
      emitter: new SphereEmitter(position, 5),
      behaviors: [new GravityBehavior(9.81)],
      appearance: {
        startColor: new THREE.Color(0.7, 0.7, 1),
        endColor: new THREE.Color(0.7, 0.7, 1),
        startSize: 0.1,
        endSize: 0.1,
        startOpacity: 0.6,
        endOpacity: 0.6,
        blending: THREE.NormalBlending,
      },
    });
  }

  static createSnowEffect(position: THREE.Vector3 = new THREE.Vector3(0, 10, 0)): ParticleSystem {
    return new ParticleSystem({
      count: 500,
      emitter: new SphereEmitter(position, 5),
      behaviors: [new GravityBehavior(0.5), new VortexBehavior(0.1)],
      appearance: {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(0.9, 0.9, 0.9),
        startSize: 0.2,
        endSize: 0.2,
        startOpacity: 0.8,
        endOpacity: 0.8,
        blending: THREE.NormalBlending,
      },
    });
  }

  static createIonThrusterEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 1000,
      emitter: new PointEmitter(position),
      behaviors: [new GravityBehavior(-0.3)],
      appearance: {
        startColor: new THREE.Color(0, 0.5, 1),
        endColor: new THREE.Color(0, 0.2, 0.5),
        startSize: 2,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
      },
    });
  }

  static createPlasmaEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 500,
      emitter: new SphereEmitter(position, 0.5),
      behaviors: [new VortexBehavior(1)],
      appearance: {
        startColor: new THREE.Color(0.5, 0, 1),
        endColor: new THREE.Color(0.2, 0, 0.5),
        startSize: 2,
        endSize: 0.5,
        startOpacity: 1,
        endOpacity: 0,
      },
    });
  }

  static createExplosionEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 1000,
      emitter: new SphereEmitter(position, 0.1),
      behaviors: [new GravityBehavior(2)],
      appearance: {
        startColor: new THREE.Color(1, 0.7, 0),
        endColor: new THREE.Color(1, 0, 0),
        startSize: 3,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
      },
    });
  }

  static createMagicEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 200,
      emitter: new SphereEmitter(position, 1),
      behaviors: [new GravityBehavior(-0.5), new VortexBehavior(0.5)],
      appearance: {
        startColor: new THREE.Color(1, 0, 1),
        endColor: new THREE.Color(0, 1, 1),
        startSize: 1,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
      },
    });
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
    return new ParticleSystem({
      count: 1000,
      emitter: new PointEmitter(position),
      behaviors: [new GravityBehavior(9.81)],
      appearance: {
        startColor: new THREE.Color(0.4, 0.6, 1),
        endColor: new THREE.Color(0.2, 0.3, 1),
        startSize: 1,
        endSize: 0.5,
        startOpacity: 0.8,
        endOpacity: 0.2,
        blending: THREE.NormalBlending,
      },
    });
  }

  static createPortalEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    return new ParticleSystem({
      count: 500,
      emitter: new SphereEmitter(position, 2),
      behaviors: [new GravityBehavior(-0.1), new VortexBehavior(2)],
      appearance: {
        startColor: new THREE.Color(0.5, 0, 1),
        endColor: new THREE.Color(0, 0.5, 1),
        startSize: 1,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
      },
    });
  }
}
