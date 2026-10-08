import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HL, maquette, buildEarthChunk, plinthTop, trimToOutline, footprint } from './maquette.js?v=20261008h';

const q = new URLSearchParams(location.search);
const MODEL = q.get('model') || './model.glb';
const SITE = './';

/* ---------- тексты ---------- */
const T = {
  ru: {
    all: 'Все виллы', avail: 'Только свободные', reset: 'Общий вид',
    st: { early: 'Свободна', prebooked: 'Бронь', booked: 'Продана' },
    stLegend: { early: 'Свободна', prebooked: 'Забронирована', booked: 'Продана' },
    villa: n => `Вилла ${n}`, area: 'Площадь', price: 'Цена от', sold: 'Продана',
    reserved: 'Ждёт оплаты', m2: 'м²',
    book: n => `Забронировать виллу ${n}`, similar: 'Подобрать похожую виллу',
    plan: 'Смотреть планировку', studioTitle: 'Студии и пентхаусы',
    studioLead: 'Корпус у входа в комплекс, 4 этажа', floor: f => f === 4 ? 'Пентхаусы, 4 этаж' : `${f} этаж`,
    back: 'Ко всем студиям', close: 'Закрыть',
  },
  en: {
    all: 'All villas', avail: 'Available only', reset: 'Full view',
    st: { early: 'Available', prebooked: 'Reserved', booked: 'Sold' },
    stLegend: { early: 'Available', prebooked: 'Reserved', booked: 'Sold' },
    villa: n => `Villa ${n}`, area: 'Size', price: 'From', sold: 'Sold',
    reserved: 'Awaiting payment', m2: 'm²',
    book: n => `Reserve villa ${n}`, similar: 'Find a similar villa',
    plan: 'View floor plan', studioTitle: 'Studios and penthouses',
    studioLead: 'Building at the entrance, 4 floors', floor: f => f === 4 ? 'Penthouses, 4th floor' : ['', '1st floor', '2nd floor', '3rd floor'][f],
    back: 'All studios', close: 'Close',
  },
};
let lang = (q.get('lang') || localStorage.getItem('bso_lang') || 'ru') === 'en' ? 'en' : 'ru';

