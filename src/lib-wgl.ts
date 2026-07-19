/*
-----------------------------------------------------------------
WebGL Implementierung  –  analog zu lib-std.ts
-----------------------------------------------------------------
Koordinatensystem: Ursprung in der Mitte, +Y zeigt nach oben.
Kein GLSL-Schreiben nötig – Shader werden intern verwaltet.

Shader-Modi (setEffect):
  "flat"      – einfache Volltonfarbe  (Standard)
  "gradient"  – radialer Verlauf von Farbe A nach Farbe B
  "pulse"     – pulsierende Helligkeit über die Zeit
-----------------------------------------------------------------
*/

/* =================================================================
   INTERNER GLSL-CODE
================================================================= */

// Vertex-Shader:
// Transformiert 2D-Pixelkoordinaten (Ursprung Mitte, +Y oben)
// in WebGL-NDC-Koordinaten (-1..+1).
const VERT_SRC = `
  attribute vec2 aPos;
  uniform vec2  uResolution;
  uniform float uPointSize;
  varying vec2  vPos;

  void main() {
    vPos = aPos;
    vec2 ndc = aPos / (uResolution * 0.5);
    gl_Position = vec4(ndc, 0.0, 1.0);
    gl_PointSize = uPointSize;
  }
`;

// Fragment-Shader:
// uMode  0 = flat      – einfache Farbe uColor
// uMode  1 = gradient  – radialer Verlauf uColor → uColor2
// uMode  2 = pulse     – flat mit sinusförmiger Helligkeitspulsation
const FRAG_SRC = `
  precision mediump float;

  uniform int   uMode;
  uniform vec4  uColor;
  uniform vec4  uColor2;
  uniform float uTime;
  uniform vec2  uShapeCenter;
  uniform float uShapeRadius;
  varying vec2  vPos;

  void main() {
    if (uMode == 0) {
      gl_FragColor = uColor;
    } else if (uMode == 1) {
      float d = distance(vPos, uShapeCenter);
      float t = clamp(d / max(uShapeRadius, 1.0), 0.0, 1.0);
      gl_FragColor = mix(uColor, uColor2, t);
    } else if (uMode == 2) {
      float brightness = 0.6 + 0.4 * sin(uTime * 3.0);
      gl_FragColor = vec4(uColor.rgb * brightness, uColor.a);
    } else {
      gl_FragColor = uColor;
    }
  }
`;

/* =================================================================
   TYPEN & INTERNER ZUSTAND
================================================================= */

export type DrawStyle  = 0 | 1 | 2;           // 0=stroke, 1=fill, 2=both
export type EffectMode = "flat" | "gradient" | "pulse";

interface ColorState { r: number; g: number; b: number; a: number; }

interface DrawState {
  fill:   ColorState;
  stroke: ColorState;
  lineW:  number;
  effect: EffectMode;
  grad2:  ColorState;
}

// Canvas / GL
let canv: HTMLCanvasElement;
let gl:   WebGLRenderingContext;
let prog: WebGLProgram;

// Shader-Locations
let locPos:        number;
let locResolution: WebGLUniformLocation;
let locPointSize:  WebGLUniformLocation;
let locMode:       WebGLUniformLocation;
let locColor:      WebGLUniformLocation;
let locColor2:     WebGLUniformLocation;
let locTime:       WebGLUniformLocation;
let locCenter:     WebGLUniformLocation;
let locRadius:     WebGLUniformLocation;

// Animation
let looping   = true;
let startTime = 0;

// Maus
export let mouseX = 0;
export let mouseY = 0;
let mouseStatus = 0;

// Zeichenzustand-Stack
const stateStack: DrawState[] = [];
let state: DrawState = {
  fill:   { r: 1, g: 1, b: 1, a: 1 },
  stroke: { r: 0, g: 0, b: 0, a: 1 },
  lineW:  1,
  effect: "flat",
  grad2:  { r: 0, g: 0, b: 0, a: 1 },
};

/* =================================================================
   HILFSFUNKTIONEN (intern)
================================================================= */

/** Parst varargs in { r,g,b,a } mit Werten 0..1 */
function parseColor(...c: (string | number)[]): ColorState {
  if (c.length === 1 && typeof c[0] === "string") {
    let hex = (c[0] as string).replace("#", "");
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    const n = parseInt(hex, 16);
    return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255, a: 1 };
  }
  if (c.length === 1 && typeof c[0] === "number") {
    const v = (c[0] as number) / 255;
    return { r: v, g: v, b: v, a: 1 };
  }
  if (c.length === 3) {
    return { r: (c[0] as number)/255, g: (c[1] as number)/255, b: (c[2] as number)/255, a: 1 };
  }
  if (c.length === 4) {
    return { r: (c[0] as number)/255, g: (c[1] as number)/255, b: (c[2] as number)/255, a: (c[3] as number)/255 };
  }
  return { r: 1, g: 1, b: 1, a: 1 };
}

