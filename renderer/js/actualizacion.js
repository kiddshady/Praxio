/* ═══════════════════════════════════════════════════════════════════════════
   Praxio — actualizaciones (renderer)

   El proceso principal descarga; acá se presenta el estado en tres lugares:
   statusbar, toast al quedar lista y controles dentro de Ajustes. El chequeo
   automático es silencioso cuando la app ya está al día.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from './icons.js';
import { Toast } from './overlays.js';
import Router from './router.js';
import { esc } from './ui.js';
import { swap, deslizarAncho, frase, roll } from './motion.js';
import { fmtBytes, relTime } from './format.js';

const rx = window.rx;

let estado = { fase: 'inactivo', manual: false };
let avisada = null;
const oyentes = new Set();

export function estadoActualizacion() { return estado; }

export function onActualizacion(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export function describirEstado(e = estado) {
  switch (e.fase) {
    case 'buscando': return 'Checking…';
    case 'al-dia': return `Up to date${e.revisado ? ` · checked ${relTime(e.revisado)}` : ''}.`;
    case 'disponible': return `A new version is out, ${e.nueva}. It is downloading.`;
    case 'descargando': return `Downloading ${e.nueva}: ${Math.round(e.progreso || 0)} %${e.velocidad ? ` · ${fmtBytes(e.velocidad)}/s` : ''}.`;
    case 'listo': return `${e.nueva} is downloaded. It installs when you restart.`;
    case 'error': return `Could not check: ${e.error || 'unknown error'}.`;
    default:
      return e.motivo === 'dev'
        ? 'Automatic updates only run in the installed app.'
        : 'Not checked yet.';
  }
}

const velocidadDe = (e) => (e.velocidad ? ` · ${fmtBytes(e.velocidad)}/s` : '');

/**
 * La línea de estado de Ajustes. Cada fase nueva es un relevo (frase). Bajando,
 * la frase queda armada y el porcentaje corre (roll) en su span, en el lugar y
 * sin destello. Antes iba entera por frase(): como solo cambiaban las cifras,
 * destellaba en el acento con cada aviso de la descarga, varias veces por
 * segundo, y el número titilaba sin parar.
 */
export function pintarEstado(el, e = estado) {
  if (!el) return;
  const nueva = String(e.nueva || '');
  if (e.fase === 'descargando' && el.dataset.fase === 'descargando' && el.dataset.nueva === nueva) {
    // `:scope >`: durante el relevo, la frase de antes sigue en el calco que se va.
    const pct = el.querySelector(':scope > [data-pct]');
    if (pct) {
      roll(pct, Math.round(e.progreso || 0), (v) => { pct.textContent = String(Math.round(v)); },
        { from: parseInt(pct.textContent, 10) });
      const vel = el.querySelector(':scope > [data-vel]');
      if (vel) vel.textContent = velocidadDe(e);
      return;
    }
  }
  el.dataset.fase = e.fase || '';
  el.dataset.nueva = nueva;
  frase(el, e.fase === 'descargando'
    ? `Downloading ${esc(nueva)}: <span class="op-num" data-pct>${Math.round(e.progreso || 0)}</span> %`
      + `<span data-vel>${esc(velocidadDe(e))}</span>.`
    : esc(describirEstado(e)));
}

function pintarStatusbar() {
  const el = document.getElementById('stat-update');
  if (!el) return;
  const f = estado.fase;
  const visible = f === 'disponible' || f === 'descargando' || f === 'listo'
    || (f === 'buscando' && estado.manual);
  el.hidden = !visible;
  if (!visible) return;

  const texto = {
    buscando: 'checking for updates…',
    disponible: `Praxio ${estado.nueva} available`,
    descargando: `downloading ${estado.nueva}`,
    listo: `Restart and update to ${estado.nueva}`,
  }[f];
  el.classList.toggle('is-lista', f === 'listo');
  /* El rótulo cambia por relevo y el ancho del ítem viaja, en vez de saltar y
     empujar lo de al lado. El avance de la descarga NO va en el HTML: con él
     adentro, cada evento de progreso relevaría el aviso entero. Se escribe en
     la barra que ya está. */
  const html = `${Icons.svg(f === 'listo' ? 'retry' : 'download')}`
    + `<span class="op-statusbar__value">${esc(texto)}</span>`
    + (f === 'descargando' ? '<span class="op-meter"><span class="op-meter__fill"></span></span>' : '');
  deslizarAncho(el, () => swap(el, html, { relevo: true }));
  // `:scope >`: durante el relevo, la barra de antes sigue en el calco que se va.
  el.querySelector(':scope > .op-meter')?.style.setProperty('--op-pct', `${Math.round(estado.progreso || 0)}%`);
  el.dataset.tip = f === 'listo'
    ? 'Closes Praxio, installs the new version and opens it again'
    : f === 'descargando'
      ? `${Math.round(estado.progreso || 0)} %${estado.velocidad ? ` · ${fmtBytes(estado.velocidad)}/s` : ''}`
      : 'See in Settings';
}

function aplicar(e) {
  estado = e || { fase: 'inactivo', manual: false };
  pintarStatusbar();

  if (estado.fase === 'listo' && avisada !== estado.nueva) {
    avisada = estado.nueva;
    Toast.show({
      title: `Praxio ${estado.nueva} is ready`,
      text: 'It installs when you restart. Click the notice in the status bar whenever you like.',
      icon: 'download',
      duration: 9000,
    });
  } else if (estado.manual && estado.fase === 'al-dia') {
    Toast.show({ title: 'You are up to date', text: `${estado.version} is the latest version.`, icon: 'check' });
  } else if (estado.manual && estado.fase === 'error') {
    Toast.error('Could not check for updates', estado.error);
  }
  for (const fn of oyentes) fn(estado);
}

export async function buscarActualizacion() {
  if (!rx?.actualizacion) return estado;
  try {
    await rx.actualizacion.buscar();
  } catch (err) {
    aplicar({ ...estado, fase: 'error', error: err.message, manual: true });
  }
  return estado;
}

export function instalarActualizacion() {
  rx?.actualizacion?.instalar();
}

export async function initActualizacion() {
  if (!rx?.actualizacion) return;
  document.getElementById('stat-update')?.addEventListener('click', () => {
    if (estado.fase === 'listo') instalarActualizacion();
    else Router.go('ajustes');
  });
  rx.actualizacion.onEstado(aplicar);
  try {
    aplicar(await rx.actualizacion.estado());
  } catch {
    aplicar({ fase: 'inactivo', manual: false });
  }
}
