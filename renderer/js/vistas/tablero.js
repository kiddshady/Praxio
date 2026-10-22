/* Tablero — lo primero que se ve al entrar: las cifras, cómo vienen las
   recetas del último mes, quién pasó hoy y las últimas recetas. */

import Router from '../router.js';
import { paint, esc, empty } from '../ui.js';
import { countTo } from '../motion.js';
import { S, refrescar, fecha } from '../tienda.js';

const DIAS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MESES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const MES_CORTO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Thursday 22 October": el día antes del mes, como se escribe la fecha acá. */
function hoyLargo() {
  const d = new Date();
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
}

function cifra(rotulo, id) {
  return `<div class="rx-cifra">
    <div class="rx-cifra__v op-num" id="${id}">0</div>
    <div class="rx-cifra__r">${esc(rotulo)}</div>
  </div>`;
}

/** "2026-10-05" → "5 Oct". */
function corta(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MES_CORTO[m - 1]}`;
}

/** La hora local de un timestamp ISO, "09:40". */
function hora(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export async function vistaTablero() {
  const r = await refrescar();
  const medico = S.medico || {};
  const sinConfigurar = !medico.apellido_nombre;
  const serie = r.recetasPorDia || [];
  const atendidos = r.atendidosHoy || [];
  const max = Math.max(0, ...serie.map((x) => x.n));
  const enElMes = serie.reduce((a, x) => a + x.n, 0);
  const marcas = serie.length ? [0, 7, 14, 21].map((i) => corta(serie[i].fecha)).concat('today') : [];

  paint(`
    <div class="op-viewhead">
      <div class="op-viewhead__text op-grow">
        <div class="rx-eyebrow">${esc(hoyLargo())}</div>
        <div class="op-viewhead__title">Dashboard</div>
        <div class="op-viewhead__sub">${esc(sinConfigurar
          ? 'Before issuing your first prescription, enter your professional details in Settings.'
          : medico.apellido_nombre + (medico.matricula ? ` · Lic. ${medico.matricula}` : '')
            + (medico.especialidad ? ` · ${medico.especialidad}` : ''))}</div>
      </div>
      <div class="op-viewhead__actions">
        <button class="op-btn op-btn--secondary op-flashable" id="t-orden">
          <i data-icon="orden"></i> New test order</button>
        <button class="op-btn op-btn--primary op-flashable" id="t-nueva">
          <i data-icon="plus"></i> New prescription</button>
      </div>
    </div>
    <div class="op-scroll op-grow op-scroll--line-bottom">
      ${sinConfigurar ? `
        <div class="rx-aviso" style="margin-bottom:var(--op-4)">
          <i data-icon="info"></i>
          <div><strong>Your details are missing.</strong> The prescription footer comes from
          what you enter in Settings: name, license number and specialty.
          <button class="op-btn op-btn--ghost op-btn--sm" id="t-ajustes"
                  style="margin-left:var(--op-2)">Go to Settings</button></div>
        </div>` : ''}

      <!-- Las cifras: una tira con divisiones, no cinco cajas. -->
      <div class="op-card rx-cifras">
        ${cifra('Patients', 'c-pac')}
        ${cifra('Prescriptions issued', 'c-rec')}
        ${cifra('Prescriptions today', 'c-hoy')}
        ${cifra('Test orders issued', 'c-ord')}
        ${cifra('Progress notes', 'c-evo')}
      </div>

      <div class="rx-doble">
        <div class="op-card rx-traza">
          <div class="rx-tarjeta__cab">
            <div class="rx-tarjeta__tit">Prescriptions per day</div>
            <div class="rx-tarjeta__meta op-num">last 30 days · ${enElMes} in total · max. ${max}</div>
          </div>
          <div class="rx-traza__lienzo"><canvas id="t-traza" aria-label="Prescriptions per day over the last 30 days"></canvas></div>
          <div class="rx-traza__ejes op-num">${marcas.map((m) => `<span>${esc(m)}</span>`).join('')}</div>
        </div>

        <div class="op-card rx-hoy">
          <div class="rx-tarjeta__cab">
            <div class="rx-tarjeta__tit">Seen today</div>
            <div class="rx-tarjeta__meta op-num">${atendidos.length
              ? `${atendidos.length} ${atendidos.length === 1 ? 'progress note' : 'progress notes'}` : ''}</div>
          </div>
          ${atendidos.length === 0
      ? '<div class="rx-hoy__vacio">When you write a progress note dated today, it shows up here.</div>'
      : `<div class="rx-hoy__lista">${atendidos.map((a) => `
              <div class="rx-turno" data-ficha="${esc(a.paciente_id || '')}" role="button" tabindex="0">
                <div class="rx-turno__h op-num">${esc(hora(a.creado))}</div>
                <div class="rx-turno__txt">
                  <div class="rx-turno__n op-truncate">${esc(a.paciente || '— deleted patient —')}</div>
                  ${a.motivo ? `<div class="rx-turno__m op-truncate">${esc(a.motivo)}</div>` : ''}
                </div>
              </div>`).join('')}</div>`}
        </div>
      </div>

      <div class="op-section">
        <div class="op-section__head">
          <div class="op-section__title">Latest prescriptions</div>
          <button class="op-btn op-btn--ghost op-btn--sm" id="t-todas">See all</button>
        </div>
        ${r.ultimasRecetas.length === 0
      ? empty({ icon: 'file', title: 'You have not issued any prescriptions yet', text: 'The first one starts with the button above.' })
      : `<div class="op-list">${r.ultimasRecetas.map((x) => `
            <div class="op-listitem" data-receta="${esc(x.id)}" role="button" tabindex="0">
              <div class="op-iconcell"><i data-icon="file"></i></div>
              <div class="op-listitem__main">
                <div class="op-listitem__title">${esc(x.paciente || '— deleted patient —')}</div>
                <div class="op-listitem__sub op-truncate">${esc(x.detalle || '')}</div>
              </div>
              <div class="op-listitem__aside op-num">${esc(fecha(x.fecha))}</div>
            </div>`).join('')}</div>`}
      </div>
    </div>`);

  /* Los contadores corren en vez de saltar. Es la diferencia entre una cifra
     que se lee y una que aparece ya puesta y nadie mira. */
  countTo(document.getElementById('c-pac'), r.pacientes);
  countTo(document.getElementById('c-rec'), r.recetas);
  countTo(document.getElementById('c-hoy'), r.recetasHoy);
  countTo(document.getElementById('c-ord'), r.ordenes);
  countTo(document.getElementById('c-evo'), r.evoluciones);

  trazar(document.getElementById('t-traza'), serie.map((x) => x.n));

  /* Los listeners van sobre nodos que mueren con el próximo pintado, nunca
     delegados en #view: ese elemento sobrevive y los acumularía. */
  document.getElementById('t-nueva').onclick = () => Router.go('receta');
  document.getElementById('t-orden').onclick = () => Router.go('orden');
  document.getElementById('t-todas').onclick = () => Router.go('recetas');
  document.getElementById('t-ajustes')?.addEventListener('click', () => Router.go('ajustes'));

  const activable = (sel, ir) => {
    for (const el of document.querySelectorAll(sel)) {
      el.addEventListener('click', () => ir(el));
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ir(el); }
      });
    }
  };
  activable('[data-receta]', (el) => Router.go('recetas', el.dataset.receta));
  activable('.rx-turno[data-ficha]', (el) => el.dataset.ficha && Router.go('ficha', el.dataset.ficha));
}

/* ── La curva ──────────────────────────────────────────────────────────────────
   Recetas por día, con un barrido que la recorre como un monitor: un tramo
   encendido que avanza de izquierda a derecha y deja la curva quieta atrás.
   El color sale de los tokens (el acento), no está escrito acá. El bucle se
   corta solo cuando el lienzo deja de estar en la página, y con movimiento
   reducido la curva queda quieta. */
function trazar(cv, datos) {
  if (!cv || !datos.length) return;
  const css = getComputedStyle(document.documentElement);
  const acc = css.getPropertyValue('--op-accent-rgb').trim().split(/\s+/).join(',') || '94,234,212';
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tope = Math.max(4, ...datos) * 1.15;
  const t0 = performance.now();

  function dibujar(fase) {
    const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    if (!r.width) return;
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d'), pad = 10 * dpr;
    g.clearRect(0, 0, W, H);
    const x = (i) => pad + (i / Math.max(1, datos.length - 1)) * (W - 2 * pad);
    const y = (v) => H - pad - (v / tope) * (H - 2 * pad);

    g.strokeStyle = 'rgba(255,255,255,.05)';
    g.lineWidth = dpr;
    for (let k = 0; k <= 3; k++) {
      const yy = Math.round(pad + (k / 3) * (H - 2 * pad)) + 0.5;
      g.beginPath(); g.moveTo(pad, yy); g.lineTo(W - pad, yy); g.stroke();
    }

    /* Curva monótona entre días vecinos: los puntos de control comparten la x
       media, así la línea no pasa nunca por debajo de cero entre dos días. */
    const camino = new Path2D();
    datos.forEach((v, i) => {
      if (!i) { camino.moveTo(x(0), y(v)); return; }
      const xm = (x(i - 1) + x(i)) / 2;
      camino.bezierCurveTo(xm, y(datos[i - 1]), xm, y(v), x(i), y(v));
    });
    const relleno = new Path2D(camino);
    relleno.lineTo(x(datos.length - 1), H - pad);
    relleno.lineTo(x(0), H - pad);
    relleno.closePath();
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, `rgba(${acc},.16)`);
    grad.addColorStop(1, `rgba(${acc},0)`);
    g.fillStyle = grad;
    g.fill(relleno);
    g.lineJoin = 'round';
    g.lineWidth = 1.6 * dpr;
    g.strokeStyle = `rgba(${acc},.55)`;
    g.stroke(camino);

    if (fase != null) {
      const bx = pad + fase * (W - 2 * pad), ancho = 70 * dpr;
      const luz = g.createLinearGradient(bx - ancho, 0, bx, 0);
      luz.addColorStop(0, `rgba(${acc},0)`);
      luz.addColorStop(1, 'rgba(220,255,247,1)');
      g.save();
      g.beginPath(); g.rect(bx - ancho, 0, ancho, H); g.clip();
      g.shadowColor = `rgba(${acc},.9)`; g.shadowBlur = 12 * dpr;
      g.strokeStyle = luz; g.lineWidth = 2.2 * dpr;
      g.stroke(camino);
      g.restore();
    }

    // Hoy, el último punto.
    const lx = x(datos.length - 1), ly = y(datos[datos.length - 1]);
    g.beginPath(); g.arc(lx, ly, 3.4 * dpr, 0, Math.PI * 2);
    g.fillStyle = `rgb(${acc})`; g.shadowColor = `rgba(${acc},.9)`; g.shadowBlur = 10 * dpr;
    g.fill(); g.shadowBlur = 0;
  }

  if (quieto) { dibujar(null); new ResizeObserver(() => dibujar(null)).observe(cv); return; }
  (function bucle(t) {
    if (!cv.isConnected) return;
    // Barre en 3,2 s y descansa un cuarto de vuelta antes de volver a empezar.
    const u = ((t - t0) / 3200) % 1.25;
    dibujar(u <= 1.02 ? u : null);
    requestAnimationFrame(bucle);
  })(t0);
}