/** Kompiliert einen einzelnen GLSL-Shader */
function compileShader(type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error("Shader-Fehler: " + gl.getShaderInfoLog(shader));
  }
  return shader;
}

/** Verknüpft Vertex- und Fragment-Shader zu einem WebGL-Programm */
function createProgram(vertSrc: string, fragSrc: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compileShader(gl.VERTEX_SHADER,   vertSrc));
  gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("Programm-Fehler: " + gl.getProgramInfoLog(p));
  }
  return p;
}

/** Setzt Shader-Uniforms aus dem aktuellen Zustand */
function applyUniforms(cx: number, cy: number, radius: number, useStroke = false) {
  const col  = useStroke ? state.stroke : state.fill;
  const mode = state.effect === "flat"     ? 0
             : state.effect === "gradient" ? 1
             :                               2;   // pulse
  gl.uniform1i(locMode,   mode);
  gl.uniform4f(locColor,  col.r, col.g, col.b, col.a);
  gl.uniform4f(locColor2, state.grad2.r, state.grad2.g, state.grad2.b, state.grad2.a);
  gl.uniform2f(locCenter, cx, cy);
  gl.uniform1f(locRadius, radius);
}

/** Überträgt Vertices an die GPU und löst einen Draw-Call aus */
function drawVertices(verts: Float32Array, mode: number) {
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(locPos);
  gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(mode, 0, verts.length / 2);
  gl.deleteBuffer(buf);
}

/** Berechnet Mittelpunkt und maximale Ausdehnung einer Punktmenge */
function shapeMetrics(pts: number[]): { cx: number; cy: number; r: number } {
  const n = pts.length / 2;
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cy += pts[i+1]; }
  cx /= n; cy /= n;
  let r = 0;
  for (let i = 0; i < pts.length; i += 2) {
    r = Math.max(r, Math.hypot(pts[i] - cx, pts[i+1] - cy));
  }
  return { cx, cy, r };
}

/* =================================================================
   MAUS / TOUCH (intern)
================================================================= */

function onMouseMove(e: MouseEvent) {
  // Koordinaten: Mitte = (0,0), +Y oben – genau wie lib-std.ts
  mouseX =  e.offsetX - canv.width  / 2;
  mouseY = -(e.offsetY - canv.height / 2);
}
function onMouseDown() { mouseStatus = 1; }
function onMouseUp()   { mouseStatus = 2; }

function onTouchMove(e: TouchEvent) {
  e.preventDefault();
  const rect  = (e.target as HTMLElement).getBoundingClientRect();
  const touch = e.targetTouches[0];
  mouseX =  (touch.pageX - rect.left)  - canv.width  / 2;
  mouseY = -((touch.pageY - rect.top) - canv.height / 2);
}
function onTouchStart(e: TouchEvent) { mouseStatus = 1; onTouchMove(e); }
function onTouchEnd()                { mouseStatus = 2; }

/* =================================================================
   ÖFFENTLICHE API – Setup
================================================================= */

export function getWidth():  number { return canv.width;  }
export function getHeight(): number { return canv.height; }

/** Stoppt die Animations-Schleife. */
export function noLoop() { looping = false; }

/** Gibt true zurück solange die Maustaste gedrückt ist. */
export function isMouseDown(): boolean { return mouseStatus === 1; }

/** Gibt einmalig true zurück wenn die Maustaste losgelassen wurde. */
export function isMouseUp(): boolean {
  if (mouseStatus === 2) { mouseStatus = 0; return true; }
  return false;
}

/** Initialisiert Canvas und WebGL-Kontext.
 *  Koordinatenursprung liegt in der Mitte, +Y zeigt nach oben.
 */
