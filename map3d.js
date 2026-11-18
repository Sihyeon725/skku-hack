/* ======================================================================
   성대 hack — 3D 캠퍼스 보기
   지형: NASA SRTM 1″(30m) · 건물 외곽선·길·잔디·숲: © OpenStreetMap contributors
   건물 높이는 앱 데이터의 층수(없으면 OSM 층수·건물 종류)로 계산한 대략값이고,
   외관 색·창문 모양은 실제 사진이 아니라 분위기만 맞춘 거예요.
   좌표: x=동쪽(m), z=남쪽(m), y=해발고도-YO(m)
   ====================================================================== */
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';

const YO = 30;
const T_START = performance.now();
const $q = (s, r = document) => r.querySelector(s);
const wrap = $q('#mapwrap');
const api = window.M3D = { on: false, ready: false };
const btn = $q('#z3d');

/* ---------- WebGL 확인 ---------- */
function glOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (_) { return false; }
}
if (!glOK()) { wrap.classList.remove('is3d'); if (btn) btn.remove(); $q('#m3d') && $q('#m3d').remove(); throw new Error('no webgl'); }

/* ---------- DOM ---------- */
const host = $q('#m3d') || Object.assign(document.createElement('div'), { id: 'm3d' });
const canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', '3D 캠퍼스 지도. 한 손가락으로 이동, 두 손가락으로 확대·회전');
const layer = document.createElement('div'); layer.className = 'l3layer';
const legend = document.createElement('div'); legend.className = 'legend3'; legend.setAttribute('aria-hidden', 'true');
legend.innerHTML = '<span><i style="background:#A3A7A8"></i>차도</span><span><i style="background:#F1EAD8;box-shadow:inset 0 0 0 1px #D2C7AE"></i>보도</span><span><i style="background:#9FCB7E"></i>잔디</span><span><i class="st"></i>계단</span><span class="osm">© OSM</span>';
const loading = $q('.load3', host);
host.append(canvas, layer, legend);
if (!host.parentNode) wrap.prepend(host);
const fail = e => { wrap.classList.remove('is3d'); if (btn) btn.remove(); host.remove(); throw e; };

/* ---------- 데이터 ---------- */
let D;
try { D = await (await fetch('campus3d.json')).json(); }
catch (e) { fail(e); }
const [LAT0, LNG0] = D.origin, [MLAT, MLNG] = D.m;
const T = D.ter, NX = T.nx, NZ = T.nz, STEP = T.step, X0 = T.x0, Z0 = T.z0;
const X1 = X0 + (NX - 1) * STEP, Z1 = Z0 + (NZ - 1) * STEP;
const HV = (() => { const b = atob(T.h), a = new Float32Array(NX * NZ);
  for (let i = 0; i < a.length; i++) { let v = b.charCodeAt(2 * i) | (b.charCodeAt(2 * i + 1) << 8); if (v > 32767) v -= 65536; a[i] = v / 10 - YO; }
  return a; })();
const llXZ = ([lat, lng]) => [(lng - LNG0) * MLNG, (LAT0 - lat) * MLAT];
const xzLL = (x, z) => [+(LAT0 - z / MLAT).toFixed(6), +(LNG0 + x / MLNG).toFixed(6)];
function gH(x, z) {
  const fx = Math.min(Math.max((x - X0) / STEP, 0), NX - 1.001), fz = Math.min(Math.max((z - Z0) / STEP, 0), NZ - 1.001);
  const j = Math.floor(fx), i = Math.floor(fz), u = fx - j, v = fz - i, k = i * NX + j;
  return HV[k] * (1 - u) * (1 - v) + HV[k + 1] * u * (1 - v) + HV[k + NX] * (1 - u) * v + HV[k + NX + 1] * u * v;
}
const isMobile = matchMedia('(pointer:coarse)').matches || Math.min(screen.width, screen.height) < 700;

