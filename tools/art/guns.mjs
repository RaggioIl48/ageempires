// Piezas de artillería armadas en 3D a mano (cajas y cilindros), para dibujarlas con el mismo
// renderizador que los modelos de 0 A.D.: el cañón de campaña de las guerras napoleónicas, la
// ametralladora Maxim con escudo y el obús de la era Moderna.
//
// Coordenadas del modelo: x a la derecha, −y hacia adelante (la boca del cañón), z hacia arriba;
// 1 = un metro. Cada pieza lleva su color; las de mode 'team' se pintan del color del jugador.

const BRONZE = [176, 124, 62], IRON = [58, 60, 64], WOOD = [118, 78, 44], DARK = [40, 36, 32], STEEL = [96, 100, 104], OLIVE = [92, 98, 64];

/** Rotación de un punto alrededor del eje x (inclina hacia arriba/abajo). */
const rotX = ([x, y, z], a) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];

/** Triángulo con su normal. */
function tri(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  const nn = n.map((x) => x / l);
  return [a, b, c].map((p) => ({ p, n: nn }));
}

/** Caja con centro, tamaño y una inclinación (alrededor de x) desde un pivote. */
function box(c, s, tilt = 0, pivot = c) {
  const h = s.map((x) => x / 2);
  const corner = (i) => {
    const p = [c[0] + (i & 1 ? h[0] : -h[0]), c[1] + (i & 2 ? h[1] : -h[1]), c[2] + (i & 4 ? h[2] : -h[2])];
    if (!tilt) return p;
    const r = rotX([p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]], tilt);
    return [r[0] + pivot[0], r[1] + pivot[1], r[2] + pivot[2]];
  };
  const v = [...Array(8).keys()].map(corner);
  const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  const out = [];
  for (const [a, b, cc, d] of quads) out.push(tri(v[a], v[b], v[cc]), tri(v[a], v[cc], v[d]));
  return out;
}

/** Cilindro (o cono truncado) entre dos puntos. */
function cylinder(a, b, r0, r1 = r0, seg = 14, caps = true) {
  const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...ax);
  const w = ax.map((x) => x / len);
  // Dos ejes perpendiculares.
  const t = Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let u = [w[1] * t[2] - w[2] * t[1], w[2] * t[0] - w[0] * t[2], w[0] * t[1] - w[1] * t[0]];
  const lu = Math.hypot(...u);
  u = u.map((x) => x / lu);
  const v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
  const ring = (c, r, k) => {
    const ang = (k / seg) * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
    return [0, 1, 2].map((i) => c[i] + (u[i] * cs + v[i] * sn) * r);
  };
  const out = [];
  for (let k = 0; k < seg; k++) {
    const p0 = ring(a, r0, k), p1 = ring(a, r0, k + 1), q0 = ring(b, r1, k), q1 = ring(b, r1, k + 1);
    out.push(tri(p0, p1, q1), tri(p0, q1, q0));
    if (caps) out.push(tri(a, p1, p0), tri(b, q0, q1));
  }
  return out;
}

/** Rueda de rayos: llanta de hierro, rayos de madera y maza. Eje a lo largo de x. */
function wheel(x, y, z, r, width = 0.09, spokes = 12) {
  const rim = [], wood = [];
  const seg = 20;
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    const p = (a, rr, dx) => [x + dx, y + Math.cos(a) * rr, z + Math.sin(a) * rr];
    for (const [rr0, rr1, list] of [[r, r * 0.86, rim]]) {
      const o0 = p(a0, rr0, -width / 2), o1 = p(a1, rr0, -width / 2), o2 = p(a1, rr0, width / 2), o3 = p(a0, rr0, width / 2);
      const i0 = p(a0, rr1, -width / 2), i1 = p(a1, rr1, -width / 2), i2 = p(a1, rr1, width / 2), i3 = p(a0, rr1, width / 2);
      list.push(tri(o0, o1, o2), tri(o0, o2, o3)); // borde exterior
      list.push(tri(i0, i2, i1), tri(i0, i3, i2)); // borde interior
      list.push(tri(o0, i1, o1), tri(o0, i0, i1)); // cara izquierda
      list.push(tri(o3, o2, i2), tri(o3, i2, i3)); // cara derecha
    }
  }
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * Math.PI * 2;
    wood.push(...cylinder([x, y, z], [x, y + Math.cos(a) * r * 0.88, z + Math.sin(a) * r * 0.88], 0.025, 0.02, 5, false));
  }
  wood.push(...cylinder([x - width * 0.9, y, z], [x + width * 0.9, y, z], r * 0.16, r * 0.16, 10));
  return { rim, wood };
}

/** Junta piezas de un mismo color/modo. */
function part(tris, color, mode = 'opaque', name = '') {
  return { tris, color, mode, name };
}

