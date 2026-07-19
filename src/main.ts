/**
 * main.ts  –  Demo mit Body-Klasse
 *
 * Zeigt:
 *   - Kamera-Perspektive via lookAtMatrix
 *   - Body.draw() statt manueller World-Matrix
 *   - Animierte Position/Rotation über Body-Eigenschaften
 *   - distanceTo() für Abstandsmessung zwischen Bodies
 */

import * as wgl from "./lib-wgl.ts";
import * as l3d from "./lib-3d.ts";
import { Solid, createBox, createPyramid, createGrid, createSphere } from "./lib-solids.ts";
import { Body } from "./lib-body.ts";

// ====================================================================
// KONFIGURATION
// ====================================================================

const SCREEN_W = 800;
const SCREEN_H = 600;

// FOV: größer = mehr Zoom (wie längere Brennweite)
// s = fov/(fov+z) → je größer fov, desto näher an 1.0
const FOV = 1500;

// Kamera
const CAM_POS    = new l3d.Vec3(50, 40, -70);
const CAM_TARGET = new l3d.Vec3(0, 0, 0);
const CAM_UP     = new l3d.Vec3(0, 1, 0);

// ====================================================================
// SZENE AUFBAUEN
// ====================================================================

// -- Boden-Gitter (unbewegt, bleibt Spezialfall) --
const grid = createGrid(600, 24);

// -- Bodies --
const box1    = new Body(createBox(30, 40, 50), -60, 0, 80);
box1.color     = "#ff6644";
box1.lineWidth = 1;

const box2    = new Body(createBox(30, 40, 50), 0, 0, 0);   // Orbit → Position wird pro Frame gesetzt
box2.color     = "#44aaff";
box2.lineWidth = 1;

const pyramid = new Body(createPyramid(60, 80), 70, 20, 60);
pyramid.color  = "#66ff88";
pyramid.lineWidth = 1;

const sphere  = new Body(createSphere(35, 12, 9), 130, 25, -200);
sphere.color   = "#ff66cc";
sphere.lineWidth = 1;

const allBodies = [box1, box2, pyramid, sphere];

// ====================================================================
// Pivot / Orbit für box2
// ====================================================================

const pivot = new l3d.Vec3(0, 0, 100);
const orbitRadius = 90;

// ====================================================================
// DRAW-SCHLEIFE
// ====================================================================

let time = 0;

function draw() {
  time += 0.02;

  // -- Hintergrund --
  wgl.background(40, 40, 40);

  // -- View-Matrix --
  const view = l3d.lookAtMatrix(CAM_POS, CAM_TARGET, CAM_UP);

  // ================================================================
  // 1. BODEN-GITTER
  // ================================================================
  wgl.strokeColor("#445");
  wgl.strokeWidth(1);
  grid.draw(FOV, view, l3d.identityMatrix());

  // ================================================================
  // 2. BODY-ZUSTÄNDE AKTUALISIEREN
  // ================================================================

  // Box #1 – Eigenrotation
  box1.rotX = time * 0.6;
  box1.rotY = time * 0.4;

  // Box #2 – Orbit um Pivot + Eigenrotation
  const orbitAngle = time * 0.8;
  const orbitPos = l3d.rotateAround(
    new l3d.Vec3(orbitRadius, 0, 0),
    pivot,
    l3d.rotateMatrix(0, orbitAngle, 0),
  );
  box2.pos = orbitPos;
  box2.rotY = time * 1.5;

  // Pyramide – Eigenrotation
  pyramid.rotX = time * 0.3;
  pyramid.rotY = time * 0.7;

  // Kugel – Eigenrotation
  sphere.rotX = time * 0.5;
  sphere.rotY = time * 0.8;
  sphere.rotZ = time * 0.3;

  // ================================================================
  // 3. ALLE BODYS ZEICHNEN
  // ================================================================

  for (const b of allBodies) {
    b.draw(FOV, view);
  }

  // ================================================================
  // 4. INFO: Abstand zwischen box1 und box2
  // ================================================================
  const dist = box1.distanceTo(box2);
  wgl.strokeColor("#ffffff66");
  wgl.pointSize(3);
  const pivotScreen = l3d.project(FOV, pivot.transform(view));
  wgl.circle(pivotScreen.x, pivotScreen.y, 4, 0, 16);
}

// ====================================================================
// START
// ====================================================================

wgl.init(SCREEN_W, SCREEN_H);
wgl.startAnimation(draw);