/* ---------- 렌더러·장면 ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isMobile ? 2 : 2));
renderer.setClearColor(0x000000, 0);
const MAXANI = renderer.capabilities.getMaxAnisotropy();
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xD9E4E8, 1300, 3400);
const camera = new THREE.PerspectiveCamera(42, 1, 3, 9000);
scene.add(new THREE.HemisphereLight(0xF4F8FF, 0x9A8C72, 1.55));
const sun = new THREE.DirectionalLight(0xFFF4E2, 2.1); sun.position.set(-420, 700, 260); scene.add(sun);
const fill = new THREE.DirectionalLight(0xDCE8F5, 0.45); fill.position.set(380, 260, -320); scene.add(fill);

/* ---------- 땅 텍스처(위에서 본 지도 그림) ---------- */
const AREA_COL = { campus: '#E1D8C6', wood: '#3C7443', shrub: '#5F9150', grass: '#A8CF86', field: '#8FC06F', pitch: '#7DB463', sand: '#E6D6AE', water: '#9CC6DA', parking: '#CDC9C0', plaza: '#ECE5D4' };
function ringPath(ctx, ring) { ctx.moveTo(ring[0][0], ring[0][1]); for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]); ctx.closePath(); }
function paintGround(size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const sx = size / (X1 - X0), sz = size / (Z1 - Z0);
  g.fillStyle = '#D9CEB8'; g.fillRect(0, 0, size, size);
  g.setTransform(sx, 0, 0, sz, -X0 * sx, -Z0 * sz);
  // 면
  for (const a of D.a) {
    g.beginPath(); ringPath(g, a.o); (a.hl || []).forEach(h => ringPath(g, h));
    g.fillStyle = AREA_COL[a.c] || '#D9CEB8'; g.fill('evenodd');
    if (a.c === 'wood' || a.c === 'shrub') {          // 숲 결 (어두운 점)
      g.save(); g.clip('evenodd'); const xs = a.o.map(p => p[0]), zs = a.o.map(p => p[1]);
      const mnx = Math.min(...xs), mxx = Math.max(...xs), mnz = Math.min(...zs), mxz = Math.max(...zs);
      const n = Math.min(4000, ((mxx - mnx) * (mxz - mnz)) / 30 | 0); let s = 1234 + n;
      const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < n; i++) { g.fillStyle = r() < .5 ? 'rgba(20,55,28,.22)' : 'rgba(120,170,100,.16)';
        g.beginPath(); g.arc(mnx + r() * (mxx - mnx), mnz + r() * (mxz - mnz), 1.5 + r() * 3.5, 0, 6.283); g.fill(); }
      g.restore();
    }
    if (a.c === 'field' || a.c === 'pitch') { g.save(); g.beginPath(); ringPath(g, a.o); g.clip();
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 0.5; g.beginPath(); ringPath(g, a.o); g.stroke(); g.restore(); }
  }
  // 건물 밑 그림자(접지감)
  g.save(); g.fillStyle = 'rgba(70,62,50,.30)'; g.shadowColor = 'rgba(60,50,40,.35)'; g.shadowBlur = 10 * sx; g.shadowOffsetX = 1.5 * sx; g.shadowOffsetY = -1.5 * sz;
  for (const b of D.b) { g.beginPath(); ringPath(g, b.o); g.fill(); }
  g.restore();
  // 길
  g.lineJoin = 'round'; g.lineCap = 'round';
  const line = (p) => { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); };
  const R = D.r;
  for (const r of R) if (r.c === 'walk') { g.strokeStyle = '#D6CBB2'; g.lineWidth = r.w + 0.9; line(r.p); g.stroke(); }
  for (const r of R) if (r.c === 'walk') { g.strokeStyle = '#F1EAD8'; g.lineWidth = r.w; line(r.p); g.stroke(); }
  for (const r of R) if (r.c === 'path') { g.strokeStyle = 'rgba(242,234,212,.92)'; g.lineWidth = r.w; line(r.p); g.stroke(); }
  for (const r of R) if (r.c === 'car') { g.strokeStyle = '#EDE6D3'; g.lineWidth = r.w + (r.w > 5 ? 3.2 : 1.6); line(r.p); g.stroke(); }
  for (const r of R) if (r.c === 'car') { g.strokeStyle = '#A3A7A8'; g.lineWidth = r.w; line(r.p); g.stroke(); }
  for (const r of R) if (r.c === 'steps') { g.strokeStyle = '#ECE5D2'; g.lineWidth = r.w; line(r.p); g.stroke(); }
  g.lineCap = 'butt'; g.setLineDash([0.45, 0.45]);
  for (const r of R) if (r.c === 'steps') { g.strokeStyle = '#9E9A91'; g.lineWidth = r.w * 0.86; line(r.p); g.stroke(); }
  g.setLineDash([]);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = MAXANI; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/* ---------- 지형 ---------- */
function buildTerrain() {
  const n = NX * NZ, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < NZ; i++) for (let j = 0; j < NX; j++) {
    const k = i * NX + j; pos[3 * k] = X0 + j * STEP; pos[3 * k + 1] = HV[k]; pos[3 * k + 2] = Z0 + i * STEP;
    uv[2 * k] = j / (NX - 1); uv[2 * k + 1] = 1 - i / (NZ - 1);
  }
  const idx = new Uint32Array((NX - 1) * (NZ - 1) * 6); let t = 0;
  for (let i = 0; i < NZ - 1; i++) for (let j = 0; j < NX - 1; j++) {
    const a = i * NX + j, b = a + 1, c = a + NX, d = c + 1;
    idx[t++] = a; idx[t++] = c; idx[t++] = b; idx[t++] = b; idx[t++] = c; idx[t++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals();
  const size = (renderer.capabilities.maxTextureSize >= 4096 && !isMobile) ? 4096 : 2048;
  const mat = new THREE.MeshLambertMaterial({ map: paintGround(size) });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'terrain'; scene.add(mesh);
  // 둘레 단면(디오라마처럼 잘린 땅)
  let mn = Infinity; for (const v of HV) mn = Math.min(mn, v); const bot = mn - 22;
  const sp = [], sn = [];
  const edge = (pts, nx, nz) => { for (let k = 0; k < pts.length - 1; k++) { const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
    const ay = gH(ax, az), by = gH(bx, bz);
    sp.push(ax, ay, az, ax, bot, az, bx, by, bz, bx, by, bz, ax, bot, az, bx, bot, bz); for (let q = 0; q < 6; q++) sn.push(nx, 0, nz); } };
  const xs = [], zs = []; for (let j = 0; j < NX; j++) xs.push(X0 + j * STEP); for (let i = 0; i < NZ; i++) zs.push(Z0 + i * STEP);
  edge(xs.map(x => [x, Z1]), 0, 1); edge(xs.map(x => [x, Z0]).reverse(), 0, -1);
  edge(zs.map(z => [X0, z]), -1, 0); edge(zs.map(z => [X1, z]).reverse(), 1, 0);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('normal', new THREE.Float32BufferAttribute(sn, 3));
  scene.add(new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ color: 0xC9B794, side: THREE.DoubleSide })));
  return mesh;
}