/** Cañón de campaña napoleónico (de 12 libras): la cureña lleva el color del jugador. */
export function fieldGun() {
  const R = 0.62, axleZ = R, wx = 0.62;
  const w1 = wheel(-wx, 0, axleZ, R), w2 = wheel(wx, 0, axleZ, R);
  const elev = 0.06;
  const pivot = [0, 0, axleZ + 0.22];
  // Caño: de la boca (adelante, −y) a la culata, con brocal y cascabel.
  const barrel = [
    ...cylinder(rotXAround([0, -1.45, pivot[2]], pivot, elev), rotXAround([0, 0.55, pivot[2]], pivot, elev), 0.1, 0.15, 16),
    ...cylinder(rotXAround([0, -1.47, pivot[2]], pivot, elev), rotXAround([0, -1.33, pivot[2]], pivot, elev), 0.125, 0.125, 16),
    ...cylinder(rotXAround([0, 0.55, pivot[2]], pivot, elev), rotXAround([0, 0.68, pivot[2]], pivot, elev), 0.06, 0.04, 8),
  ];
  // Cureña: dos gualderas que bajan hasta la cola, que apoya en el suelo.
  const trailTilt = -0.36;
  const cheeks = [
    ...box([-0.2, 0.75, axleZ], [0.08, 1.9, 0.26], trailTilt, [0, -0.1, axleZ]),
    ...box([0.2, 0.75, axleZ], [0.08, 1.9, 0.26], trailTilt, [0, -0.1, axleZ]),
    ...box([0, 0.25, axleZ - 0.02], [0.48, 0.5, 0.08], trailTilt, [0, -0.1, axleZ]),
    ...box([0, 1.55, axleZ - 0.08], [0.46, 0.25, 0.08], trailTilt, [0, -0.1, axleZ]),
  ];
  const axle = cylinder([-wx, 0, axleZ], [wx, 0, axleZ], 0.05, 0.05, 8);
  return [
    part(barrel, BRONZE, 'opaque', 'barrel'),
    part(cheeks, WOOD, 'team', 'carriage'),
    part(axle, IRON, 'opaque', 'axle'),
    part([...w1.rim, ...w2.rim], IRON, 'opaque', 'rim'),
    part([...w1.wood, ...w2.wood], WOOD, 'team', 'wheels'),
  ];
}

/** Ametralladora Maxim sobre un afuste con ruedas chicas y escudo. */
export function maximGun() {
  const R = 0.32, z = R;
  const w1 = wheel(-0.36, 0.15, z, R, 0.06, 10), w2 = wheel(0.36, 0.15, z, R, 0.06, 10);
  const gunZ = 0.62;
  const gun = [
    ...cylinder([0, -0.95, gunZ], [0, -0.25, gunZ], 0.075, 0.075, 12), // camisa de agua
    ...cylinder([0, -1.12, gunZ], [0, -0.95, gunZ], 0.025, 0.025, 6), // boca
    ...box([0, -0.05, gunZ], [0.16, 0.42, 0.16]), // cajón de mecanismos
    ...cylinder([0, 0.18, gunZ - 0.03], [0, 0.32, gunZ - 0.08], 0.025, 0.025, 6), // empuñaduras
  ];
  const shield = [...box([0, -0.35, gunZ - 0.04], [0.72, 0.035, 0.62])];
  const frame = [
    ...box([0, 0.35, 0.3], [0.34, 1.1, 0.07], -0.38, [0, -0.1, 0.32]),
    ...box([0, -0.05, 0.47], [0.12, 0.12, 0.3]),
  ];
  const axle = cylinder([-0.36, 0.15, z], [0.36, 0.15, z], 0.03, 0.03, 8);
  return [
    part(gun, IRON, 'opaque', 'gun'),
    part(shield, STEEL, 'team', 'shield'),
    part(frame, DARK, 'opaque', 'frame'),
    part(axle, IRON, 'opaque', 'axle'),
    part([...w1.rim, ...w2.rim], IRON, 'opaque', 'rim'),
    part([...w1.wood, ...w2.wood], WOOD, 'opaque', 'wheels'),
  ];
}

/** Obús pesado de la era Moderna: caño largo de acero, escudo y ruedas macizas. */
export function howitzer() {
  const R = 0.55, axleZ = R, wx = 0.72;
  const w1 = wheel(-wx, 0.1, axleZ, R, 0.18, 8), w2 = wheel(wx, 0.1, axleZ, R, 0.18, 8);
  const elev = 0.16;
  const pivot = [0, 0, axleZ + 0.35];
  const barrel = [
    ...cylinder(rotXAround([0, -2.4, pivot[2]], pivot, elev), rotXAround([0, 0.4, pivot[2]], pivot, elev), 0.1, 0.16, 16),
    ...cylinder(rotXAround([0, -2.5, pivot[2]], pivot, elev), rotXAround([0, -2.35, pivot[2]], pivot, elev), 0.14, 0.14, 16), // freno de boca
    ...box(rotXAround([0, 0.15, pivot[2] - 0.12], pivot, elev), [0.38, 0.9, 0.3], 0), // cuna
  ];
  const shield = [...box([0, -0.25, axleZ + 0.45], [1.25, 0.05, 0.75])];
  const trails = [
    ...box([-0.35, 1.0, axleZ - 0.15], [0.12, 2.4, 0.16], -0.28, [0, -0.1, axleZ]),
    ...box([0.35, 1.0, axleZ - 0.15], [0.12, 2.4, 0.16], -0.28, [0, -0.1, axleZ]),
  ];
  return [
    part(barrel, OLIVE, 'team', 'barrel'),
    part(shield, OLIVE, 'team', 'shield'),
    part(trails, DARK, 'opaque', 'trails'),
    part([...w1.rim, ...w2.rim], DARK, 'opaque', 'tyres'),
    part([...w1.wood, ...w2.wood], STEEL, 'opaque', 'hubs'),
  ];
}

/** Gira un punto alrededor de un pivote (eje x). */
function rotXAround(p, pivot, a) {
  const r = rotX([p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]], a);
  return [r[0] + pivot[0], r[1] + pivot[1], r[2] + pivot[2]];
}

/** Dónde está la boca de cada arma (para el fogonazo y el humo), y dónde se paran los sirvientes. */
export const GUN_LAYOUT = {
  field: { muzzle: [0, -1.5, 1.0], crew: [[-0.55, 1.45], [0.6, 1.05]] },
  maxim: { muzzle: [0, -1.15, 0.62], crew: [[-0.25, 0.75], [0.45, 0.55]] },
  howitzer: { muzzle: [0, -2.55, 1.55], crew: [[-0.75, 1.6], [0.8, 1.25]] },
};