/* ---------- данные ---------- */
const STATUS = s => (s === 'presale' ? 'early' : s);
const UNITS = Object.fromEntries(BSO_UNITS.map(u => [u.n, { ...u, st: STATUS(u.st) }]));
const TYPES = [
  { k: 'studio', ru: 'Студии', en: 'Studios', re: /^(STUDIO|PENTHOUSE)/ },
  { k: '1bd', ru: '1BD', en: '1BD', re: /^1BD$/ },
  { k: '1bdsky', ru: '1BD SKY', en: '1BD SKY', re: /^1BD SKY$/ },
  { k: '2bd', ru: '2BD', en: '2BD', re: /^2BD$/ },
  { k: '3bd', ru: '3BD', en: '3BD', re: /^3BD$/ },
  { k: '3bdsky', ru: '3BD SKY', en: '3BD SKY', re: /^3BD SKY$/ },
  { k: '4bd', ru: '4BD', en: '4BD', re: /^4BD/ },
];
const typeKey = t => (TYPES.find(x => x.re.test(t)) || TYPES[0]).k;
const PHOTOS = {
  studio: ['villa-studio-detail1.jpg', 'villa-studio-detail2.jpg', 'villa-studio-detail3.jpg', 'plan-studio.png'],
  '1bd': ['villa-1bd-detail1.jpg', 'villa-1bd-detail2.jpg', 'villa-1bd-detail3.jpg', 'plan-1bd.png'],
  '1bdsky': ['villa-1bdsky-detail1.jpg', 'villa-1bdsky-detail2.jpg', 'villa-1bdsky-detail3.jpg', 'plan-1bdsky-f1.png'],
  '2bd': ['villa-2bd-detail1.jpg', 'villa-2bd-detail2.jpg', 'villa-2bd-detail3.jpg', 'plan-2bd-f1.png'],
  '3bd': ['villa-3bd-detail1.jpg', 'villa-3bd-detail2.jpg', 'villa-3bd-detail3.jpg', 'plan-3bd-f1.png'],
  '3bdsky': ['villa-3bdsky-detail1.jpg', 'villa-3bdsky-detail2.jpg', 'villa-3bdsky-detail3.jpg', 'plan-3bdsky-f1.png'],
  '4bd': ['villa-4bd-detail1.jpg', 'villa-4bd-detail2.jpg', 'villa-4bd-detail3.jpg', 'plan-4bd-f1.png'],
};
const TYPE_NAME = {
  ru: { studio: 'Студия', '1bd': 'Вилла с одной спальней', '1bdsky': 'Вилла 1BD SKY с террасой на крыше', '2bd': 'Вилла с двумя спальнями', '3bd': 'Вилла с тремя спальнями', '3bdsky': 'Вилла 3BD SKY с террасой на крыше', '4bd': 'Вилла с четырьмя спальнями' },
  en: { studio: 'Studio', '1bd': 'One-bedroom villa', '1bdsky': '1BD SKY villa with a roof terrace', '2bd': 'Two-bedroom villa', '3bd': 'Three-bedroom villa', '3bdsky': '3BD SKY villa with a roof terrace', '4bd': 'Four-bedroom villa' },
};
// корпус студий: этажи по мастер-плану
const STUDIO_FLOORS = [
  [1, ['1', '2', '3', '4']],
  [2, ['5', '6', '7', '8', '9', '10', '11', '12']],
  [3, ['13', '14', '15', '16', '17', '18', '19', '20']],
  [4, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']],
];

const fmtPrice = c => '$' + Math.round(c).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US').replace(/,/g, ' ');
const fmtArea = s => String(s).replace('.', lang === 'ru' ? ',' : '.') + ' ' + T[lang].m2;

/* ---------- сцена ---------- */
const canvas = document.getElementById('m3dCanvas');
const wrap = document.getElementById('m3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.localClippingEnabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 1, 3000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 40;
controls.maxDistance = 520;
controls.minPolarAngle = 0.15;
controls.maxPolarAngle = 1.2;
controls.screenSpacePanning = false;

scene.add(new THREE.HemisphereLight('#fffdf8', '#5b5750', 1.5));
const sun = new THREE.DirectionalLight('#fff3df', 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

const MAT = {
  build: maquette('#f3f0ea', { tex: 'paper', highlight: true }),
  ground: maquette('#c4a77c', { tex: 'cork' }),
  path: maquette('#d9d5cc', { tex: 'path' }),
  green: maquette('#9fae7c', { tex: 'grass', roughness: 1 }),
  glass: maquette('#4a5559', { tex: 'glass', roughness: 0.25, metalness: 0.1, highlight: true }),
  water: maquette('#ffffff', { tex: 'water', roughness: 0.3, metalness: 0.05, side: THREE.DoubleSide }),
  soil: maquette('#ffffff', { tex: 'soil', roughness: 1, flatShading: true, side: THREE.DoubleSide }),
  earth: maquette('#ffffff', { tex: 'soil', roughness: 1, flatShading: true, clip: false, side: THREE.DoubleSide }),
};
// роли материалов SketchUp-выгрузки (см. разбор: цвета модели = типы вилл)
const ROLE = {
  Material8: 'green', Material14: 'water', Material28: 'soil',
  Material12: 'path', Material13: 'path', Material10: 'ground', Material27: 'ground', Material11: 'ground',
  Material22: 'glass', Material39: 'hide',
};

let modelRoot, buildMeshes = [], groundMeshes = [];
let units3d, unitList = [], fitDist = 300;
const pinsEl = document.getElementById('m3dPins');

const loader = document.getElementById('m3dLoader');
Promise.all([
  fetch('data/units-3d.json').then(r => r.json()),
  new Promise((res, rej) => new GLTFLoader().load(MODEL, res,
    e => e.total && loader.style.setProperty('--p', (e.loaded / e.total).toFixed(3)), rej)),
]).then(([u3d, gltf]) => {
  units3d = u3d;
  setupModel(gltf.scene);
  setupUnits();
  buildUI();
  resize();
  loader.classList.add('is-done');
  window.__ready = { units: unitList.length };
  window.__m3d = { THREE, camera, controls, unitList, modelRoot };
});

function setupModel(root) {
  modelRoot = root;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.userData.mat = o.material.name;
    const role = ROLE[o.material.name] || 'build';
    if (role === 'hide') { o.visible = false; return; }
    o.material = MAT[role];
    o.castShadow = role === 'build' || role === 'glass';
    o.receiveShadow = true;
    (role === 'build' || role === 'glass' ? buildMeshes : groundMeshes).push(o);
  });
  scene.add(root);
  // тот же центр, что у вида сверху, по которому снимались координаты юнитов
  const box = new THREE.Box3().setFromObject(root);
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  root.position.sub(c); root.position.y += s.y / 2;
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isMesh && o.userData.mat === 'Material28') { const ch = buildEarthChunk(o, MAT.earth, topAt); if (ch) scene.add(ch);
    let water; root.traverse(w => { if (w.userData.mat === 'Material14') water = w; });
    const top = new THREE.Mesh(plinthTop(o, water), MAT.earth); top.receiveShadow = true;
    const polys = ch ? [ch.userData.outline] : [];
    if (water) { const wch = buildEarthChunk(null, MAT.earth, topAt, footprint(water)); if (wch) { scene.add(wch); polys.push(wch.userData.outline); } }
    // у воды оставляем только поверхность: нижняя грань плиты выглядывала из-под среза
    const wTop = water ? new THREE.Box3().setFromObject(water).max.y - 0.5 : -1e9;
    if (polys.length) groundMeshes.forEach(m => { if (m !== o) m.geometry = trimToOutline(m, polys, 1.5, m === water ? wTop : -1e9); });
    o.visible = false; groundMeshes = groundMeshes.filter(m => m !== o); scene.add(top); groundMeshes.push(top); } });
  const R = Math.max(s.x, s.z);
  sun.position.set(-R * 0.45, R * 0.55, -R * 0.2);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -R * 0.62; sc.right = sc.top = R * 0.62; sc.near = 1; sc.far = R * 2.5; sc.updateProjectionMatrix();
  fitDist = R * 1.25;
  addPalms(R);
}