/* ---------- 외벽 텍스처 (1칸 = 창 1개 × 1개 층) ---------- */
const STY = {
  grid:  { bay: 3.6, fl: 3.9, draw(g, s) { g.fillStyle = '#ECEDE9'; g.fillRect(0, 0, s, s); g.fillStyle = '#D9DCD8'; g.fillRect(0, 0, s, s * .14);
           const gr = g.createLinearGradient(0, s * .26, 0, s * .82); gr.addColorStop(0, '#6E8798'); gr.addColorStop(1, '#9EB4C2'); g.fillStyle = gr; g.fillRect(s * .14, s * .26, s * .72, s * .56);
           g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(s * .495, s * .26, s * .03, s * .56); } },
  tall:  { bay: 3.2, fl: 3.9, draw(g, s) { g.fillStyle = '#EEEFEC'; g.fillRect(0, 0, s, s);
           const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#2F3D49'); gr.addColorStop(1, '#4C5E6B'); g.fillStyle = gr; g.fillRect(s * .2, 0, s * .6, s);
           g.fillStyle = '#B9C0C2'; g.fillRect(s * .2, s * .9, s * .6, s * .1); } },
  glass: { bay: 2.0, fl: 3.9, draw(g, s) { const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#4F7F8A'); gr.addColorStop(1, '#78A3AB'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
           g.fillStyle = '#C9D4D3'; g.fillRect(0, 0, s, s * .07); g.fillRect(0, 0, s * .05, s); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(s * .1, s * .1, s * .25, s * .85); } },
  dark:  { bay: 3.0, fl: 3.9, draw(g, s) { g.fillStyle = '#3B3532'; g.fillRect(0, 0, s, s); g.fillStyle = '#1F2427'; g.fillRect(s * .08, s * .18, s * .84, s * .66);
           g.fillStyle = '#6B605A'; for (let k = 0; k < 4; k++) g.fillRect(0, s * (.22 + k * .17), s, s * .05); } },
  warm:  { bay: 3.4, fl: 3.0, draw(g, s) { g.fillStyle = '#E8DED0'; g.fillRect(0, 0, s, s); g.fillStyle = '#7F93A0'; g.fillRect(s * .22, s * .3, s * .56, s * .45); g.fillStyle = '#CDBFAE'; g.fillRect(0, s * .9, s, s * .1); } },
  plain: { bay: 4.0, fl: 3.1, draw(g, s) { g.fillStyle = '#E3E1DB'; g.fillRect(0, 0, s, s); g.fillStyle = '#8796A0'; g.fillRect(s * .28, s * .32, s * .44, s * .4); } },
  house: { bay: 5.0, fl: 3.0, draw(g, s) { g.fillStyle = '#EBE3D6'; g.fillRect(0, 0, s, s); g.fillStyle = '#8F9DA4'; g.fillRect(s * .32, s * .34, s * .36, s * .36); g.fillStyle = '#D8CCBB'; g.fillRect(0, s * .92, s, s * .08); } },
  hanok: { bay: 2.4, fl: 3.4, draw(g, s) { g.fillStyle = '#7B5B45'; g.fillRect(0, 0, s, s); g.fillStyle = '#D9CDB4'; g.fillRect(s * .12, s * .3, s * .76, s * .6);
           g.strokeStyle = '#7B5B45'; g.lineWidth = s * .03; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(s * (.12 + k * .19), s * .3); g.lineTo(s * (.12 + k * .19), s * .9); g.stroke(); } } },
  accent:{ bay: 3.0, fl: 3.9, draw(g, s) { g.fillStyle = '#A84A33'; g.fillRect(0, 0, s, s); g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, s * .06, s); } },
};
function styleTex(k) {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s; STY[k].draw(c.getContext('2d'), s);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAXANI; return t;
}

/* ---------- 건물 ---------- */
function signedArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function inPoly(x, z, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j];
  if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c; } return c; }
function centroid(r) { let a = 0, cx = 0, cz = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length], f = p[0] * q[1] - q[0] * p[1]; a += f; cx += (p[0] + q[0]) * f; cz += (p[1] + q[1]) * f; }
  if (Math.abs(a) < 1e-6) return [r[0][0], r[0][1]]; return [cx / (3 * a), cz / (3 * a)]; }
class Acc { constructor(tex) { this.p = []; this.n = []; this.u = []; this.c = []; this.own = []; this.tex = tex; }
  tri(a, b, c, n, ua, ub, uc, col, o) { this.p.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) { this.n.push(...n); this.c.push(col.r, col.g, col.b); }
    if (ua) this.u.push(...ua, ...ub, ...uc); else this.u.push(0, 0, 0, 0, 0, 0); this.own.push(o); }
  mesh(mat) { if (!this.p.length) return null; const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    const m = new THREE.Mesh(g, mat); m.userData.own = Int32Array.from(this.own); return m; } }
