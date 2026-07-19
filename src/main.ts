/**
 * main.ts  –  Demo für lib-3d + lib-solids
 *
 * Zeigt:
 *   - Kamera-Perspektive via lookAtMatrix
 *   - World-Matrix für Position/Rotation von Objekten
 *   - Solid.draw() für Box, Pyramide, Grid
 *   - rotateAround() für Rotation um ein Pivot (animiert)
 */

import * as wgl from "./lib-wgl.ts";
import * as l3d from "./lib-3d.ts";
import { Solid, createBox, createPyramid, createGrid } from "./lib-solids.ts";

// ====================================================================
// KONFIGURATION
// ====================================================================

const SCREEN_W = 800;
const SCREEN_H = 600;
const FOV = 400;

// Kamera – Position/Winkel einfach durch Ändern von CAM_POS justieren
const CAM_POS    = new l3d.Vec3(200, 120, -250); // Kamera von rechts oben
const CAM_TARGET = new l3d.Vec3(0, 0, 100);      // Blick zur Szenen-Mitte
const CAM_UP     = new l3d.Vec3(0, 1, 0);        // Y zeigt nach oben

// ====================================================================
// SZENE AUFBAUEN
// ====================================================================

// -- Boden-Gitter (100×100 Einheiten, 10×10 Zellen) --
const grid = createGrid(200, 10);

// -- Box (30×40×50) --
const box = createBox(30, 40, 50);

// -- Pyramide (Basis 60, Höhe 80) --
const pyramid = createPyramid(60, 80);

// ====================================================================
// DRAW-SCHLEIFE
// ====================================================================

let time = 0;

function draw() {
  time += 0.02; // ca. 60 fps → 1 Umdrehung ≈ 2.1 Sekunden

  // -- Hintergrund --
  wgl.background(15, 15, 30);

  // -- View-Matrix (Kamera) – bleibt pro Frame gleich --
  const view = l3d.lookAtMatrix(CAM_POS, CAM_TARGET, CAM_UP);

  // ================================================================
  // 1. BODEN-GITTER (unbewegt, im Ursprung)
  // ================================================================
  wgl.strokeColor("#334");
  wgl.strokeWidth(1);
  grid.draw(FOV, view, l3d.identityMatrix());

  // ================================================================
  // 2. BOX – rotiert um ihr eigenes Zentrum (Pivot = Objektposition)
  // ================================================================
  const boxPos = new l3d.Vec3(-60, 0, 80);
  const boxRot = l3d.rotateMatrix(time * 0.6, time * 0.4, 0);

  // World-Matrix aus Translation × Rotation (zuerst rotieren, dann verschieben)
  const boxWorld = l3d.multMatrix(
    l3d.translateMatrix(boxPos.x, boxPos.y, boxPos.z),
    boxRot,
  );

  wgl.strokeColor("#ff6644");
  wgl.strokeWidth(2);
  box.draw(FOV, view, boxWorld);

  // ================================================================
  // 3. BOX #2 – Rotation um einen äußeren Pivot-Punkt (Sonnensystem-Effekt)
  //    Demonstriert rotateAround() auf der Ebene der Vertices.
  // ================================================================
  const pivot = new l3d.Vec3(0, 0, 100);
  const orbitAngle = time * 0.8;
  const orbitRadius = 90;

  // Position auf der Kreisbahn berechnen (um die Y-Achse)
  const orbitRot = l3d.rotateMatrix(0, orbitAngle, 0);
  const orbitPos = l3d.rotateAround(
    new l3d.Vec3(orbitRadius, 0, 0),
    pivot,
    orbitRot,
  );

  // Box rotiert zusätzlich um die eigene Achse
  const box2Rot = l3d.rotateMatrix(0, time * 1.5, 0);
  const box2World = l3d.multMatrix(
    l3d.translateMatrix(orbitPos.x, orbitPos.y, orbitPos.z),
    box2Rot,
  );

  wgl.strokeColor("#44aaff");
  wgl.strokeWidth(2);
  box.draw(FOV, view, box2World);

  // ================================================================
  // 4. PYRAMIDE – über dem Boden, leicht schwebend
  // ================================================================
  const pyrPos = new l3d.Vec3(70, 20, 60);
  const pyrRot = l3d.rotateMatrix(time * 0.3, time * 0.7, 0);
  const pyrWorld = l3d.multMatrix(
    l3d.translateMatrix(pyrPos.x, pyrPos.y, pyrPos.z),
    pyrRot,
  );

  wgl.strokeColor("#66ff88");
  wgl.strokeWidth(2);
  pyramid.draw(FOV, view, pyrWorld);

  // ================================================================
  // 5. INFO-TEXT (optional, über wgl-Primitive)
  // ================================================================
  wgl.strokeColor("#ffffff66");
  wgl.pointSize(3);
  // Kleine Markierung für den Pivot-Punkt
  const pivotScreen = l3d.project(FOV, pivot.transform(view));
  wgl.circle(pivotScreen.x, pivotScreen.y, 4, 0 /* stroke */, 16);
}

// ====================================================================
// START
// ====================================================================

wgl.init(SCREEN_W, SCREEN_H);
wgl.startAnimation(draw);
