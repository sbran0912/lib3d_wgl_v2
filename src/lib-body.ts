/**
 * lib-body.ts  –  Physik-fähiger 3D-Körper
 *
 * Kapselt ein Solid mit Position, Rotation, Geschwindigkeit
 * und optionaler Hitbox für Kollisionserkennung.
 */

import * as l3d from "./lib-3d.ts";
import * as wgl from "./lib-wgl.ts";
import { Solid, darkenHex } from "./lib-solids.ts";

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

  /**
   * Per-edge-Tiefennebel: hintere Kanten werden dunkler,
   * unabhängig von der Position des Körpers.
   *   near = Abstand hinter dem Mittelzentrum (beginnende Abdunklung)
   *   far  = Abstand hinter dem Mittelzentrum (max. Abdunklung)
   *   max  = max. Abdunklung (0 = kein Effekt, 1 = schwarz)
   */
  static fogNear = 0;
  static fogFar = 40;
  static fogMax = 0.6;

  /**
   * Körper-Nebel: ganzer Körper wird dunkler, je weiter er
   * von der Kamera entfernt ist (absolute Kameratiefe).
   */
  static bodyFogNear = 100;
  static bodyFogFar = 400;
  static bodyFogMax = 0.5;

  constructor(solid: Solid, x: number, y: number, z: number) {
    this.solid = solid;
    this.pos = new l3d.Vec3(x, y, z);
    this.vel = new l3d.Vec3(0, 0, 0);
  }

  /** Zeichnet den Body mit Körper-Nebel + per-edge Tiefennebel. */
  draw(fov: number, view: l3d.Matrix4x4): void {
    // Rotation überspringen wenn alle Winkel 0 sind
    const world = (this.rotX === 0 && this.rotY === 0 && this.rotZ === 0)
      ? l3d.translateMatrix(this.pos.x, this.pos.y, this.pos.z)
      : l3d.multMatrix(
          l3d.translateMatrix(this.pos.x, this.pos.y, this.pos.z),
          l3d.rotateMatrix(this.rotX, this.rotY, this.rotZ),
        );
    wgl.strokeWidth(this.lineWidth);

    // Körper-Zentrum in Kamerakoordinaten
    const centerCam = this.pos.transform(view);
    const depth = centerCam.z;

    // 1. Körper-Nebel (absolute Tiefe) → Basis-Farbe abdunkeln
    const bodyFog = depth > Body.bodyFogNear
      ? Math.min(1, (depth - Body.bodyFogNear) / (Body.bodyFogFar - Body.bodyFogNear)) * Body.bodyFogMax
      : 0;
    const baseColor = darkenHex(this.color, bodyFog);

    // 2. Per-edge-Nebel (relative Tiefe) → Solid.draw() dunkelt jede Kante einzeln
    this.solid.draw(fov, view, world, {
      baseColor,
      near: Body.fogNear,
      far: Body.fogFar,
      max: Body.fogMax,
      centerDepth: centerCam.z,
    });
  }

  /** Distanz zu einem anderen Body (Mittelpunkt zu Mittelpunkt). */
  distanceTo(other: Body): number {
    return this.pos.distanceTo(other.pos);
  }
}
