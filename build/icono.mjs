// Quirotech — el dibujo del ícono (la vara de Asclepio con la serpiente).
// Lo rasteriza build/make-icon.cjs (npm run icon); la maqueta original con su
// muestrario está en S:\mockups\quirotech.
// La serpiente es una hélice de verdad: cada tramo sabe si pasa por delante o
// por detrás del bastón (z = cos θ), así que el orden de pintado sale solo.

const f = (n) => +n.toFixed(2);

export function icono({ chico = false } = {}) {
  // chico: la marca para 16–32 px. Una vuelta y media, trazos gruesos, sin
  // retícula ni grano: a ese tamaño cada detalle es medio píxel de barro.
  const S = 512, cx = 256, grano = !chico;
  const G = chico ? 2.6 : 1;               // cuánto engorda cada trazo

  // ── La hélice ───────────────────────────────────────────────────────────
  const y0 = chico ? 440 : 452, y1 = chico ? 214 : 168;   // de la cola (abajo) al cuello
  const vueltas = chico ? 1.25 : 2.25;
  const th0 = -Math.PI * 0.62, th1 = th0 + vueltas * 2 * Math.PI;
  const N = 420;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const th = th0 + t * (th1 - th0);
    const A = chico ? 122 : 74 - 10 * t;   // se cierra un poco hacia arriba
    pts.push({ x: cx + A * Math.sin(th), y: y0 - t * (y0 - y1), z: Math.cos(th), t });
  }
  // El cuello: sale de la última vuelta y sube hacia afuera, a la cabeza.
  const ult = pts[pts.length - 1];
  const cab = chico ? { x: 352, y: 96 } : { x: 318, y: 92 };
  const ctl1 = { x: ult.x + 30 * G / 1.6, y: ult.y - 18 }, ctl2 = { x: cab.x - 34, y: cab.y + 40 };
  const M = 60;
  for (let i = 1; i <= M; i++) {
    const u = i / M, v = 1 - u;
    pts.push({
      x: v ** 3 * ult.x + 3 * v * v * u * ctl1.x + 3 * v * u * u * ctl2.x + u ** 3 * cab.x,
      y: v ** 3 * ult.y + 3 * v * v * u * ctl1.y + 3 * v * u * u * ctl2.y + u ** 3 * cab.y,
      z: 1, t: 1 + u * 0.15,
    });
  }

  const ancho = (t) => {
    if (t < 0.22) return G * (7 + (t / 0.22) * 23);  // la cola se afina
    if (t > 1) return G * (30 - (t - 1) * 30);       // el cuello, apenas más fino
    return G * 30;
  };

  // Color del cuerpo según la profundidad: lo de atrás se hunde en la sombra.
  const mezcla = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const SOMBRA = [8, 34, 36], CUERPO = [32, 150, 138], LUZ = [168, 255, 236];

  const tramos = { atras: [], adelante: [] };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const z = (a.z + b.z) / 2, w = ancho(b.t);
    const k = (z + 1) / 2;                    // 0 atrás · 1 adelante
    const base = mezcla(SOMBRA, CUERPO, 0.35 + 0.65 * k);
    // Anillos de escama: cada tanto un tramo un poco más oscuro.
    const anillo = !chico && Math.floor(i / 7) % 2 === 1 ? 0.12 : 0;
    const col = mezcla(base, SOMBRA, anillo);
    const d = `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}`;
    const capa = z > 0 ? tramos.adelante : tramos.atras;
    capa.push({ d, w, col, k, i });
  }

  const pintar = (lista) => [
    // 1. el contorno oscuro que separa el cuerpo de lo que tapa
    lista.map((s) => `<path d="${s.d}" stroke="#03090a" stroke-width="${f(s.w + 7 * G)}"/>`).join(''),
    // 2. la sombra propia, del lado opuesto a la luz
    lista.map((s) => `<path d="${s.d}" stroke="${hex(mezcla(s.col, SOMBRA, .7))}" stroke-width="${f(s.w)}"/>`).join(''),
    // 3. el cuerpo, corrido hacia la luz: lo que asoma abajo es la sombra
    `<g transform="translate(${-2.5 * G} ${-3 * G})">` +
      lista.map((s) => `<path d="${s.d}" stroke="${hex(s.col)}" stroke-width="${f(s.w * .86)}"/>`).join('') +
      `</g>`,
    // 4. el brillo especular, corrido hacia la luz (arriba a la izquierda)
    `<g transform="translate(${-5 * G} ${-6 * G})">` +
      lista.map((s) => `<path d="${s.d}" stroke="${hex(mezcla(s.col, LUZ, 0.55 + 0.35 * s.k))}" stroke-opacity="${f(0.35 + 0.5 * s.k)}" stroke-width="${f(s.w * 0.28)}"/>`).join('') +
      `</g>`,
  ].join('');

  // ── La cabeza ───────────────────────────────────────────────────────────
  const pen = pts[pts.length - 6];
  const ang = Math.atan2(cab.y - pen.y, cab.x - pen.x) * 180 / Math.PI;
  const cabeza = `
    <g transform="translate(${f(cab.x)} ${f(cab.y)}) rotate(${f(ang)}) scale(${chico ? 2.1 : 1})">
      <path d="M-14 -19 C10 -24 34 -14 40 0 C34 14 10 24 -14 19 C-22 10 -22 -10 -14 -19Z" fill="#03090a" transform="scale(1.12)"/>
      <path d="M-14 -19 C10 -24 34 -14 40 0 C34 14 10 24 -14 19 C-22 10 -22 -10 -14 -19Z" fill="url(#q-cabeza)"/>
      <path d="M-6 -12 C10 -16 26 -10 32 -2" stroke="#c9fff3" stroke-opacity=".55" stroke-width="4" fill="none"/>
      ${chico ? '' : `<circle cx="14" cy="-8" r="5.2" fill="#03090a"/>
      <circle cx="14" cy="-8" r="3.4" fill="#7ff9e6"/>
      <circle cx="15.2" cy="-9.2" r="1.1" fill="#ffffff"/>`}
    </g>`;

  // ── El bastón ───────────────────────────────────────────────────────────
  const bw = chico ? 34 : 12, top = chico ? 92 : 74, pomo = chico ? 40 : 19;
  const baston = `
    <rect x="${cx - bw - 3 * G}" y="${top}" width="${2 * bw + 6 * G}" height="${452 - top + 6}" rx="${bw + 3}" fill="#03090a"/>
    <rect x="${cx - bw}" y="${top + 2}" width="${2 * bw}" height="${452 - top - 2}" rx="${bw}" fill="url(#q-baston)"/>
    <rect x="${cx - bw / 2}" y="${top + 12}" width="${bw * .42}" height="${452 - top - 26}" rx="${bw * .21}" fill="#ffffff" fill-opacity=".28"/>
    <circle cx="${cx}" cy="${top - 4}" r="${pomo + 3 * G}" fill="#03090a"/>
    <circle cx="${cx}" cy="${top - 4}" r="${pomo}" fill="url(#q-pomo)"/>
    <circle cx="${cx - pomo * .32}" cy="${top - 4 - pomo * .37}" r="${pomo * .32}" fill="#ffffff" fill-opacity=".45"/>`;

  // ── La retícula: papel de electro, apenas ──────────────────────────────
  let reticula = '';
  for (let v = 32; !chico && v < S; v += 32) {
    const fuerte = v % 160 === 0;
    reticula += `<path d="M${v} 0V${S}M0 ${v}H${S}" stroke="#7ff9e6" stroke-opacity="${fuerte ? .07 : .035}" stroke-width="${fuerte ? 1.4 : 1}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <defs>
    <clipPath id="q-tile"><rect width="${S}" height="${S}" rx="98"/></clipPath>
    <radialGradient id="q-fondo" cx="50%" cy="38%" r="75%">
      <stop offset="0" stop-color="#13312f"/>
      <stop offset=".55" stop-color="#0a1517"/>
      <stop offset="1" stop-color="#05090a"/>
    </radialGradient>
    <radialGradient id="q-halo" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#2dd4bf" stop-opacity=".30"/>
      <stop offset=".6" stop-color="#2dd4bf" stop-opacity=".07"/>
      <stop offset="1" stop-color="#2dd4bf" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="q-vidrio" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".09"/>
      <stop offset=".5" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="q-baston" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#1a2427"/>
      <stop offset=".3" stop-color="#9fb2b6"/>
      <stop offset=".55" stop-color="#4c5e63"/>
      <stop offset="1" stop-color="#11191b"/>
    </linearGradient>
    <radialGradient id="q-pomo" cx="38%" cy="32%" r="70%">
      <stop offset="0" stop-color="#d9e6e8"/>
      <stop offset=".45" stop-color="#5f7378"/>
      <stop offset="1" stop-color="#121a1c"/>
    </radialGradient>
    <linearGradient id="q-cabeza" x1="0" y1="-1" x2="0" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0" stop-color="#5fe0cc"/>
      <stop offset=".55" stop-color="#20968a"/>
      <stop offset="1" stop-color="#0b3a37"/>
    </linearGradient>
    <filter id="q-grano" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .09 0"/>
    </filter>
  </defs>
  <g clip-path="url(#q-tile)">
    <rect width="${S}" height="${S}" fill="url(#q-fondo)"/>
    ${reticula}
    <circle cx="${cx}" cy="268" r="230" fill="url(#q-halo)"/>
    ${grano ? `<rect width="${S}" height="${S}" filter="url(#q-grano)"/>` : ''}
    <g fill="none" stroke-linecap="round">${pintar(tramos.atras)}</g>
    ${baston}
    <g fill="none" stroke-linecap="round">${pintar(tramos.adelante)}</g>
    ${cabeza}
    <rect width="${S}" height="${S}" fill="url(#q-vidrio)"/>
  </g>
</svg>`;
}
