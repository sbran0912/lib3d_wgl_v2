/**
 * lib-body.ts  –  Physik-fähiger 3D-Körper
 *
 * Kapselt ein Solid mit Position, Rotation, Geschwindigkeit
 * und optionaler Hitbox für Kollisionserkennung.
 */

import * as l3d from "./lib-3d.ts";
import * as wgl from "./lib-wgl.ts";
import { Solid } from "./lib-solids.ts";

// ====================================================================
// BODY
// ====================================================================

export class Body {
  /** Geometrie (shared – kann zwischen Bodies geteilt werden) */
  solid: Solid;

  /** Position im Weltraum */
  pos: l3d.Vec3;

  /** Geschwindigkeit (für Physik) */
  vel: l3d.Vec3;

  /** Rotation um X-, Y- und Z-Achse (in Radian) */
  rotX = 0;
  rotY = 0;
  rotZ = 0;

  /** Darstellung */
  color = "#ffffff";
  lineWidth = 1;

  constructor(solid: Solid, x: number, y: number, z: number) {
    this.solid = solid;
    this.pos = new l3d.Vec3(x, y, z);
    this.vel = new l3d.Vec3(0, 0, 0);
  }

  /** Zeichnet den Body mit seiner World-Matrix. */
  draw(fov: number, view: l3d.Matrix4x4): void {
    const world = l3d.multMatrix(
      l3d.translateMatrix(this.pos.x, this.pos.y, this.pos.z),
      l3d.rotateMatrix(this.rotX, this.rotY, this.rotZ),
    );
    wgl.strokeColor(this.color);
    wgl.strokeWidth(this.lineWidth);
    this.solid.draw(fov, view, world);
  }

  /** Distanz zu einem anderen Body (Mittelpunkt zu Mittelpunkt). */
  distanceTo(other: Body): number {
    return this.pos.distanceTo(other.pos);
  }
}