// высота земли у края: лиана начинается там, где кончается газон или дорожка
function topAt(x, z) {
  ray.set(new THREE.Vector3(x, 300, z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObjects(groundMeshes, false)[0];
  return hit ? hit.point.y : 10.5;
}

/* пальмы: инстансы на зелёных полосах, ствол с наклоном + веер листьев */
function addPalms() {
  const greens = groundMeshes.filter(m => m.material === MAT.green);
  const tris = [];
  let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const m of greens) {
    const pos = m.geometry.attributes.position, idx = m.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, ib).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, ic).applyMatrix4(m.matrixWorld);
      const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      const area = nrm.length() / 2;
      if (area < 0.5 || Math.abs(nrm.normalize().y) < 0.7) continue; // только горизонтальные куски
      total += area; tris.push([a.clone(), b.clone(), c.clone(), total]);
    }
  }
  if (!tris.length) return;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pts = [];
  for (let k = 0; k < 4000 && pts.length < 260; k++) {
    const r = rnd() * total;
    const t = tris.find(x => x[3] >= r);
    let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const p = t[0].clone().add(t[1].clone().sub(t[0]).multiplyScalar(u)).add(t[2].clone().sub(t[0]).multiplyScalar(v));
    if (pts.every(o => o.distanceToSquared(p) > 30)) pts.push(p);
  }
  // геометрия одной пальмы
  const trunkG = new THREE.CylinderGeometry(0.16, 0.24, 1, 6, 4, true).translate(0, 0.5, 0);
  const leafG = new THREE.PlaneGeometry(0.9, 3.4, 1, 6).translate(0, 1.7, 0);
  { // лист выгибается вниз дугой
    const p = leafG.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, -0.08 * y * y); p.setX(i, p.getX(i) * (1 - y / 3.6)); }
    leafG.rotateX(-Math.PI / 2 + 0.55); leafG.computeVertexNormals();
  }
  const trunkM = new THREE.MeshStandardMaterial({ color: '#d8d2c6', roughness: 1 });
  const leafM = new THREE.MeshStandardMaterial({ color: '#8f9c74', roughness: 0.95, side: THREE.DoubleSide });
  const LEAVES = 9;
  const trunks = new THREE.InstancedMesh(trunkG, trunkM, pts.length);
  const leaves = new THREE.InstancedMesh(leafG, leafM, pts.length * LEAVES);
  trunks.castShadow = leaves.castShadow = true;
  const mtx = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e = new THREE.Euler();
  pts.forEach((p, i) => {
    const h = 6 + rnd() * 5, lean = (rnd() - 0.5) * 0.25, yaw = rnd() * Math.PI * 2;
    e.set(lean, yaw, lean * 0.6); q4.setFromEuler(e);
    mtx.compose(p, q4, new THREE.Vector3(1, h, 1)); trunks.setMatrixAt(i, mtx);
    const top = new THREE.Vector3(0, h, 0).applyQuaternion(q4).add(p);
    for (let j = 0; j < LEAVES; j++) {
      e.set(-0.15 + rnd() * 0.3, yaw + (j / LEAVES) * Math.PI * 2 + rnd() * 0.3, 0); q4.setFromEuler(e);
      const s = 0.85 + rnd() * 0.3;
      mtx.compose(top, q4, new THREE.Vector3(s, s, s)); leaves.setMatrixAt(i * LEAVES + j, mtx);
    }
  });
  scene.add(trunks, leaves);
}

