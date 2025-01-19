import RAPIER from "@dimforge/rapier3d";
import { IEntity } from "../entities/Entity";

export const colliderToGameObjectMap: WeakMap<RAPIER.Collider, IEntity> = new WeakMap();