export function init(w: number, h: number) {
  canv = document.querySelector("canvas") as HTMLCanvasElement;
  canv.width  = w;
  canv.height = h;

  gl = canv.getContext("webgl") as WebGLRenderingContext;
  if (!gl) throw new Error("WebGL wird nicht unterstützt.");

  prog = createProgram(VERT_SRC, FRAG_SRC);
  gl.useProgram(prog);

  locPos        = gl.getAttribLocation (prog, "aPos");
  locResolution = gl.getUniformLocation(prog, "uResolution")!;
  locPointSize  = gl.getUniformLocation(prog, "uPointSize")!;
  locMode       = gl.getUniformLocation(prog, "uMode")!;
  locColor      = gl.getUniformLocation(prog, "uColor")!;
  locColor2     = gl.getUniformLocation(prog, "uColor2")!;
  locTime       = gl.getUniformLocation(prog, "uTime")!;
  locCenter     = gl.getUniformLocation(prog, "uShapeCenter")!;
  locRadius     = gl.getUniformLocation(prog, "uShapeRadius")!;

  gl.uniform1f(locPointSize, 4.0);

  gl.uniform2f(locResolution, w, h);

  // Alpha-Blending aktivieren
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.viewport(0, 0, w, h);
  startTime = performance.now();

  canv.addEventListener("mousemove",  onMouseMove);
  canv.addEventListener("mousedown",  onMouseDown);
  canv.addEventListener("mouseup",    onMouseUp);
  canv.addEventListener("touchmove",  onTouchMove,  { passive: false });
  canv.addEventListener("touchstart", onTouchStart, { passive: false });
  canv.addEventListener("touchend",   onTouchEnd);
}

/** Startet die Animations-Schleife mit requestAnimationFrame. */
export function startAnimation(fnDraw: () => void) {
  looping = true;
  const animate = () => {
    const t = (performance.now() - startTime) / 1000;
    gl.uniform1f(locTime, t);
    fnDraw();
    if (looping) window.requestAnimationFrame(animate);
  };
  window.requestAnimationFrame(animate);
}

/* =================================================================
   ÖFFENTLICHE API – Zeichenzustand
================================================================= */

/** Speichert aktuellen Zeichen-Zustand (Farben, Effekt, Linienstärke). */
export function push() {
  stateStack.push(JSON.parse(JSON.stringify(state)) as DrawState);
}

/** Stellt den zuletzt gespeicherten Zeichen-Zustand wieder her. */
export function pop() {
  const s = stateStack.pop();
  if (s) state = s;
}

/** Füllfarbe setzen.  Hex-String | Grau(0-255) | r,g,b | r,g,b,a (0-255) */
export function fillColor(...color: (string | number)[]) {
  state.fill = parseColor(...color);
}

/** Linienfarbe setzen.  Hex-String | Grau | r,g,b | r,g,b,a (0-255) */
export function strokeColor(...color: (string | number)[]) {
  state.stroke = parseColor(...color);
}

/** Linienstärke in Pixeln (betrifft stroke-Darstellung). */
export function strokeWidth(w: number) {
  state.lineW = w;
}

/** Aktiven Shader-Effekt wählen.
 *  "flat"     – einfache Volltonfarbe (Standard)
 *  "gradient" – radialer Verlauf von fillColor nach setGradient-Farbe
 *  "pulse"    – pulsierende Helligkeit über die Zeit
 */
export function setEffect(effect: EffectMode) {
  state.effect = effect;
}

/** Zweite Farbe für den Gradient-Effekt.
 *  Hex-String | Grau | r,g,b | r,g,b,a (0-255)
 */
export function setGradient(...color: (string | number)[]) {
  state.grad2 = parseColor(...color);
}

/** Hintergrundfarbe (löscht den gesamten Canvas).
 *  Hex-String | Grau | r,g,b (Werte 0-255)
 */