function walls(acc, ring, y0, y1, st, col, o, accentAcc) {
  const S = STY[st]; let longest = -1, li = -1;
  if (accentAcc) for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L > longest) { longest = L; li = i; } }
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz);
    if (L < 0.25) continue;
    const segs = (i === li) ? [[0, .62, acc], [.62, .86, accentAcc], [.86, 1, acc]] : [[0, 1, acc]];
    for (const [f0, f1, A] of segs) {
      const ax = p[0] + dx * f0, az = p[1] + dz * f0, bx = p[0] + dx * f1, bz = p[1] + dz * f1, l = L * (f1 - f0), SS = STY[A === acc ? st : 'accent'];
      const nb = l < SS.bay * .55 ? 0 : Math.max(1, Math.round(l / SS.bay));
      const u0 = nb ? 0 : .04, u1 = nb ? nb : .06, vb = (y0 - y1) / SS.fl, n = [-dz / L, 0, dx / L];
      const A3 = [ax, y0, az], B3 = [bx, y0, bz], C3 = [bx, y1, bz], D3 = [ax, y1, az];
      A.tri(A3, B3, C3, n, [u0, vb], [u1, vb], [u1, 0], col, o); A.tri(A3, C3, D3, n, [u0, vb], [u1, 0], [u0, 0], col, o);
    }
  }
}
function cap(acc, outer, holes, y, col, o) {
  const tri = THREE.ShapeUtils.triangulateShape(outer.map(p => new THREE.Vector2(p[0], p[1])), holes.map(h => h.map(p => new THREE.Vector2(p[0], p[1]))));
  const all = outer.concat(...holes);
  for (const [i, j, k] of tri) { let a = all[i], b = all[j], c = all[k];
    if ((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) < 0) [b, c] = [c, b];
    acc.tri([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [0, 1, 0], null, null, null, col, o); }
}
function box(acc, cx, cz, w, d, y0, h, col, o, rot = 0) {
  const cs = Math.cos(rot), sn = Math.sin(rot), pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => [cx + a * cs - b * sn, cz + a * sn + b * cs]);
  const r = signedArea(pts) > 0 ? pts.reverse() : pts;
  for (let i = 0; i < 4; i++) { const p = r[i], q = r[(i + 1) % 4], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz), n = [-dz / L, 0, dx / L];
    acc.tri([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y0 + h, q[1]], n, null, null, null, col, o); acc.tri([p[0], y0, p[1]], [q[0], y0 + h, q[1]], [p[0], y0 + h, p[1]], n, null, null, null, col, o); }
  cap(acc, r, [], y0 + h, col, o);
}
function hipRoof(acc, ring, y, col, o) {   // 한옥 지붕: 바깥으로 내민 처마 → 가운데로 모이는 경사면
  const [cx, cz] = centroid(ring); let rad = 0; for (const p of ring) rad += Math.hypot(p[0] - cx, p[1] - cz); rad /= ring.length;
  const out = 1 + 1.3 / Math.max(rad, 2), inn = 0.42, rise = Math.min(4.2, Math.max(1.6, rad * 0.45));
  const lo = ring.map(p => [cx + (p[0] - cx) * out, cz + (p[1] - cz) * out]), hi = ring.map(p => [cx + (p[0] - cx) * inn, cz + (p[1] - cz) * inn]);
  const y0 = y - 0.4, y1 = y + rise;
  for (let i = 0; i < ring.length; i++) { const j = (i + 1) % ring.length; const a = [lo[i][0], y0, lo[i][1]], b = [lo[j][0], y0, lo[j][1]], c = [hi[j][0], y1, hi[j][1]], d = [hi[i][0], y1, hi[i][1]];
    const n = new THREE.Vector3().crossVectors(new THREE.Vector3(...b).sub(new THREE.Vector3(...a)), new THREE.Vector3(...c).sub(new THREE.Vector3(...a))).normalize();
    const mx = (a[0] + b[0]) / 2 - cx, mz = (a[2] + b[2]) / 2 - cz; const flip = n.x * mx + n.z * mz < 0; const N = flip ? [-n.x, -n.y, -n.z] : [n.x, n.y, n.z];
    if (flip) { acc.tri(a, c, b, N, null, null, null, col, o); acc.tri(a, d, c, N, null, null, null, col, o); } else { acc.tri(a, b, c, N, null, null, null, col, o); acc.tri(a, c, d, N, null, null, null, col, o); } }
  cap(acc, hi, [], y1, col, o);
}
let seed = 99; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const TEX = {}; for (const k in STY) TEX[k] = styleTex(k);
const ACC = {}; for (const k in STY) ACC[k] = new Acc(TEX[k]);
const roofAcc = new Acc(null), detAcc = new Acc(null);
const BINFO = [];      // 건물별 정보(선택·라벨용)
const APPB = {};       // 앱 건물 id → BINFO 인덱스
const white = new THREE.Color(1, 1, 1);
D.b.forEach((b, o) => {
  let outer = b.o.slice(); if (signedArea(outer) > 0) outer.reverse();
  const holes = (b.hl || []).map(h => { const r = h.slice(); if (signedArea(r) < 0) r.reverse(); return r; });
  const st = STY[b.s] ? b.s : 'plain';
  const tint = b.id ? 1 : 0.93 + rnd() * 0.1, wc = new THREE.Color(tint, tint, tint * (0.99 + rnd() * .02));
  const bh = b.h - YO;   // 땅과 같은 기준(해발−30m)으로 맞춤
  // 바닥: 외곽선을 3m 간격으로 따라가며 가장 낮은 땅보다 1m 더 내려서, 경사지 어느 쪽에도 틈이 안 생기게
  let gmin = b.b - YO + 1.5;
  for (const R of [outer, ...holes]) for (let i = 0; i < R.length; i++) { const p = R[i], q = R[(i + 1) % R.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.ceil(L / 3));
    for (let k = 0; k <= n; k++) gmin = Math.min(gmin, gH(p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n)); }
  const bb = gmin - 1.2;
  const roofTop = st === 'hanok' ? bh - 2.2 : bh;
  walls(ACC[st], outer, bb, roofTop, st, wc, o, b.ac ? ACC.accent : null);
  holes.forEach(h => walls(ACC[st], h, bb, roofTop, st, wc, o, null));
  const rc = new THREE.Color(b.rf || '#C8C9C5'); rc.multiplyScalar(0.96 + rnd() * 0.08);
  if (st === 'hanok') hipRoof(detAcc, outer, roofTop, new THREE.Color('#4B5156'), o);
  else {
    cap(roofAcc, outer, holes, roofTop, rc, o);
    // 옥상 설비
    const area = Math.abs(signedArea(outer));
    if (area > 650 && st !== 'house') {
      const xs = outer.map(p => p[0]), zs = outer.map(p => p[1]), k = area > 2500 ? 3 : area > 1300 ? 2 : 1;
      for (let t = 0, made = 0; t < 40 && made < k; t++) {
        const x = Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs)), z = Math.min(...zs) + rnd() * (Math.max(...zs) - Math.min(...zs));
        const w = 3 + rnd() * 4, d = 3 + rnd() * 3; if (!inPoly(x, z, outer) || !inPoly(x + w / 2, z + d / 2, outer) || !inPoly(x - w / 2, z - d / 2, outer)) continue;
        box(detAcc, x, z, w, d, roofTop, 1.6 + rnd() * 1.8, new THREE.Color(made === 0 && b.box ? b.box : '#DADDDB'), o); made++;
      }
    }
  }
  const [cx, cz] = centroid(outer);
  BINFO.push({ id: b.id || null, name: b.n || null, outer, holes, y0: bb, y1: bh, cx, cz, st });
  if (b.id) APPB[b.id] = o;
});
const pickMeshes = [];
for (const k in ACC) { const m = ACC[k].mesh(new THREE.MeshLambertMaterial({ map: ACC[k].tex, vertexColors: true })); if (m) { scene.add(m); pickMeshes.push(m); } }
{ const m = roofAcc.mesh(new THREE.MeshLambertMaterial({ vertexColors: true })); scene.add(m); pickMeshes.push(m); }
{ const m = detAcc.mesh(new THREE.MeshLambertMaterial({ vertexColors: true })); scene.add(m); pickMeshes.push(m); }
const terrain = buildTerrain();
/* 보행로·계단 오버레이 (OSM) — 지형에 drape, 계단은 층계 */
(function drawPaths3D(){ const P = window.PATHS; if(!P||!P.length) return; const grp=new THREE.Group(); grp.name='paths3d';
  const roadMat=new THREE.MeshLambertMaterial({color:0xF4EDD7, side:THREE.DoubleSide}), pathMat=new THREE.MeshLambertMaterial({color:0xE6D8B4, side:THREE.DoubleSide}), stepMat=new THREE.MeshLambertMaterial({color:0xCF9324});
  const ribbon=(pts,hw,yoff)=>{ const pos=[],idx=[];
    for(let i=0;i<pts.length;i++){ const a=pts[Math.max(0,i-1)], b=pts[Math.min(pts.length-1,i+1)]; let dx=b.x-a.x, dz=b.z-a.z; const L=Math.hypot(dx,dz)||1; dx/=L; dz/=L; const px=-dz, pz=dx, p=pts[i]; pos.push(p.x+px*hw,p.y+yoff,p.z+pz*hw, p.x-px*hw,p.y+yoff,p.z-pz*hw); }
    for(let i=0;i<pts.length-1;i++){ const a=i*2; idx.push(a,a+1,a+2,a+2,a+1,a+3); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
  P.forEach(p=>{ if(!p.c||p.c.length<2) return;
    const pts=p.c.map(([lat,lng])=>{ const [x,z]=llXZ([lat,lng]); return new THREE.Vector3(x, gH(x,z), z); });
    if(p.k==='steps'){
      const curve=new THREE.CatmullRomCurve3(pts), len=curve.getLength(), n=Math.max(2,Math.round(len/1.4));
      for(let i=0;i<=n;i++){ const t=i/n, pos=curve.getPointAt(t), tan=curve.getTangentAt(t);
        const tread=new THREE.Mesh(new THREE.BoxGeometry(3.4,0.7,1.5), stepMat);
        tread.position.set(pos.x,pos.y+0.35,pos.z); tread.rotation.y=Math.atan2(tan.x,tan.z); grp.add(tread); }
    } else {
      const hw=p.k==='road'?2.2:1.4;
      grp.add(new THREE.Mesh(ribbon(pts,hw,0.25), p.k==='road'?roadMat:pathMat));
    }
  });
  scene.add(grp);
})();

/* ---------- 나무 ---------- */
{
  const n = D.t.length, canopy = new THREE.IcosahedronGeometry(1, 1), trunk = new THREE.CylinderGeometry(0.22, 0.3, 1, 5);
  const cm = new THREE.InstancedMesh(canopy, new THREE.MeshLambertMaterial({ flatShading: true }), n * 2);
  const tm = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x6B5641 }), n);
  const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const greens = ['#4E8F45', '#5C9C4D', '#3F7E3C', '#6AA457', '#468A48'];
  let ci = 0;
  D.t.forEach(([x, z, k], i) => {
    const y = gH(x, z), h = 3.2 * k;
    M4.compose(p.set(x, y + h / 2, z), q.identity(), s.set(k, h, k)); tm.setMatrixAt(i, M4);
    const r = 2.5 * k; col.set(greens[i % greens.length]);
    M4.compose(p.set(x, y + h + r * .55, z), q.identity(), s.set(r, r * 1.05, r)); cm.setMatrixAt(ci, M4); cm.setColorAt(ci++, col);
    const r2 = r * .72; col.offsetHSL(0, 0, .04);
    M4.compose(p.set(x + r * .35, y + h + r * 1.15, z - r * .2), q.identity(), s.set(r2, r2, r2)); cm.setMatrixAt(ci, M4); cm.setColorAt(ci++, col);
  });
  cm.count = ci; scene.add(tm, cm);
}