/* ---------- юниты ---------- */
const ray = new THREE.Raycaster();
function setupUnits() {
  const ang = THREE.MathUtils.degToRad(units3d.angleDeg);
  HL.uAxis.value.set(Math.cos(ang), Math.sin(ang));
  const [mx, mz] = units3d.mPerPlanPx;
  for (const [n, [x, z]] of Object.entries(units3d.units)) {
    const group = n === 'STUDIO';
    const u = group ? null : UNITS[n];
    if (!group && !u) continue;
    // высота метки: верх здания под точкой
    ray.set(new THREE.Vector3(x, 300, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(buildMeshes, false)[0] || ray.intersectObjects(groundMeshes, false)[0];
    const y = (hit ? hit.point.y : 0) + 1.2;
    const k = group ? 'studio' : typeKey(u.t);
    // подсветка по площади виллы: 1BD ~71 м², крупные форматы шире
    const big = group ? 1 : Math.min(1.5, Math.max(1, Math.sqrt(parseFloat(u.s) / 71.3)));
    const half = new THREE.Vector2(36 * mx * big, 28 * mz * big);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'pin' + (group ? ' is-group' : ' is-' + u.st);
    el.addEventListener('click', (ev) => { ev.stopPropagation(); select(item); });
    el.addEventListener('pointerenter', () => hover(item));
    el.addEventListener('pointerleave', () => hover(null));
    pinsEl.appendChild(el);
    const item = { n, group, u, k, pos: new THREE.Vector3(x, y, z), half, el, sx: 0, sy: 0, vis: true };
    unitList.push(item);
  }
}

/* ---------- состояние фильтров ---------- */
let fType = null, fAvail = false, selected = null, hovered = null;
const passes = it => {
  if (it.group) return (!fType || fType === 'studio') && (!fAvail || studioUnits().some(u => u.st === 'early'));
  return (!fType || fType === it.k) && (!fAvail || it.u.st === 'early');
};
const studioUnits = () => STUDIO_FLOORS.flatMap(([, ns]) => ns).map(n => UNITS[n]).filter(Boolean);

function hover(it) {
  hovered = it;
  unitList.forEach(x => x.el.classList.toggle('is-hover', x === it));
  if (it && !it.group) { HL.uHov.value.set(it.pos.x, it.pos.z, 1, 0); HL.uHalfH.value.copy(it.half); }
  else HL.uHov.value.z = 0;
  canvas.style.cursor = it ? 'pointer' : '';
}
function select(it, opts = {}) {
  selected = it;
  unitList.forEach(x => x.el.classList.toggle('is-sel', x === it));
  if (it && !it.group) { HL.uSel.value.set(it.pos.x, it.pos.z, 1, 0); HL.uHalf.value.copy(it.half); }
  else HL.uSel.value.z = 0;
  if (it) { openCard(it, opts.unit); flyTo(it.pos); } else closeCard();
}

/* ---------- камера ---------- */
const POL = 0.9;
let fly = null, homePose = null;
/* общий вид: перебираем азимут и берём тот, при котором комплекс крупнее всего
   влезает в кадр с полями под панели (на телефоне длинная ось сама встаёт вертикально) */
function fitHome() {
  const pts = unitList.map(it => it.pos.clone());
  const box = new THREE.Box3().setFromObject(modelRoot);
  for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, groundY(), z));
  const ctr = box.getCenter(new THREE.Vector3()); ctr.y = groundY();
  // реальный контур участка точнее углов габарита: точки юнитов + края, ужатые к центру
  const fitPts = pts.map(p => p.clone().lerp(ctr, 0.12));
  const cam = camera.clone();
  // на телефоне участок шире экрана при любом повороте: даём краям чуть уйти, иначе комплекс мелкий
  const mx = innerWidth < 761 ? 1 : 0.84, my = innerWidth < 761 ? 0.62 : 0.74;
  let best = null;
  const azFix = q.get('az');
  for (let a = 0; a < 360; a += 5) {
    if (azFix !== null && a !== Math.round(+azFix / 5) * 5) continue;
    const az = THREE.MathUtils.degToRad(a);
    const dir = new THREE.Vector3().setFromSphericalCoords(1, POL, az);
    let d = 800;
    for (let i = 0; i < 5; i++) {
      cam.position.copy(ctr).addScaledVector(dir, d); cam.lookAt(ctr); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      let m = 0;
      for (const p of fitPts) { const v2 = p.clone().project(cam); m = Math.max(m, Math.abs(v2.x) / mx, Math.abs(v2.y) / my); }
      d *= m;
    }
    if (!best || d < best.d) best = { d, az };
  }
  // участок несимметричный: двигаем точку взгляда по земле, пока проекция не встанет по центру
  const off = new THREE.Vector3().setFromSphericalCoords(best.d, POL, best.az);
  const fwd = new THREE.Vector3(-off.x, 0, -off.z).normalize(), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  for (let i = 0; i < 4; i++) {
    cam.position.copy(ctr).add(off); cam.lookAt(ctr); cam.updateMatrixWorld();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of fitPts) { const v2 = p.clone().project(cam); x0 = Math.min(x0, v2.x); x1 = Math.max(x1, v2.x); y0 = Math.min(y0, v2.y); y1 = Math.max(y1, v2.y); }
    const hw = best.d * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    ctr.addScaledVector(right, (x0 + x1) / 2 * hw * cam.aspect).addScaledVector(fwd, (y0 + y1) / 2 * hw / Math.cos(POL));
  }
  homePose = { t: ctr, p: ctr.clone().add(off) };
  controls.maxDistance = best.d * 1.6;
}
function homeView(instant) {
  fitHome();
  animateTo(homePose.p, homePose.t, instant);
}
function flyTo(target) {
  const off = camera.position.clone().sub(controls.target);
  const d = Math.min(off.length(), innerWidth < 761 ? 210 : 200);
  const t = target.clone(); t.y = Math.max(groundY(), target.y - 6);
  animateTo(t.clone().add(off.setLength(d)), t);
}
// уровень земли: самая низкая метка стоит на земле +1.2
let gY = null;
const groundY = () => gY ?? (gY = Math.min(...unitList.map(u => u.pos.y)) - 1.2);
/* карточка закрывает часть экрана: сдвигаем центр проекции в свободную часть */
let shift = { x: 0, y: 0 }, shiftTo = { x: 0, y: 0 };
function updateShift() {
  const w = wrap.clientWidth, h = wrap.clientHeight, open = card.classList.contains('is-open');
  shiftTo = !open ? { x: 0, y: 0 } : w < 761 ? { x: 0, y: (card.offsetHeight - topBar.getBoundingClientRect().bottom) / 2 } : { x: (card.offsetWidth + 16) / 2, y: 0 };
}
function applyShift() {
  shift.x += (shiftTo.x - shift.x) * 0.12; shift.y += (shiftTo.y - shift.y) * 0.12;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (Math.abs(shift.x) < 0.5 && Math.abs(shift.y) < 0.5 && !shiftTo.x && !shiftTo.y) { if (camera.view) camera.clearViewOffset(); return; }
  camera.setViewOffset(w, h, shift.x, shift.y, w, h);
}
function animateTo(p, t, instant) {
  if (instant) { camera.position.copy(p); controls.target.copy(t); controls.update(); return; }
  fly = { p0: camera.position.clone(), t0: controls.target.clone(), p, t, s: performance.now() };
}
controls.addEventListener('start', () => { fly = null; });

