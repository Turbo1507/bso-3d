import * as THREE from 'three';

/* материалы «живого макета»: у модели нет развёрток, поэтому фактура считается
   в шейдере по мировым координатам (бумага, картон, флок, акрил, грунт) */

export const CLIP_Y = 9.5; // ниже этой отметки модель срезана, дальше идёт кусок земли

export const HL = {
  uSel: { value: new THREE.Vector4(0, 0, 0, 0) },   // x, z, вкл, —
  uHov: { value: new THREE.Vector4(0, 0, 0, 0) },
  uHalf: { value: new THREE.Vector2(4.5, 3.7) },
  uHalfH: { value: new THREE.Vector2(4.5, 3.7) },
  uAxis: { value: new THREE.Vector2(1, 0) },
  uGold: { value: new THREE.Color('#e2b84a') },
};

const NOISE = `
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
float inRect(vec4 c, vec2 h){ vec2 d = vW.xz - c.xy; vec2 l = vec2(dot(d, uAxis), dot(d, vec2(-uAxis.y, uAxis.x)));
  vec2 e = h - abs(l); return c.z * step(0.0, min(e.x, e.y)); }
`;

// фактура по типу поверхности; c — базовый цвет материала
const TEX = {
  paper: `c *= 0.965 + 0.05 * fbm(vW * 0.9) + 0.035 * (vn(vW * 14.0) - 0.5);`,
  board: `c *= 0.9 + 0.14 * fbm(vW * 0.35) + 0.05 * (vn(vW * 9.0) - 0.5);`,
  cork: `c *= 0.82 + 0.3 * fbm(vW * 0.5); c *= 0.8 + 0.4 * step(0.62, vn(vW * 5.0)) * 0.6 + 0.12 * vn(vW * 13.0);`,
  path: `c *= 0.93 + 0.1 * fbm(vW * 0.7) + 0.08 * (vn(vW * 6.0) - 0.5);`,
  grass: `float g = fbm(vW * 1.6); c *= 0.7 + 0.5 * g; c = mix(c, c * vec3(1.12, 1.06, 0.72), fbm(vW * 0.07)); c *= 0.9 + 0.2 * vn(vW * 11.0);`,
  water: `float w = fbm(vW * vec3(0.12, 0.0, 0.12)); c = mix(lin(vec3(0.20, 0.45, 0.50)), lin(vec3(0.45, 0.74, 0.74)), w);
    c *= 0.94 + 0.12 * sin(vW.x * 0.9 + 3.0 * fbm(vW * 0.2)) * 0.5;`,
  glass: `c *= 0.9 + 0.15 * fbm(vW * 0.2);`,
  // земля спокойная и тёмная, объём дают рельеф и камни, а не рисунок
  soil: `vec3 turf = lin(vec3(0.18)), clod = lin(vec3(0.23));
    c = mix(turf, clod, smoothstep(0.4, 0.7, fbm(vW * 0.5)));
    c *= 0.88 + 0.2 * fbm(vW * 1.6);`,
};

/* opts.tex — фактура, opts.highlight — участвует в подсветке виллы,
   opts.clip — срезать ниже CLIP_Y */
