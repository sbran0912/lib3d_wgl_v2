/**
 * lib-solids.ts  –  3D-Objekte (Drahtgittermodelle)
 *
 * Trennung der Zuständigkeiten:
 *   lib-3d.ts      → Mathematik (Vektoren, Matrizen, Projektion)
 *   lib-solids.ts  → 3D-Objekte + Rendering-Logik (Transformation → Projektion → wgl)
 *   lib-wgl.ts     → 2D-Primitive (Punkte, Linien, Flächen)
 */

import * as l3d from "./lib-3d.ts";
import * as wgl from "./lib-wgl.ts";

// ====================================================================
// SOLID – Ein 3D-Drahtgitter-Objekt
// ====================================================================

export class Solid {
  /** 3D-Punkte in Objekt-Koordinaten (lokal, relativ zum Objekt-Ursprung) */
  vertices: l3d.Vec3[];

  /** Kanten als Paare von Vertex-Indizes: [[i0, j0], [i1, j1], …] */
  edges: [number, number][];

  constructor(vertices: l3d.Vec3[], edges: [number, number][]) {
    this.vertices = vertices;
    this.edges = edges;
  }

  /**
   * Zeichnet das Solid auf den Bildschirm.
   *
   * Pipeline: Objekt-Koordinaten
   *   → worldToCamera (world × view)
   *   → project (3D → 2D)
   *   → wgl.line() zeichnen
   *
   * @param fov   Field-of-View (für Projektion, z.B. 300)
   * @param view  View-Matrix (Kamera, z.B. von lookAtMatrix)
   * @param world World-Matrix (Position/Rotation des Objekts im Raum)
   */
  draw(fov: number, view: l3d.Matrix4x4, world: l3d.Matrix4x4): void {
    // 1. Kombinierte view × world-Matrix (einmal berechnen)
    const vw = l3d.multMatrix(view, world);

    // 2. Alle Vertices → Kamerakoordinaten → 2D projizieren
    const projected = this.vertices.map((v) =>
      l3d.project(fov, v.transform(vw)),
    );

    // 3. Kanten zeichnen (mit Projektion auf dem Bildschirm)
    for (const [i, j] of this.edges) {
      const a = projected[i];
      const b = projected[j];
      wgl.line(a.x, a.y, b.x, b.y);
    }
  }
}

// ====================================================================
// HILFSKONSTRUKTOREN – Standard-Geometrien
// ====================================================================

/**
 * Erzeugt einen achsenparallelen Quader (Box) mit Zentrum im Ursprung.
 *
 * @param w Breite (X-Richtung)
 * @param h Höhe   (Y-Richtung)
 * @param d Tiefe  (Z-Richtung)
 * @returns Solid mit 8 Ecken und 12 Kanten
 *
 * Beispiel:
 *   const box = createBox(40, 30, 60);
 */
export function createBox(w: number, h: number, d: number): Solid {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const V = (x: number, y: number, z: number) => new l3d.Vec3(x, y, z);

  const vertices = [
    V(-hw, -hh, -hd), // 0: vorne-unten-links
    V( hw, -hh, -hd), // 1: vorne-unten-rechts
    V( hw,  hh, -hd), // 2: vorne-oben-rechts
    V(-hw,  hh, -hd), // 3: vorne-oben-links
    V(-hw, -hh,  hd), // 4: hinten-unten-links
    V( hw, -hh,  hd), // 5: hinten-unten-rechts
    V( hw,  hh,  hd), // 6: hinten-oben-rechts
    V(-hw,  hh,  hd), // 7: hinten-oben-links
  ];

  const edges: [number, number][] = [
    // Vorderseite (Z = -hd)
    [0, 1], [1, 2], [2, 3], [3, 0],
    // Rückseite (Z = +hd)
    [4, 5], [5, 6], [6, 7], [7, 4],
    // Verbindungen vorne ↔ hinten
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  return new Solid(vertices, edges);
}

/**
 * Erzeugt eine quadratische Pyramide mit Zentrum im Ursprung.
 *
 * @param base   Seitenlänge der Basis
 * @param height Höhe der Pyramide (Spitze in +Y-Richtung)
 * @returns Solid mit 5 Ecken und 8 Kanten
 */
export function createPyramid(base: number, height: number): Solid {
  const hb = base / 2;
  const V = (x: number, y: number, z: number) => new l3d.Vec3(x, y, z);

  const vertices = [
    V(-hb, -height / 2, -hb), // 0: Basis-vorne-links
    V( hb, -height / 2, -hb), // 1: Basis-vorne-rechts
    V( hb, -height / 2,  hb), // 2: Basis-hinten-rechts
    V(-hb, -height / 2,  hb), // 3: Basis-hinten-links
    V(  0,  height / 2,   0), // 4: Spitze
  ];

  const edges: [number, number][] = [
    // Basis
    [0, 1], [1, 2], [2, 3], [3, 0],
    // Seitenkanten
    [0, 4], [1, 4], [2, 4], [3, 4],
  ];

  return new Solid(vertices, edges);
}

/**
 * Erzeugt ein Gitter (Grid) in der XZ-Ebene.
 *
 * @param size   Seitenlänge des Gitters (Mittelpunkt bei y=0)
 * @param cells  Anzahl Zellen pro Seite (z.B. 5 → 5×5 Zellen)
 * @returns Solid mit (cells+1)² Punkten und passenden Kanten
 */
export function createGrid(size: number, cells: number): Solid {
  const half = size / 2;
  const step = size / cells;
  const V = (x: number, y: number, z: number) => new l3d.Vec3(x, y, z);

  const vertices: l3d.Vec3[] = [];
  for (let iz = 0; iz <= cells; iz++) {
    for (let ix = 0; ix <= cells; ix++) {
      vertices.push(V(-half + ix * step, 0, -half + iz * step));
    }
  }

  const edges: [number, number][] = [];
  const stride = cells + 1;

  // Horizontale Linien (entlang X)
  for (let iz = 0; iz <= cells; iz++) {
    for (let ix = 0; ix < cells; ix++) {
      const idx = iz * stride + ix;
      edges.push([idx, idx + 1]);
    }
  }

  // Vertikale Linien (entlang Z)
  for (let ix = 0; ix <= cells; ix++) {
    for (let iz = 0; iz < cells; iz++) {
      const idx = iz * stride + ix;
      edges.push([idx, idx + stride]);
    }
  }

  return new Solid(vertices, edges);
}