/* ---------- клики по самой модели ---------- */
const ndc = new THREE.Vector2();
let downXY = null;
canvas.addEventListener('pointerdown', e => { downXY = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 6) return;
  const it = pick(e);
  select(it || null);
});
canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && !e.buttons) hover(pick(e)); });
function pick(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(buildMeshes, false)[0];
  if (!hit) return null;
  const ax = HL.uAxis.value;
  let best = null, bd = 1e9;
  for (const it of unitList) {
    if (!it.vis) continue;
    const dx = hit.point.x - it.pos.x, dz = hit.point.z - it.pos.z;
    const lx = Math.abs(dx * ax.x + dz * ax.y), lz = Math.abs(-dx * ax.y + dz * ax.x);
    const lim = it.group ? 16 : 1;
    if (it.group ? Math.hypot(dx, dz) < lim : (lx < it.half.x && lz < it.half.y)) {
      const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = it; }
    }
  }
  return best;
}

/* ---------- метки: проекция + разводка, чтобы не налезали ---------- */
const v = new THREE.Vector3();
const topBar = document.querySelector('.m3d-top');
function layoutPins() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const placed = [];
  const topH = topBar.getBoundingClientRect().bottom;
  const order = unitList.slice().sort((a, b) => prio(b) - prio(a));
  for (const it of order) {
    it.vis = passes(it);
    v.copy(it.pos).project(camera);
    const on = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
    it.sx = (v.x * 0.5 + 0.5) * w; it.sy = (-v.y * 0.5 + 0.5) * h;
    const el = it.el;
    const pw = it.group ? 150 : 52, ph = 30;
    // широкую метку у края не режем, точку не двигаем
    if (it.group) it.sx = Math.min(Math.max(it.sx, pw / 2 + 8), w - pw / 2 - 8);
    // под верхней панелью метки не показываем: просвечивают и мешают нажать чипы
    if (!on || (it !== selected && it.sy - 30 < topH)) { el.classList.add('is-hidden'); continue; }
    el.classList.remove('is-hidden');
    el.classList.toggle('is-off', !it.vis);
    const box = [it.sx - pw / 2, it.sy - ph, it.sx + pw / 2, it.sy];
    const free = it.vis && (it === selected || placed.every(b => box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]));
    el.classList.toggle('is-dot', !free);
    if (free) placed.push(box);
    el.style.transform = `translate(${it.sx}px, ${it.sy}px) translate(-50%, -100%)`;
    el.style.zIndex = it === selected ? 1000 : free ? 500 + Math.round(v.z * -100) : 10;
  }
}
const prio = it => (it === selected ? 100 : 0) + (it.group ? 6 : 0) + (it.u && it.u.st === 'early' ? 3 : it.u && it.u.st === 'prebooked' ? 1 : 0) - (it.vis ? 0 : 50);