export function background(...color: (string | number)[]) {
  const c = parseColor(...color);
  gl.clearColor(c.r, c.g, c.b, c.a);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

/* =================================================================
   ÖFFENTLICHE API – Shapes
================================================================= */

/** Punktgröße in Pixeln setzen (betrifft point()-Zeichnung). */
export function pointSize(px: number) {
  gl.uniform1f(locPointSize, px);
}

/** Punkt bei (x,y) mit aktueller strokeColor, strokeWidth und pointSize. */
export function point(x: number, y: number) {
  applyUniforms(x, y, 0, true);
  gl.lineWidth(state.lineW);
  drawVertices(new Float32Array([x, y]), gl.POINTS);
}

/** Linie von (x1,y1) nach (x2,y2). */
export function line(x1: number, y1: number, x2: number, y2: number) {
  const { cx, cy, r } = shapeMetrics([x1, y1, x2, y2]);
  applyUniforms(cx, cy, r, true);
  gl.lineWidth(state.lineW);
  drawVertices(new Float32Array([x1, y1, x2, y2]), gl.LINES);
}

/** Dreieck.
 *  style: 0=stroke | 1=fill | 2=beide  (Standard: 0)
 */
export function triangle(
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  style: DrawStyle = 0,
) {
  const pts = [x1, y1, x2, y2, x3, y3];
  const { cx, cy, r } = shapeMetrics(pts);

  if (style === 1 || style === 2) {
    applyUniforms(cx, cy, r, false);
    drawVertices(new Float32Array(pts), gl.TRIANGLES);
  }
  if (style === 0 || style === 2) {
    applyUniforms(cx, cy, r, true);
    gl.lineWidth(state.lineW);
    drawVertices(
      new Float32Array([x1,y1, x2,y2,  x2,y2, x3,y3,  x3,y3, x1,y1]),
      gl.LINES,
    );
  }
}

/** Viereck mit 4 beliebigen Punkten.
 *  style: 0=stroke | 1=fill | 2=beide  (Standard: 0)
 */
export function shape(
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  x4: number, y4: number,
  style: DrawStyle = 0,
) {
  const pts = [x1, y1, x2, y2, x3, y3, x4, y4];
  const { cx, cy, r } = shapeMetrics(pts);

  if (style === 1 || style === 2) {
    applyUniforms(cx, cy, r, false);
    // Zwei Dreiecke: (p1,p2,p3) + (p1,p3,p4)
    drawVertices(
      new Float32Array([x1,y1, x2,y2, x3,y3,  x1,y1, x3,y3, x4,y4]),
      gl.TRIANGLES,
    );
  }
  if (style === 0 || style === 2) {
    applyUniforms(cx, cy, r, true);
    gl.lineWidth(state.lineW);
    drawVertices(
      new Float32Array([x1,y1,x2,y2, x2,y2,x3,y3, x3,y3,x4,y4, x4,y4,x1,y1]),
      gl.LINES,
    );
  }
}

/** Achsenparalleles Rechteck.  (x,y) = Mittelpunkt.
 *  style: 0=stroke | 1=fill | 2=beide  (Standard: 0)
 */
export function rect(x: number, y: number, w: number, h: number, style: DrawStyle = 0) {
  const hw = w / 2, hh = h / 2;
  shape(x - hw, y - hh,  x + hw, y - hh,  x + hw, y + hh,  x - hw, y + hh, style);
}

/** Kreis.  (x,y) = Mittelpunkt.
 *  style:    0=stroke | 1=fill | 2=beide  (Standard: 0)
 *  segments: Anzahl der Dreiecks-Segmente  (Standard: 64)
 */
export function circle(
  x: number, y: number,
  radius: number,
  style: DrawStyle = 0,
  segments = 64,
) {
  const tau = Math.PI * 2;

  if (style === 1 || style === 2) {
    const fillVerts: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a0 = (i       / segments) * tau;
      const a1 = ((i + 1) / segments) * tau;
      fillVerts.push(x, y);
      fillVerts.push(x + Math.cos(a0) * radius, y + Math.sin(a0) * radius);
      fillVerts.push(x + Math.cos(a1) * radius, y + Math.sin(a1) * radius);
    }
    applyUniforms(x, y, radius, false);
    drawVertices(new Float32Array(fillVerts), gl.TRIANGLES);
  }

  if (style === 0 || style === 2) {
    const strokeVerts: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * tau;
      strokeVerts.push(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
    }
    applyUniforms(x, y, radius, true);
    gl.lineWidth(state.lineW);
    drawVertices(new Float32Array(strokeVerts), gl.LINE_LOOP);
  }
}

/** Beliebiges Polygon als flaches Zahlen-Array [x0,y0, x1,y1, ...].
 *  style: 0=stroke | 1=fill | 2=beide  (Standard: 0)
 *  Hinweis: fill ist korrekt nur für konvexe Polygone (Fan-Triangulation).
 */
export function polygon(pts: number[], style: DrawStyle = 0) {
  if (pts.length < 4) return;
  const { cx, cy, r } = shapeMetrics(pts);

  if (style === 1 || style === 2) {
    const fillVerts: number[] = [];
    for (let i = 2; i < pts.length - 2; i += 2) {
      fillVerts.push(pts[0], pts[1], pts[i], pts[i+1], pts[i+2], pts[i+3]);
    }
    applyUniforms(cx, cy, r, false);
    drawVertices(new Float32Array(fillVerts), gl.TRIANGLES);
  }
  if (style === 0 || style === 2) {
    applyUniforms(cx, cy, r, true);
    gl.lineWidth(state.lineW);
    drawVertices(new Float32Array(pts), gl.LINE_LOOP);
  }
}