import RAPIER from "@dimforge/rapier3d";
import { IGameObject } from "../entities/BaseGameObject";

export const colliderToGameObjectMap: WeakMap<RAPIER.Collider, IGameObject> = new WeakMap();