/* ---------- карточка ---------- */
const card = document.getElementById('m3dCard');
const body = document.getElementById('m3dCardBody');
document.getElementById('m3dClose').addEventListener('click', () => select(null));
addEventListener('keydown', e => { if (e.key === 'Escape') select(null); });

function photosHTML(k) {
  const list = PHOTOS[k] || [];
  return `<div class="c-photos">${list.map(f => `<img src="${SITE}assets/${f}" alt="" loading="lazy"${f.startsWith('plan-') ? ' class="is-plan"' : ''}>`).join('')}</div>
    <div class="c-dots">${list.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>`;
}
function unitHTML(u, k, back) {
  const t = T[lang];
  const price = u.st === 'booked' ? t.sold : fmtPrice(u.c);
  // бронь и продажа: забронировать нельзя, предлагаем похожую
  const cta = u.st !== 'early'
    ? `<a class="btn btn-gold" href="https://blacksandsoasis.com/#contacts" target="_blank" rel="noopener" data-lead>${t.similar}</a>`
    : `<a class="btn btn-gold" href="https://blacksandsoasis.com/#contacts" target="_blank" rel="noopener" data-lead>${t.book(u.n)}</a>`;
  const name = /^P\d/.test(u.n) ? (lang === 'ru' ? `Пентхаус ${u.n}` : `Penthouse ${u.n}`) : k === 'studio' ? (lang === 'ru' ? `Студия ${u.n}` : `Studio ${u.n}`) : t.villa(u.n);
  return `${photosHTML(k)}
  <div class="c-main">
    ${back ? `<button class="c-back" type="button" data-back>${arrow()}${t.back}</button>` : ''}
    <div class="c-head"><h3 class="c-title">${name}</h3><span class="c-status is-${u.st}">${t.st[u.st]}</span></div>
    <p class="c-type">${prettyType(u.t, k)}</p>
    <dl class="c-facts">
      <div><dt>${t.area}</dt><dd>${fmtArea(u.s)}</dd></div>
      <div><dt>${u.st === 'booked' ? ' ' : t.price}</dt><dd>${price}</dd></div>
    </dl>
    <div class="c-actions">${cta}<a class="btn btn-ghost" href="${SITE}assets/${PHOTOS[k][3]}" target="_blank" rel="noopener">${t.plan}</a></div>
  </div>`;
}
function prettyType(t, k) {
  // «STUDIO PALMS+OCEAN» → «Студия, вид на пальмы и океан»
  const views = {
    ru: { 'GARDEN': 'вид на сад', 'OCEAN': 'вид на океан', 'PALMS+OCEAN': 'вид на пальмы и океан', 'VOLCANO VIEW': 'вид на вулкан', 'OCEAN VIEW': 'вид на океан', 'RIVER': 'у реки' },
    en: { 'GARDEN': 'garden view', 'OCEAN': 'ocean view', 'PALMS+OCEAN': 'palm and ocean view', 'VOLCANO VIEW': 'volcano view', 'OCEAN VIEW': 'ocean view', 'RIVER': 'by the river' },
  }[lang];
  const m = t.match(/^(STUDIO|PENTHOUSE|4BD)\s+(.+)$/);
  if (m && views[m[2]]) {
    const base = m[1] === 'PENTHOUSE' ? (lang === 'ru' ? 'Пентхаус' : 'Penthouse') : TYPE_NAME[lang][k];
    return `${base}, ${views[m[2]]}`;
  }
  if (/^4BD SKY/.test(t)) return lang === 'ru' ? 'Вилла с четырьмя спальнями и террасой на крыше' : 'Four-bedroom villa with a roof terrace';
  return TYPE_NAME[lang][k];
}
const arrow = () => '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 3 5 8l5 5"/></svg>';