export function maquette(color, opts = {}) {
  const { tex = 'paper', highlight = false, clip = true, ...mat } = opts;
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...mat });
  if (clip) m.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -CLIP_Y)];
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, HL);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW; uniform vec4 uSel; uniform vec4 uHov; uniform vec2 uHalf; uniform vec2 uHalfH; uniform vec2 uAxis; uniform vec3 uGold;
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ vec3 c = diffuseColor.rgb; ${TEX[tex]} diffuseColor.rgb = c; }
float selK = ${highlight ? 'inRect(uSel, uHalf)' : '0.0'};
float hovK = ${highlight ? 'inRect(uHov, uHalfH) * (1.0 - selK)' : '0.0'};
// выбранная вилла горит золотом, остальное чуть уходит в тень
diffuseColor.rgb *= 1.0 - 0.42 * uSel.z * (1.0 - selK);
diffuseColor.rgb = mix(diffuseColor.rgb, uGold, max(selK, 0.6 * hovK));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += uGold * (0.42 * selK + 0.12 * hovK);`);
  };
  return m;
}

// от цоколя оставляем только верх: местами это и есть земля под зданиями.
// стенки и дно заменяет рельефный срез; верх над водой выкидываем, иначе ложится на воду
export function plinthTop(mesh, water) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const p = g.attributes.position, out = [];
  const wb = water ? new THREE.Box3().setFromObject(water) : null;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(e.subVectors(c, a)).transformDirection(mesh.matrixWorld);
    if (n.y < 0.5) continue;
    m.copy(a).add(b).add(c).divideScalar(3).applyMatrix4(mesh.matrixWorld);
    if (wb && m.y < wb.max.y + 0.3 && m.x > wb.min.x && m.x < wb.max.x && m.z > wb.min.z && m.z < wb.max.z) continue;
    out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  ng.applyMatrix4(mesh.matrixWorld);
  ng.computeVertexNormals();
  return ng;
}

// прячет то, что торчит из-под основания: треугольники за контуром и боковые стенки тонких слоёв у края
const insidePoly = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
const edgeDist = (poly, x, z) => { let m = 1e9; for (let i = 0; i < poly.length; i++) { const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length]; const ex = bx - ax, ez = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1))); m = Math.min(m, Math.hypot(x - ax - ex * t, z - az - ez * t)); } return m; };
export function trimToOutline(mesh, polys, band = 1.5, minY = -1e9) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const p = g.attributes.position, out = [], w = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], n = new THREE.Vector3(), e = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    for (let j = 0; j < 3; j++) w[j].fromBufferAttribute(p, i + j).applyMatrix4(mesh.matrixWorld);
    const x = (w[0].x + w[1].x + w[2].x) / 3, z = (w[0].z + w[1].z + w[2].z) / 3;
    if (!polys.some(poly => insidePoly(poly, x, z))) continue;
    if (Math.min(w[0].y, w[1].y, w[2].y) < minY) continue;
    n.subVectors(w[1], w[0]).cross(e.subVectors(w[2], w[0])).normalize();
    if (Math.abs(n.y) < 0.4 && Math.min(...polys.map(poly => edgeDist(poly, x, z))) < band) continue;
    for (let j = 0; j < 3; j++) out.push(p.getX(i + j), p.getY(i + j), p.getZ(i + j));
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  ng.computeVertexNormals();
  return ng;
}

/* ---------- основание: кусок земли, вырванный по контуру участка ---------- */
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(ix + dx, iy + dy, iz + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), sx), l(c(0, 1, 0), c(1, 1, 0), sx), sy),
           l(l(c(0, 0, 1), c(1, 0, 1), sx), l(c(0, 1, 1), c(1, 1, 1), sx), sy), sz);
}
const fbm = (x, y, z) => vnoise(x, y, z) * 0.55 + vnoise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3) * 0.15;

// внешний контур цоколя на уровне CLIP_Y: рёбра вертикальных граней, пересекающих отметку
function outline(mesh) {
  const g = mesh.geometry, pos = g.attributes.position, idx = g.index;
  const n = idx ? idx.count : pos.count;
  const P = i => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mesh.matrixWorld);
  const key = (x, z) => Math.round(x * 4) + ',' + Math.round(z * 4);
  const pts = new Map(), adj = new Map();
  const link = (a, b) => { (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); };
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    const t = [P(i), P(i + 1), P(i + 2)];
    const nr = e1.subVectors(t[1], t[0]).cross(e2.subVectors(t[2], t[0])).normalize();
    if (Math.abs(nr.y) > 0.3) continue;
    // точки пересечения треугольника с плоскостью y = CLIP_Y
    const cut = [];
    for (let j = 0; j < 3; j++) {
      const a = t[j], b = t[(j + 1) % 3];
      if ((a.y - CLIP_Y) * (b.y - CLIP_Y) < 0) { const k = (CLIP_Y - a.y) / (b.y - a.y); cut.push([a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k]); }
    }
    if (cut.length !== 2) continue;
    const [ka, kb] = cut.map(([x, z]) => key(x, z));
    if (ka === kb) continue;
    pts.set(ka, cut[0]); pts.set(kb, cut[1]); link(ka, kb); link(kb, ka);
  }
  // самый длинный замкнутый обход
  const seen = new Set(); let best = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [start]; seen.add(start);
    let prev = null, cur = start;
    for (;;) {
      const next = [...adj.get(cur)].find(k => k !== prev && !seen.has(k));
      if (!next) break;
      loop.push(next); seen.add(next); prev = cur; cur = next;
    }
    if (loop.length > best.length) best = loop;
  }
  return best.map(k => pts.get(k));
}

function resample(poly, step) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const L = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.round(L / step));
    for (let j = 0; j < k; j++) out.push([ax + (bx - ax) * j / k, az + (bz - az) * j / k]);
  }
  return out;
}

// расстояние от точки внутрь по лучу до противоположного края
function depthInside(poly, x, z, nx, nz) {
  let best = 1e9;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const ex = bx - ax, ez = bz - az, den = nx * ez - nz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((ax - x) * ez - (az - z) * ex) / den, u = ((ax - x) * nz - (az - z) * nx) / den;
    if (t > 0.5 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return best;
}

// контур верхних граней меша (вода): рёбра, которые принадлежат одному треугольнику
export function footprint(mesh) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const p = g.attributes.position, w = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], n = new THREE.Vector3(), e = new THREE.Vector3();
  const key = (v) => `${Math.round(v.x * 20)},${Math.round(v.z * 20)}`, cnt = new Map(), pts = new Map();
  for (let i = 0; i < p.count; i += 3) {
    for (let j = 0; j < 3; j++) w[j].fromBufferAttribute(p, i + j).applyMatrix4(mesh.matrixWorld);
    n.subVectors(w[1], w[0]).cross(e.subVectors(w[2], w[0]));
    if (n.normalize().y < 0.5) continue;
    for (let j = 0; j < 3; j++) {
      const a = key(w[j]), b = key(w[(j + 1) % 3]); if (a === b) continue;
      pts.set(a, [w[j].x, w[j].z]); pts.set(b, [w[(j + 1) % 3].x, w[(j + 1) % 3].z]);
      const k = a < b ? a + '|' + b : b + '|' + a; cnt.set(k, (cnt.get(k) || 0) + 1);
    }
  }
  const adj = new Map(), link = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
  for (const [k, c] of cnt) if (c === 1) { const [a, b] = k.split('|'); link(a, b); link(b, a); }
  const seen = new Set(); let best = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [start]; seen.add(start); let prev = null, cur = start;
    for (;;) { const next = [...adj.get(cur)].find(k => k !== prev && !seen.has(k)); if (!next) break; loop.push(next); seen.add(next); prev = cur; cur = next; }
    if (loop.length > best.length) best = loop;
  }
  return best.map(k => pts.get(k));
}

export function buildEarthChunk(plinth, material, topY, given) {
  let poly = given || outline(plinth);
  if (poly.length < 8) return null;
  poly = resample(poly, 1.5);
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length]; area += ax * bz - bx * az; }
  if (area < 0) poly.reverse();
  const N = poly.length;
  // нормаль внутрь, сглаженная по соседям
  const nrm = poly.map((_, i) => {
    let nx = 0, nz = 0;
    for (let j = -8; j <= 8; j++) {
      const [ax, az] = poly[(i + j - 1 + N) % N], [bx, bz] = poly[(i + j + 1 + N) % N];
      nx += -(bz - az); nz += bx - ax;
    }
    const L = Math.hypot(nx, nz) || 1;
    return [-nx / L, -nz / L];
  });
  // ориентация «внутрь» проверяется по точке
  const [tx, tz] = poly[0], [tnx, tnz] = nrm[0];
  if (depthInside(poly, tx, tz, tnx, tnz) > 1e8) nrm.forEach(v => { v[0] = -v[0]; v[1] = -v[1]; });
  const width = poly.map(([x, z], i) => depthInside(poly, x, z, nrm[i][0], nrm[i][1]));

  const RINGS = 10, DEPTH = 5;
  // верх среза идёт по краю газона и дорожек; провалы (нет попадания) берём от соседей
  // верх среза поднимаем до самой высокой поверхности у края, чтобы из-под неё не торчали слои
  let tops = poly.map(([x, z], i) => {
    if (!topY) return null;
    const h = [0.2, 0.6, 1.2].map(d => topY(x + nrm[i][0] * d, z + nrm[i][1] * d)).filter(v => v != null);
    return h.length ? Math.max(...h) : null;
  });
  tops = tops.map((t, i) => {
    const w = []; for (let j = -3; j <= 3; j++) { const v2 = tops[(i + j + N) % N]; if (v2 != null) w.push(v2); }
    return w.length ? w.sort((a, b) => a - b)[w.length >> 1] : CLIP_Y + 1;
  });
  const rnd = (() => { let sd = 11; return () => (sd = (sd * 16807) % 2147483647) / 2147483647; })();
  const rings = [];
  for (let k = 0; k <= RINGS; k++) {
    const f = k / RINGS;
    const ring = poly.map(([x, z], i) => {
      const top = tops[i] + 0.02, bot = CLIP_Y - DEPTH;
      if (k === 0) return [x, top, z];
      const y = top - (top - bot) * Math.pow(f, 1.1) + (k === RINGS ? (fbm(x * 0.15, 9, z * 0.15) - 0.5) * 4 : 0);
      // объём: комья выпирают наружу и проваливаются внутрь, к низу край уходит под модель
      const bump = ((fbm(x * 0.35, y * 0.5, z * 0.35) - 0.5) * 2.4 + (vnoise(x * 1.1, y * 1.3, z * 1.1) - 0.5) * 0.9) * Math.min(1, f * 4);
      const off = Math.min(f * 2.2 - bump, width[i] * 0.46);
      return [x + nrm[i][0] * off, y, z + nrm[i][1] * off];
    });
    rings.push(ring);
  }
  const verts = [];
  const tri = (a, b, c) => verts.push(...a, ...b, ...c);
  for (let k = 0; k < RINGS; k++) {
    const A = rings[k], B = rings[k + 1];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      tri(A[i], B[i], A[j]); tri(A[j], B[i], B[j]);
    }
  }
  const last = rings[RINGS];
  const contour = last.map(([x, , z]) => new THREE.Vector2(x, z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const [a, b, c] of faces) tri(last[a], last[c], last[b]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const group = new THREE.Group();
  group.userData.outline = poly;
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  group.add(mesh);

  // камни, вросшие в срез
  const rockG = new THREE.IcosahedronGeometry(1, 0);
  const rockM = new THREE.MeshStandardMaterial({ name: 'rock', color: '#474747', roughness: 1, flatShading: true });
  const rocks = [];
  for (let i = 0; i < N; i += 2) {
    if (rnd() > 0.5) continue;
    const k = 1 + Math.floor(rnd() * (RINGS - 2));
    const [x, y, z] = rings[k][i];
    const ry = y + (rnd() - 0.5) * 0.4, rs = 0.3 + rnd() * 0.7;
    if (ry + rs > tops[i] - 0.15) continue;
    rocks.push([x - nrm[i][0] * 0.2, ry, z - nrm[i][1] * 0.2, rs]);
  }
  const rockI = new THREE.InstancedMesh(rockG, rockM, rocks.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  rocks.forEach(([x, y, z, s], i) => {
    e.set(rnd() * 6, rnd() * 6, rnd() * 6); q.setFromEuler(e);
    m4.compose(v.set(x, y, z), q, sc.set(s * (0.8 + rnd() * 0.5), s * (0.6 + rnd() * 0.3), s)); rockI.setMatrixAt(i, m4);
  });
  rockI.receiveShadow = true;
  group.add(rockI);

  // лианы: свисают с края участка гроздьями, ниже среза висят свободно
  // лист: черешок сверху, острый кончик вниз
  const leafS = new THREE.Shape();
  leafS.moveTo(0, 0); leafS.quadraticCurveTo(0.26, -0.16, 0.02, -0.52); leafS.quadraticCurveTo(-0.24, -0.2, 0, 0);
  const leafG = new THREE.ShapeGeometry(leafS, 4);
  const leafM = new THREE.MeshStandardMaterial({ name: 'vine', color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide });
  const leaves = [];
  const bottom = CLIP_Y - DEPTH;
  for (let i = 0; i < N; i++) {
    const [x, z] = poly[i];
    if (vnoise(x * 0.07, 3.1, z * 0.07) < 0.55 || rnd() > 0.4) continue;
    const ox = -nrm[i][0], oz = -nrm[i][1];
    const top = tops[i];
    const L = (top - bottom) * (0.25 + rnd() * 0.55) + rnd() * 1.5;
    const ph = rnd() * 6, tx = -oz, tz = ox;
    for (let t = 0; t < L; t += 0.2) {
      const y = top - t;
      // прижата к стенке, ниже среза отходит наружу
      const out = 0.5 + Math.max(0, bottom + 1 - y) * 0.12;
      const sw = Math.sin(t * 0.9 + ph) * 0.22;
      const wx = x + ox * out + tx * sw, wz = z + oz * out + tz * sw;
      const s = (0.8 + rnd() * 0.6) * (1 - 0.4 * t / L);
      leaves.push([wx + (rnd() - 0.5) * 0.35, y, wz + (rnd() - 0.5) * 0.35, Math.atan2(ox, oz) + (rnd() - 0.5) * 1.4, -0.5 + rnd() * 0.7, s]);
    }
  }
  const leafI = new THREE.InstancedMesh(leafG, leafM, leaves.length);
  const col = new THREE.Color(), base = [new THREE.Color('#5f6f45'), new THREE.Color('#77854f'), new THREE.Color('#4c5c3a')];
  leaves.forEach(([x, y, z, yaw, pitch, s], i) => {
    e.set(pitch, yaw, (rnd() - 0.5) * 0.8, 'YXZ'); q.setFromEuler(e);
    m4.compose(v.set(x, y, z), q, sc.set(s, s, s)); leafI.setMatrixAt(i, m4);
    leafI.setColorAt(i, col.copy(base[Math.floor(rnd() * 3)]).multiplyScalar(0.85 + rnd() * 0.3));
  });
  group.add(leafI);
  return group;
}