/* ---------- 선택 강조 ---------- */
const selGroup = new THREE.Group(); scene.add(selGroup);
const selMat = new THREE.MeshBasicMaterial({ color: 0x2346D6, transparent: true, opacity: .26, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const selLine = new THREE.LineBasicMaterial({ color: 0x2346D6 });
let selId = null;
function setSelected(id) {
  if (id === selId) return; selId = id; selGroup.clear();
  if (!id || APPB[id] == null) return;
  const B = BINFO[APPB[id]], acc = new Acc(null);
  walls(acc, B.outer, B.y0, B.y1, 'plain', white, 0, null); cap(acc, B.outer, B.holes, B.y1 + 0.05, white, 0);
  selGroup.add(acc.mesh(selMat));
  const pts = []; const R = B.outer, n = R.length;
  for (let i = 0; i < n; i++) { const a = R[i], b = R[(i + 1) % n]; pts.push(a[0], B.y1 + .1, a[1], b[0], B.y1 + .1, b[1], a[0], B.y0 + 1.5, a[1], a[0], B.y1 + .1, a[1]); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); selGroup.add(new THREE.LineSegments(lg, selLine));
}

/* ---------- 카메라·조작 ---------- */
const controls = new MapControls(camera, canvas);
Object.assign(controls, { enableDamping: true, dampingFactor: .1, screenSpacePanning: false, maxPolarAngle: 1.33, minPolarAngle: .12,
  minDistance: 45, maxDistance: 2600, zoomSpeed: 1.0, rotateSpeed: .9, panSpeed: .85, zoomToCursor: true });
const HOME = (() => { const [x, z] = llXZ([37.58795, 126.99285]); return { x, z, r: 700, phi: 1.06, th: .42 }; })();
let KX = .3;   // 화면 가로로 보이는 폭(m) = 2 × 거리 × KX
const distFor = w => (w / 2) / KX;
function setView(v) { const y = gH(v.x, v.z); controls.target.set(v.x, y, v.z);
  camera.position.set(v.x + v.r * Math.sin(v.phi) * Math.sin(v.th), y + v.r * Math.cos(v.phi), v.z + v.r * Math.sin(v.phi) * Math.cos(v.th)); controls.update(); }
let fly = null;
function flyTo(x, z, r) {
  const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
  const from = { t: controls.target.clone(), r: sph.radius }, to = { t: new THREE.Vector3(x, gH(x, z), z), r: r ?? sph.radius };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { controls.target.copy(to.t); sph.radius = to.r; camera.position.copy(to.t).add(new THREE.Vector3().setFromSpherical(sph)); dirty = true; return; }
  fly = { from, to, sph, t0: performance.now(), dur: 650 };
}
function stepFly(now) {
  if (!fly) return false; const k = Math.min(1, (now - fly.t0) / fly.dur), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  controls.target.lerpVectors(fly.from.t, fly.to.t, e); fly.sph.radius = fly.from.r + (fly.to.r - fly.from.r) * e;
  if (fly.ang) { const a = fly.ang; let dt = a.s1.theta - a.s0.theta; dt = Math.atan2(Math.sin(dt), Math.cos(dt));
    fly.sph.phi = a.s0.phi + (a.s1.phi - a.s0.phi) * e; fly.sph.theta = a.s0.theta + dt * e; }
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(fly.sph));
  if (k >= 1) fly = null; return true;
}
canvas.addEventListener('pointerdown', () => { fly = null; }, { capture: true });
api.resetView = () => { const off = camera.position.clone().sub(controls.target); const s0 = new THREE.Spherical().setFromVector3(off); const s1 = new THREE.Spherical(HOME.r, HOME.phi, HOME.th); flyTo(HOME.x, HOME.z, HOME.r); if (fly) fly.ang = { s0, s1 }; };
function keepInBounds() {
  const t = controls.target, m = 40; const cx = Math.min(Math.max(t.x, X0 + m), X1 - m), cz = Math.min(Math.max(t.z, Z0 + m), Z1 - m);
  const dx = cx - t.x, dz = cz - t.z; const gy = gH(cx, cz), dy = (gy - t.y) * .25;
  if (dx || dz || Math.abs(dy) > .01) { t.x += dx; t.z += dz; t.y += dy; camera.position.x += dx; camera.position.z += dz; camera.position.y += dy; }
  const floor = gH(camera.position.x, camera.position.z) + 12; if (camera.position.y < floor) camera.position.y = floor;
}

/* ---------- 크기·보이는 영역 ---------- */
let W = 1, H = 1, dirty = true;
function resize() {
  W = wrap.clientWidth || 1; H = wrap.clientHeight || 1; renderer.setSize(W, H, false);
  camera.aspect = W / H;
  // 휴대폰: 위 질문창과 아래 패널 사이 가운데가 화면 중심이 되게
  let c = H / 2; try { if (typeof visRect === 'function') { const v = visRect(); c = v.top + v.h / 2; } } catch (_) {}
  const full = 2 * Math.max(c, H - c); camera.setViewOffset(W, full, 0, full / 2 - c, W, H);
  KX = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * W / full;
  camera.updateProjectionMatrix(); dirty = true; requestAnimationFrame(measureObstacles);
}
addEventListener('resize', () => { if (api.on) resize(); });

/* ---------- 라벨 ---------- */
const LBL = [];
function addLabel(o) { const el = document.createElement('button'); el.type = 'button'; el.className = 'l3 ' + (o.cls || ''); el.innerHTML = o.html; el.setAttribute('aria-label', o.aria || el.textContent);
  el.addEventListener('click', e => { e.stopPropagation(); o.click && o.click(); }); layer.appendChild(el); o.el = el; o.w = 0; o.h = 0; LBL.push(o); return o; }
const esc3 = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
BUILDINGS.forEach(ab => { const i = APPB[ab.id]; if (i == null) return; const B = BINFO[i];
  addLabel({ kind: 'b', bid: ab.id, p: new THREE.Vector3(B.cx, B.y1 + 2.5, B.cz), pri: ab.minor ? 3 : 1, cls: ab.minor ? 'minor' : '',
    html: `${ab.no ? `<i>${esc3(ab.no)}</i>` : '<i class="dot"></i>'}<span>${esc3(ab.name)}</span><b class="cnt"></b>`, aria: `${ab.name} 출입구와 층별 시설 보기`, click: () => showBuilding(ab.id) }); });
const plc = (k, icon) => { const p = D.pl[k]; if (!p) return; addLabel({ kind: 'p', p: new THREE.Vector3(p.x, p.y + 3, p.z), pri: 2, cls: 'pl', html: `<i class="${icon}"></i><span>${esc3(p.n)}</span>`, aria: p.n }); };
plc('lawn', 'dot'); plc('field', 'tri');
PLACES.gates.forEach(gt => { const [x, z] = llXZ(gt.ll); addLabel({ kind: 'g', p: new THREE.Vector3(x, gH(x, z) + 3, z), pri: 2, cls: 'gate', html: `<span>${esc3(gt.name)}</span>`, aria: gt.name }); });
PLACES.heritage.slice(1, 2).forEach(h => { const [x, z] = llXZ(h.ll); addLabel({ kind: 'h', p: new THREE.Vector3(x, gH(x, z) + 9, z), pri: 4, cls: 'her', html: `<span>성균관 ${esc3(h.name)}</span>`, aria: h.name }); });
STOPS.forEach(s => { const [x, z] = llXZ(s.ll); addLabel({ kind: 's', id: s.id, p: new THREE.Vector3(x, gH(x, z) + 2, z), pri: 2, cls: 'stop3', html: `<i>${iconSVG('bus', 13, '#fff', 2.3)}</i><span>${esc3(s.name)}</span>`, aria: s.name, click: () => showStop(s.id) }); });
let facLabels = [];
function buildFacPins() {
  facLabels.forEach(o => { o.el.remove(); LBL.splice(LBL.indexOf(o), 1); }); facLabels = [];
  const cat = state.cat; FAC.filter(f => f.ll && (cat === 'all' || f.cat === cat)).forEach(f => { const [x, z] = llXZ(f.ll);
    facLabels.push(addLabel({ kind: 'f', p: new THREE.Vector3(x, gH(x, z) + 2, z), pri: 2.5, cls: 'pin3', html: `<i>${iconSVG(f.cat, 13, '#1C2A21', 2.2)}</i>`, aria: f.name, click: () => showItem(f.id) })); });
}
const coordMark = addLabel({ kind: 'c', p: new THREE.Vector3(), pri: 0, cls: 'coord3', html: '', aria: '찍은 좌표' }); coordMark.hide = true;
const v3 = new THREE.Vector3();
let OBST = [], VIS = [0, 0, 1e5, 1e5];
function measureObstacles() {
  const wr = wrap.getBoundingClientRect(); OBST = [];
  for (const el of [$q('.zoomctl', wrap), legend]) { if (!el) continue; const r = el.getBoundingClientRect(); if (r.width) OBST.push([r.left - wr.left - 4, r.top - wr.top - 4, r.right - wr.left + 4, r.bottom - wr.top + 4]); }
  try { const v = visRect(); VIS = [0, v.top, W, v.top + v.h]; } catch (_) { VIS = [0, 0, W, H]; }
}
function layoutLabels() {
  const placed = OBST.slice(), dist = camera.position.distanceTo(controls.target);
  const items = LBL.map(o => { v3.copy(o.p).project(camera); const x = (v3.x + 1) / 2 * W, y = (1 - v3.y) / 2 * H;
    const d = camera.position.distanceTo(o.p); return { o, x, y, d, vis: v3.z < 1 && x > -60 && x < W + 60 && y > -40 && y < H + 60 }; });
  items.sort((a, b) => ((a.o.bid && a.o.bid === selId) ? -1 : 0) - ((b.o.bid && b.o.bid === selId) ? -1 : 0) || a.o.pri - b.o.pri || a.d - b.d);
  for (const it of items) { const o = it.o; let show = it.vis && !o.hide;
    if (show && o.kind === 'b' && o.pri > 2 && dist > 520) show = false;
    if (show && o.kind === 'h' && dist > 900) show = false;
    if (show) { if (!o.w) { o.w = o.el.offsetWidth || 80; o.h = o.el.offsetHeight || 24; }
      const anchorY = (o.kind === 'f' || o.kind === 'c') ? .5 : 1;
      const r = [it.x - o.w / 2, it.y - o.h * anchorY, it.x + o.w / 2, it.y + o.h * (1 - anchorY)];
      if (r[1] < VIS[1] - 4 || r[3] > VIS[3] + 4) show = false;
      else if (o.kind !== 'c' && placed.some(q => r[0] < q[2] + 2 && r[2] > q[0] - 2 && r[1] < q[3] + 2 && r[3] > q[1] - 2)) show = !!(o.bid && o.bid === selId);
      if (show) { placed.push(r); o.el.style.transform = `translate3d(${(it.x - o.w / 2).toFixed(1)}px,${(it.y - o.h * anchorY).toFixed(1)}px,0)`; } }
    o.el.style.visibility = show ? 'visible' : 'hidden'; }
}

/* ---------- 상태 반영(카테고리·선택) ---------- */
function refresh() {
  const cat = state.cat; setSelected(state.sel || null);
  LBL.forEach(o => { if (o.kind !== 'b') return; const n = (cat === 'all' || cat === 'bus') ? 0 : facAt(o.bid, cat).length;
    o.el.classList.toggle('sel', state.sel === o.bid); o.el.classList.toggle('dim', cat === 'bus' || (cat !== 'all' && !n));
    const c = o.el.querySelector('.cnt'); c.textContent = n || ''; c.style.display = n ? '' : 'none'; o.w = 0; });
  LBL.forEach(o => { if (o.kind === 's') o.el.classList.toggle('dim', cat !== 'all' && cat !== 'bus'); });
  buildFacPins(); dirty = true;
}

/* ---------- 누르기(탭) ---------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now(), n: (down && down.n || 0) + 1 }; });
canvas.addEventListener('pointerup', e => {
  if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
  if (moved > 7 || dt > 600) return;
  const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects([...pickMeshes, terrain], false);
  if (state.coord) { const h = hits[0]; if (!h) return; const ll = xzLL(h.point.x, h.point.z);
    coordMark.p.copy(h.point); coordMark.hide = false; $q('#coordtxt').textContent = `[${ll[0]}, ${ll[1]}]`; $q('#coordchip').classList.add('on'); dirty = true; return; }
  const h = hits.find(x => x.object !== terrain && x.object.userData.own);
  if (h) { const B = BINFO[h.object.userData.own[h.faceIndex]]; if (B && B.id) { showBuilding(B.id); return; } }
  closeCallout(); if (window.dismissToHome) window.dismissToHome();
});

/* ---------- 루프 ---------- */
let lastCam = '';
function frame(now) {
  requestAnimationFrame(frame); if (!api.on) return;
  const flying = stepFly(now); const ch = controls.update(); keepInBounds();
  const key = camera.position.toArray().map(v => v.toFixed(2)).join() + controls.target.toArray().map(v => v.toFixed(2)).join();
  if (flying || ch || dirty || key !== lastCam) { lastCam = key; dirty = false;
    const dd = camera.position.distanceTo(controls.target); scene.fog.near = dd * 1.25 + 300; scene.fog.far = dd * 3.2 + 1500; renderer.render(scene, camera); layoutLabels(); if (state.callout) placeCallout(); }
}
requestAnimationFrame(frame);

/* ---------- 페이지와 연결 ---------- */
api.screenRect = id => {
  const i = APPB[id]; if (i == null) return null; const B = BINFO[i]; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, ok = false;
  for (const [x, z] of B.outer) for (const y of [B.y0 + 2, B.y1]) { v3.set(x, y, z).project(camera); if (v3.z >= 1) continue; ok = true;
    const sx = (v3.x + 1) / 2 * W, sy = (1 - v3.y) / 2 * H; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
  return ok ? [x0, y0, x1 - x0, y1 - y0] : null;
};
api.focusRect = (rect) => {   // 2D 지도 좌표 사각형 → 3D 위치로 이동
  const ll = toLL(rect[0] + rect[2] / 2, rect[1] + rect[3] / 2), [x, z] = llXZ(ll);
  const d = camera.position.distanceTo(controls.target), r = Math.min(d, distFor(isDesktop() ? 380 : 300));
  // 2D처럼 건물을 화면 왼쪽(휴대폰 22%, PC 40%)에 두고 오른쪽에 층 목록이 뜰 자리를 남김
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0); right.y = 0; right.normalize();
  const k = (isDesktop() ? 0.10 : 0.28) * 2 * r * KX;
  flyTo(x + right.x * k, z + right.z * k, r);
};
api.zoom = f => { const off = camera.position.clone().sub(controls.target); const L = Math.min(controls.maxDistance, Math.max(controls.minDistance, off.length() / f));
  flyTo(controls.target.x, controls.target.z, L); };
api.fit = () => {
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  fly = { from: { t: controls.target.clone(), r: sph.radius }, to: { t: new THREE.Vector3(HOME.x, gH(HOME.x, HOME.z), HOME.z), r: HOME.r },
    sph, ang: { s0: sph.clone(), s1: new THREE.Spherical(HOME.r, HOME.phi, HOME.th) }, t0: performance.now(), dur: 800 };
};
api.resize = () => { if (api.on) resize(); };
api.refresh = () => { if (api.on) refresh(); };
api.clearCoord = () => { coordMark.hide = true; dirty = true; };
function enable(on, save = true) {
  api.on = on; wrap.classList.toggle('is3d', on);
  if (btn) { btn.textContent = on ? '2D' : '3D'; btn.setAttribute('aria-label', on ? '2D 지도로 보기' : '3D로 보기'); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  if (save) { try { localStorage.setItem('skkuhack-view', on ? '3d' : '2d'); } catch (_) {} }
  if (on) { resize(); refresh(); dirty = true; } else { try { applyV(); placeCallout(); } catch (_) {} }
}
api.enable = enable;
if (btn) { btn.hidden = false; btn.onclick = () => enable(!api.on); }
if (loading) loading.remove(); api.ready = true; api.initMs = Math.round(performance.now() - T_START);
let pref = null; try { pref = localStorage.getItem('skkuhack-view'); } catch (_) {}
HOME.r = 700; enable(pref !== '2d', false); HOME.r = Math.min(controls.maxDistance, distFor(isDesktop() ? 640 : 420)); setView(HOME);