function studioHTML() {
  const t = T[lang];
  return `${photosHTML('studio')}
  <div class="c-main">
    <div class="c-head"><h3 class="c-title">${t.studioTitle}</h3></div>
    <p class="c-type">${t.studioLead}</p>
    <ul class="c-list">${STUDIO_FLOORS.map(([f, ns]) => `<li><h4>${t.floor(f)}</h4>${ns.map(n => UNITS[n]).filter(Boolean).map(u =>
      `<button type="button" data-unit="${u.n}" class="is-${u.st}"><span class="n">${u.n}</span><span class="p">${u.st === 'booked' ? t.st.booked : t.st[u.st] + ', ' + fmtPrice(u.c)}</span></button>`).join('')}</li>`).join('')}</ul>
  </div>`;
}
let cardState = null;
function openCard(it, unitN) {
  cardState = { it, unitN };
  if (it.group && !unitN) body.innerHTML = studioHTML();
  else { const u = it.group ? UNITS[unitN] : it.u; body.innerHTML = unitHTML(u, it.group ? 'studio' : it.k, it.group); }
  body.scrollTop = 0;
  const ph = body.querySelector('.c-photos'), dots = body.querySelectorAll('.c-dots i');
  ph && ph.addEventListener('scroll', () => { const i = Math.round(ph.scrollLeft / ph.clientWidth); dots.forEach((d, j) => d.classList.toggle('on', i === j)); }, { passive: true });
  body.querySelectorAll('[data-unit]').forEach(b => b.addEventListener('click', () => openCard(it, b.dataset.unit)));
  const bk = body.querySelector('[data-back]'); bk && bk.addEventListener('click', () => openCard(it));
  card.classList.add('is-open'); card.setAttribute('aria-hidden', 'false');
  updateShift();
}
function closeCard() { cardState = null; card.classList.remove('is-open'); card.setAttribute('aria-hidden', 'true'); updateShift(); }

