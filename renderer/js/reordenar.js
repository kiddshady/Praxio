/* ══ Filas que se reordenan ══════════════════════════════════════════════════
   Los medicamentos de una receta y los estudios de una orden salen impresos en
   el orden de la lista, y ese orden a veces importa: un esquema nuevo se lee
   de arriba abajo (Fran, 23/10/2026). Cada fila tiene una manija a la
   izquierda: se agarra, se arrastra y las demás le hacen lugar; al soltar,
   todas viajan a su lugar desde donde se veían. Con el teclado, Alt+Arriba y
   Alt+Abajo desde cualquier campo de la fila.

   No usa el drag and drop nativo de Chromium: su fantasma translúcido no se
   puede estilar, y lo que se arrastra tiene que ser la fila misma.

     reordenable(box, { onMove(desde, hasta), fila = '.rx-item' })

   `fila` es el selector de las filas: las carpetas de Medications también se
   acomodan con esto.

   onMove cambia el arreglo de la vista y repinta con reconcile(). Cuando llega,
   el DOM ya está en el orden nuevo, así que reconcile() no encuentra nada que
   mover: el viaje lo hace esto, desde donde cada fila se VEÍA (con el arrastre
   aplicado). Si lo hiciera reconcile(), mediría el lugar de antes del arrastre
   y la fila soltada saltaría a su lugar viejo antes de viajar. */

import { Tooltip } from './overlays.js';

const ZONA = 48;          // px desde el borde del scroll donde empieza el auto-scroll
const VEL = 14;           // px por cuadro en el borde mismo

let tokens = null;
function T() {
  if (tokens) return tokens;
  const cs = getComputedStyle(document.documentElement);
  const v = cs.getPropertyValue('--op-t-3').trim();
  const n = parseFloat(v);
  tokens = {
    move: Number.isFinite(n) ? (/ms$/.test(v) ? n : n * 1000) : 280,
    ease: cs.getPropertyValue('--op-ease').trim() || 'cubic-bezier(.16, 1, .3, 1)',
  };
  return tokens;
}

const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Las filas que cuentan: las que se están yendo (reconcile) ya no son de la lista. */
const vivas = (box, fila) => [...box.children].filter((el) => el.matches(fila) && el.dataset.state !== 'closing');

/* Mover un nodo le reinicia las animaciones de CSS: la entrada de la fila
   (rx-item-entra) se volvería a ver. Lo mismo que hace quiet() en reconcile. */
function sinEntrada(el) {
  for (const a of el.getAnimations()) {
    if (a instanceof CSSAnimation && a.effect?.getTiming().iterations !== Infinity) a.cancel();
  }
}

/** Lleva `fila` al lugar `hasta` entre las vivas, moviendo un solo nodo. */
function ubicar(filas, fila, hasta) {
  const resto = filas.filter((f) => f !== fila);
  if (hasta < resto.length) resto[hasta].before(fila);
  else resto[resto.length - 1].after(fila);
  sinEntrada(fila);
}

/* El foco y la selección del campo activo: mover su fila en el DOM se los saca. */
function guardarFoco() {
  const el = document.activeElement;
  if (!el || el === document.body) return () => {};
  const sel = 'selectionStart' in el ? [el.selectionStart, el.selectionEnd] : null;
  return () => {
    if (document.activeElement === el || !el.isConnected) return;
    el.focus({ preventScroll: true });
    if (sel) { try { el.setSelectionRange(...sel); } catch { /* campos sin selección */ } }
  };
}

export function reordenable(box, { onMove, scroller = box.closest('.op-scroll'), fila: FILA = '.rx-item' } = {}) {
  let d = null;   // el arrastre en curso

  /* Mueve `fila` de `desde` a `hasta` y hace viajar a todas desde `vistos`
     (dónde se veía cada una justo antes) hasta su lugar nuevo. */
  function asentar(filas, fila, desde, hasta, vistos) {
    const volverFoco = guardarFoco();
    /* Sin transición mientras se sacan los desplazamientos: .rx-item anima su
       transform por CSS, y acá el viaje lo tiene que hacer el FLIP de abajo. */
    for (const f of filas) { f.style.transition = 'none'; f.style.transform = ''; }
    if (hasta !== desde) {
      ubicar(filas, fila, hasta);
      onMove?.(desde, hasta);
    }
    const llegadas = new Map(filas.map((f) => [f, f.getBoundingClientRect()]));
    for (const f of filas) f.style.transition = '';
    volverFoco();
    if (reducido()) return;
    for (const f of filas) {
      const dy = vistos.get(f).top - llegadas.get(f).top;
      if (Math.abs(dy) < 0.5) continue;
      // En __move, como reconcile(): así la próxima pintada la cancela antes de medir.
      f.__move?.cancel();
      f.__move = f.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
        { duration: T().move, easing: T().ease });
    }
  }

  /* ── Con el mouse ─────────────────────────────────────────────────────── */

  const desplazado = () => (d.y - d.y0) + ((scroller?.scrollTop ?? 0) - d.s0);

  function aplicar() {
    const { rects, desde, filas, fila } = d;
    // No se sale de la lista: ni más arriba que la primera ni más abajo que la última.
    const min = rects[0].top - rects[desde].top;
    const max = rects[rects.length - 1].bottom - rects[desde].bottom;
    const off = Math.max(min, Math.min(max, desplazado()));
    fila.style.transform = `translateY(${off}px)`;
    /* Las demás le hacen lugar en cuanto el centro de la arrastrada pasa el
       suyo. Se corren lo que mide la arrastrada más el hueco entre filas. */
    const centro = (rects[desde].top + rects[desde].bottom) / 2 + off;
    let hasta = desde;
    filas.forEach((f, j) => {
      if (j === desde) return;
      const c = (rects[j].top + rects[j].bottom) / 2;
      let mov = 0;
      /* Con igual: el tope del arrastre deja el centro de la arrastrada justo
         sobre el de la primera o la última, y con < estricto no la pasaba nunca. */
      if (j < desde && centro <= c) { mov = d.paso; hasta = Math.min(hasta, j); }
      if (j > desde && centro >= c) { mov = -d.paso; hasta = Math.max(hasta, j); }
      f.style.transform = mov ? `translateY(${mov}px)` : '';
    });
    d.hasta = hasta;
  }

  /* Cerca del borde de arriba o de abajo, el formulario scrollea solo: una
     receta larga no entra entera en la ventana. */
  function autoScroll() {
    if (!d || !scroller) return;
    const r = scroller.getBoundingClientRect();
    let v = 0;
    if (d.y < r.top + ZONA) v = -VEL * Math.min(1, (r.top + ZONA - d.y) / ZONA);
    else if (d.y > r.bottom - ZONA) v = VEL * Math.min(1, (d.y - (r.bottom - ZONA)) / ZONA);
    if (v) {
      const antes = scroller.scrollTop;
      scroller.scrollTop += v;
      if (scroller.scrollTop !== antes) aplicar();
    }
    d.raf = requestAnimationFrame(autoScroll);
  }

  function soltar(cancelar) {
    if (!d) return;
    const { fila, filas, desde, asa, id } = d;
    const hasta = cancelar ? desde : d.hasta;
    cancelAnimationFrame(d.raf);
    if (d.tip) asa.dataset.tip = d.tip;
    try { asa.releasePointerCapture(id); } catch { /* ya se había soltado */ }
    document.removeEventListener('keydown', alEsc, true);
    const vistos = new Map(filas.map((f) => [f, f.getBoundingClientRect()]));
    d = null;
    box.classList.remove('is-ordenando');
    document.documentElement.classList.remove('rx-agarrando');
    fila.classList.remove('is-arrastrada');
    asentar(filas, fila, desde, hasta, vistos);
  }

  function alEsc(e) {
    if (e.key !== 'Escape' || !d) return;
    e.preventDefault();
    e.stopPropagation();   // que no cierre nada más: el Esc era para el arrastre
    soltar(true);
  }

  box.addEventListener('pointerdown', (e) => {
    const asa = e.target.closest('[data-asa]');
    if (!asa || !box.contains(asa) || e.button !== 0 || d) return;
    const fila = asa.closest(FILA);
    const filas = vivas(box, FILA);
    if (filas.length < 2 || !filas.includes(fila)) return;
    e.preventDefault();
    for (const f of filas) { f.__move?.cancel(); f.__move = null; }
    const rects = filas.map((f) => f.getBoundingClientRect());
    const desde = filas.indexOf(fila);
    const hueco = rects[1].top - rects[0].bottom;
    d = {
      fila, filas, rects, desde, hasta: desde, asa, id: e.pointerId,
      y0: e.clientY, y: e.clientY, s0: scroller?.scrollTop ?? 0,
      paso: rects[desde].height + hueco, raf: 0,
    };
    asa.setPointerCapture(e.pointerId);
    /* Con el puntero capturado, la manija sigue «debajo» del mouse todo el
       arrastre y su tooltip volvía a aparecer donde estaba la fila. */
    d.tip = asa.dataset.tip;
    delete asa.dataset.tip;
    Tooltip.hide(true);
    box.classList.add('is-ordenando');
    document.documentElement.classList.add('rx-agarrando');
    fila.classList.add('is-arrastrada');
    document.addEventListener('keydown', alEsc, true);
    d.raf = requestAnimationFrame(autoScroll);
  });

  box.addEventListener('pointermove', (e) => {
    if (!d || e.pointerId !== d.id) return;
    d.y = e.clientY;
    aplicar();
  });
  box.addEventListener('pointerup', (e) => { if (d && e.pointerId === d.id) soltar(false); });
  box.addEventListener('pointercancel', (e) => { if (d && e.pointerId === d.id) soltar(true); });
  box.addEventListener('lostpointercapture', (e) => { if (d && e.pointerId === d.id) soltar(false); });

  /* ── Con el teclado ───────────────────────────────────────────────────── */

  box.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.shiftKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || d) return;
    const fila = e.target.closest?.(FILA);
    const filas = vivas(box, FILA);
    const desde = filas.indexOf(fila);
    if (desde < 0) return;
    e.preventDefault();
    const hasta = desde + (e.key === 'ArrowUp' ? -1 : 1);
    if (hasta < 0 || hasta >= filas.length) return;
    for (const f of filas) { f.__move?.cancel(); f.__move = null; }
    const vistos = new Map(filas.map((f) => [f, f.getBoundingClientRect()]));
    asentar(filas, fila, desde, hasta, vistos);
  });
}

/** La manija de una fila. Va como primer hijo de la .rx-item. */
export const ASA = `<button type="button" class="rx-item__asa" data-asa tabindex="-1"
  data-tip="Drag to reorder" data-tip-key="Alt + arrows"><i data-icon="grip"></i></button>`;