/* ---------- панели ---------- */
function buildUI() {
  const t = T[lang];
  const types = document.getElementById('m3dTypes');
  types.innerHTML = [`<button class="m3d-chip" type="button" data-t="" aria-pressed="${!fType}">${t.all}</button>`]
    .concat(TYPES.map(x => `<button class="m3d-chip" type="button" data-t="${x.k}" aria-pressed="${fType === x.k}">${x[lang]}</button>`)).join('');
  types.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { fType = b.dataset.t || null; buildUI(); }));
  const av = document.getElementById('m3dAvail');
  av.textContent = t.avail; av.setAttribute('aria-pressed', fAvail);
  av.onclick = () => { fAvail = !fAvail; buildUI(); };
  const counts = { early: 0, prebooked: 0, booked: 0 };
  Object.values(UNITS).forEach(u => counts[u.st] !== undefined && counts[u.st]++);
  const col = { early: 'var(--ok)', prebooked: 'var(--clay)', booked: 'var(--sold)' };
  document.getElementById('m3dLegend').innerHTML = Object.keys(counts).map(k => `<span><i style="background:${col[k]}"></i>${t.stLegend[k]} ${counts[k]}</span>`).join('');
  const rs = document.getElementById('m3dReset');
  rs.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v3h3"/></svg><span>${t.reset}</span>`;
  rs.setAttribute('aria-label', t.reset);
  rs.onclick = () => { select(null); homeView(); };
  document.getElementById('m3dClose').innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m3 3 10 10M13 3 3 13"/></svg>';
  document.getElementById('m3dClose').setAttribute('aria-label', t.close);
  document.querySelectorAll('[data-lang]').forEach(b => { b.setAttribute('aria-pressed', b.dataset.lang === lang); b.onclick = () => { lang = b.dataset.lang; try { localStorage.setItem('bso_lang', lang); } catch (e) {} buildUI(); } });
  document.documentElement.lang = lang;
  unitList.forEach(it => { it.el.textContent = it.group ? t.studioTitle : it.n; it.el.setAttribute('aria-label', it.group ? t.studioTitle : `${t.villa(it.n)}, ${t.st[it.u.st]}`); });
  if (cardState) openCard(cardState.it, cardState.unitN);
  if (selected && !passes(selected)) select(null);
}

/* ---------- цикл ---------- */
function resize() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  updateShift();
  if (!window.__homed) { window.__homed = true; homeView(true); }
}
addEventListener('resize', resize);
const ease = x => 1 - Math.pow(1 - x, 3);
renderer.setAnimationLoop((now) => {
  if (fly) {
    const k = Math.min(1, (now - fly.s) / 900), e = ease(k);
    camera.position.lerpVectors(fly.p0, fly.p, e); controls.target.lerpVectors(fly.t0, fly.t, e);
    if (k === 1) fly = null;
  }
  controls.update();
  applyShift();
  renderer.render(scene, camera);
  if (unitList.length) layoutPins();
});
