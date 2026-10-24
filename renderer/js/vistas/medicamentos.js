/* Catálogo de medicamentos frecuentes. No es un vademécum: es la lista corta
   de lo que esta doctora receta seguido, para no tipearlo cada vez. Se ordena
   por uso, así los de todos los días flotan arriba solos.

   ── Carpetas ────────────────────────────────────────────────────────────────
   A la izquierda, con el criterio que se le ocurra a quien las arma (Fran,
   23/10/2026). Un solo nivel, y cada medicamento en UNA carpeta o en ninguna
   (db.cjs, esquema 3). Todo se acomoda arrastrando: un medicamento se suelta
   sobre una carpeta para guardarlo ahí (o sobre «No folder» para sacarlo), y
   las carpetas se reordenan con su manija, como los ítems de la receta. Para
   el que no arrastra, «Move to folder» en la fila hace lo mismo.

   La vista se pinta una vez y después se pone al día por partes (reconcile,
   contador, frase): mover un medicamento no repinta la vista entera. */

import { Modal, Toast, Menu, Tooltip } from '../overlays.js';
import { Icons } from '../icons.js';
import Router from '../router.js';
import { paint, head, esc, empty, attempt } from '../ui.js';
import { reconcile, contador, frase } from '../motion.js';
import { plural } from '../format.js';
import { reordenable } from '../reordenar.js';

const rx = window.rx;

/* La carpeta que se está mirando sobrevive a ir y volver de la vista: quien
   está ordenando una carpeta vuelve a encontrarla abierta. */
const TODAS = 'todas';
const SIN = 'sin';
let actual = TODAS;

/* Lo mismo que normalizar() de db.cjs, que es como se guarda `busqueda`: sin
   acentos ni puntuación, en minúsculas. La lista se filtra acá, sin volver a
   la base en cada tecla. */
const DIACRITICOS = new RegExp(
  '[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
const normalizar = (s) => String(s || '').normalize('NFD').replace(DIACRITICOS, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function formulario(m = {}) {
  const caja = document.createElement('div');
  caja.className = 'op-col';
  caja.style.gap = 'var(--op-3)';
  caja.innerHTML = `
    <div class="op-field">
      <label class="op-field__label" for="m-nombre">Name and presentation</label>
      <input class="op-input" id="m-nombre" spellcheck="false"
             placeholder="Sertralina 50 mg" value="${esc(m.nombre || '')}">
    </div>
    <div class="rx-fila--dos" style="display:grid;gap:var(--op-3)">
      <div class="op-field">
        <label class="op-field__label" for="m-marca">Suggested brand</label>
        <input class="op-input" id="m-marca" spellcheck="false" value="${esc(m.marca || '')}">
      </div>
      <div class="op-field">
        <label class="op-field__label" for="m-dosis">Dose</label>
        <input class="op-input" id="m-dosis" spellcheck="false"
               placeholder="1 comp. cada 12 h" value="${esc(m.dosis || '')}">
      </div>
    </div>
    <div class="op-field">
      <label class="op-field__label" for="m-diag">Usual diagnosis</label>
      <input class="op-input" id="m-diag" spellcheck="false"
             placeholder="F31 — Trastorno bipolar" value="${esc(m.diagnostico || '')}">
    </div>
    <div class="op-field">
      <label class="op-field__label" for="m-ind">Instructions</label>
      <input class="op-input" id="m-ind" spellcheck="false"
             placeholder="2 comprimidos por día" value="${esc(m.indicaciones || '')}">
    </div>
    <div class="op-field">
      <label class="op-field__label" for="m-env">Default packs</label>
      <input class="op-input op-input--mono" id="m-env" type="number" min="1"
             style="max-width:110px" value="${esc(m.envases ?? 1)}">
    </div>`;
  return caja;
}

/** `carpeta`: la carpeta abierta, donde va a parar uno nuevo. */
async function editar(m, carpeta = null) {
  const cuerpo = formulario(m);
  const val = await Modal.show({
    title: m?.id ? 'Edit medication' : 'New medication',
    sub: !m?.id && carpeta ? `It goes in the folder "${carpeta.nombre}".` : undefined,
    body: cuerpo,
    width: 520,
    actions: [
      { label: 'Cancel', value: null },
      { label: 'Save', value: 'ok', variant: 'primary' },
    ],
  });
  if (val !== 'ok') return false;

  const datos = {
    id: m?.id,
    nombre: cuerpo.querySelector('#m-nombre').value,
    marca: cuerpo.querySelector('#m-marca').value,
    dosis: cuerpo.querySelector('#m-dosis').value,
    diagnostico: cuerpo.querySelector('#m-diag').value,
    indicaciones: cuerpo.querySelector('#m-ind').value,
    envases: cuerpo.querySelector('#m-env').value,
    carpeta_id: m?.id ? undefined : carpeta?.id,
  };
  const ok = await attempt(() => rx.medicamentos.save(datos), { errorTitle: 'Could not save' });
  return ok != null;
}

export async function vistaMedicamentos(param) {
  // El router manda null cuando no hay parámetro: el valor por defecto no alcanza.
  const busqueda = typeof param === 'string' ? param : '';
  const V = { meds: [], carpetas: [], busqueda, nueva: false };

  async function cargar() {
    [V.meds, V.carpetas] = await Promise.all([rx.medicamentos.list({}), rx.carpetas.list()]);
    if (actual !== TODAS && actual !== SIN && !V.carpetas.some((c) => c.id === actual)) actual = TODAS;
  }
  await cargar();

  const titulo = () => (actual === TODAS ? 'All medications' : actual === SIN ? 'No folder'
    : V.carpetas.find((c) => c.id === actual)?.nombre || '');

  const subtitulo = () => (V.meds.length
    /* `plural()` ya trae el número adelante: no se le antepone otro. */
    ? `${plural(V.meds.length, 'medication')} in the catalog`
    : 'The ones you use often, so you never type them again');

  paint(head({
    title: 'Medications',
    sub: subtitulo(),
    actions: `<button class="op-btn op-btn--primary op-flashable" id="m-nuevo">
                <i data-icon="plus"></i> New</button>`,
  }) + `
    <div class="rx-catalogo op-grow">
      <aside class="rx-carpetas" id="m-carpetas" aria-label="Folders">
        <div class="rx-carpetas__fijas" id="m-fijas">
          ${filaFija(TODAS, 'layers', 'All')}
          ${filaFija(SIN, 'inbox', 'No folder')}
        </div>
        <div class="rx-carpetas__rotulo">Folders</div>
        <div class="op-scroll rx-carpetas__scroll" id="m-carpetas-scroll">
          <div class="rx-carpetas__lista" id="m-carpetas-lista"></div>
        </div>
        <button type="button" class="rx-carpeta rx-carpeta--nueva" id="m-carpeta-nueva">
          <i data-icon="plus"></i><span class="rx-carpeta__nombre">New folder</span>
        </button>
      </aside>
      <section class="rx-catalogo__main">
        <div class="rx-catalogo__cabeza">
          <div class="rx-catalogo__titulo" id="m-titulo">${esc(titulo())}</div>
          <div class="op-inputwrap rx-buscador">
            <i data-icon="search"></i>
            <input class="op-input" id="m-buscar" placeholder="Search…" spellcheck="false"
                   value="${esc(busqueda)}">
          </div>
        </div>
        <div class="op-scroll op-grow op-scroll--line-bottom" id="m-scroll">
          <div class="op-list rx-meds" id="m-lista"></div>
        </div>
      </section>
    </div>`);

  const elSub = document.querySelector('.op-viewhead__sub');
  const elFijas = document.getElementById('m-fijas');
  const elCarpetas = document.getElementById('m-carpetas-lista');
  const elAside = document.getElementById('m-carpetas');
  const elLista = document.getElementById('m-lista');
  const elTitulo = document.getElementById('m-titulo');

  /* ── Pintar ──────────────────────────────────────────────────────────── */

  const carpetaDe = (cid) => V.carpetas.find((c) => c.id === cid) || null;
  const cuantos = (cid) => V.meds.filter((m) => (cid === TODAS ? true : cid === SIN ? !m.carpeta_id : m.carpeta_id === cid)).length;

  function filaFija(cid, icono, nombre) {
    return `
      <div class="rx-carpeta" data-carpeta="${cid}" data-destino="${cid === SIN ? SIN : ''}" role="button" tabindex="0">
        <span></span>
        <span class="rx-carpeta__icono"><i data-icon="${icono}"></i></span>
        <span class="rx-carpeta__nombre">${esc(nombre)}</span>
        <span class="rx-carpeta__fin"><span class="rx-carpeta__cuenta"></span></span>
      </div>`;
  }

  /* `nueva`: la fila de una carpeta que todavía no existe, con el nombre por
     escribir. No se reordena ni recibe medicamentos hasta guardarse. */
  function filaCarpeta(c, nueva = false) {
    return `
      <div class="rx-carpeta rx-carpeta--propia${nueva ? ' is-nueva' : ''}" data-carpeta="${esc(c.id)}" data-destino="${esc(c.id)}" role="button" tabindex="0">
        <button type="button" class="rx-carpeta__asa" data-asa tabindex="-1"
                data-tip="Drag to reorder" data-tip-key="Alt + arrows"><i data-icon="grip"></i></button>
        <span class="rx-carpeta__icono"><i data-icon="folder"></i></span>
        <span class="rx-carpeta__nombre">${esc(c.nombre)}</span>
        <span class="rx-carpeta__fin">
          <span class="rx-carpeta__cuenta"></span>
          <span class="rx-carpeta__acciones">
            <button type="button" class="op-iconbtn op-iconbtn--sm" data-renombrar
                    data-tip="Rename"><i data-icon="edit"></i></button>
            <button type="button" class="op-iconbtn op-iconbtn--sm" data-borrar-carpeta
                    data-tip="Delete folder"><i data-icon="trash"></i></button>
          </span>
        </span>
      </div>`;
  }

  /** Lo que cambia de una carpeta sin rehacerla: si está abierta, el nombre y
      la cuenta. La cuenta se pone al día con su destello, que es lo que avisa
      adónde fue a parar lo que se soltó. */
  function ponerCarpeta(el, cid, nombre) {
    el.dataset.carpeta = cid;
    if (el.dataset.destino) el.dataset.destino = cid;
    if (cid !== 'nueva') el.classList.remove('is-nueva');
    el.classList.toggle('is-activa', cid === actual);
    el.setAttribute('aria-current', cid === actual ? 'true' : 'false');
    const elNombre = el.querySelector('.rx-carpeta__nombre');
    if (nombre != null && !el.classList.contains('is-editando')) frase(elNombre, esc(nombre), { destello: false });
    contador(el.querySelector('.rx-carpeta__cuenta'), cuantos(cid));
  }

  function pintarCarpetas() {
    for (const el of elFijas.children) ponerCarpeta(el, el.dataset.carpeta);
    const items = V.carpetas.map((c) => ({ key: c.id, html: filaCarpeta(c), c }));
    if (V.nueva) items.push({ key: 'nueva', html: filaCarpeta({ id: 'nueva', nombre: '' }, true), c: null });
    reconcile(elCarpetas, items, {
      created: (el, it) => {
        Icons.mount(el);
        if (!it.c) renombrar(el, null);
      },
      update: () => {},
    });
    /* Todas, no solo las que reconcile() vio cambiar: la cuenta y cuál está
       abierta no van en el html de la fila, así que para reconcile una carpeta
       que ganó un medicamento es la misma de antes. */
    for (const el of elCarpetas.children) {
      const c = el.dataset.state !== 'closing' && carpetaDe(el.dataset.key);
      if (c) ponerCarpeta(el, c.id, c.nombre);
    }
  }

  function filaMed(m) {
    const carpeta = actual === TODAS && m.carpeta_id ? carpetaDe(m.carpeta_id) : null;
    return `
      <div class="op-listitem rx-med" data-med="${esc(m.id)}">
        <button type="button" class="rx-med__asa" data-llevar tabindex="-1"
                data-tip="Drag to a folder"><i data-icon="grip"></i></button>
        <div class="op-iconcell"><i data-icon="pill"></i></div>
        <div class="op-listitem__main">
          <div class="op-listitem__title">${esc(m.nombre)}</div>
          <div class="op-listitem__sub op-truncate">${[
            m.marca && `Brand: ${m.marca}`,
            m.dosis,
            m.indicaciones,
          ].filter(Boolean).map(esc).join(' · ') || '—'}</div>
        </div>
        <div class="op-listitem__aside">
          ${carpeta ? `<span class="op-chip rx-med__carpeta"><i data-icon="folder"></i>${esc(carpeta.nombre)}</span>` : ''}
          ${m.usos > 0 ? `<span class="op-chip op-chip--mono" data-tip="Times you prescribed it">${m.usos}</span>` : ''}
        </div>
        <div class="op-rowactions">
          <button class="op-iconbtn op-iconbtn--sm" data-mover="${esc(m.id)}"
                  data-tip="Move to folder"><i data-icon="folder"></i></button>
          <button class="op-iconbtn op-iconbtn--sm" data-editar="${esc(m.id)}"
                  data-tip="Edit"><i data-icon="edit"></i></button>
          <button class="op-iconbtn op-iconbtn--sm" data-borrar="${esc(m.id)}"
                  data-tip="Delete"><i data-icon="trash"></i></button>
        </div>
      </div>`;
  }

  function vacio() {
    const c = carpetaDe(actual);
    if (V.busqueda.trim()) return { title: 'Nothing matches that search', text: '' };
    if (actual === TODAS) {
      return { title: 'The catalog is empty', text: 'Add the ones you prescribe often and they will show up here.' };
    }
    if (actual === SIN) {
      return V.meds.length
        ? { title: 'Every medication is in a folder', text: 'Drag one here to take it out of its folder.' }
        : { title: 'The catalog is empty', text: 'Add the ones you prescribe often and they will show up here.' };
    }
    return { title: `"${c?.nombre}" is empty`, text: 'Drag medications here from the list, or create one with New while this folder is open.' };
  }

  function pintarLista() {
    const q = normalizar(V.busqueda);
    const visibles = V.meds.filter((m) => (actual === TODAS || (actual === SIN ? !m.carpeta_id : m.carpeta_id === actual))
      && (!q || String(m.busqueda || '').includes(q)));
    let items;
    if (visibles.length) {
      items = visibles.map((m) => ({ key: m.id, html: filaMed(m) }));
    } else {
      const v = vacio();
      // La clave es el texto: si cambia el motivo, uno sale y el otro entra.
      items = [{ key: `vacio:${v.title}`, html: `<div class="rx-meds__vacio">${empty({ icon: 'pill', ...v })}</div>` }];
    }
    reconcile(elLista, items, { created: (el) => Icons.mount(el) });
  }

  function pintarTitulo() {
    frase(elTitulo, esc(titulo()), { destello: false });
  }

  function pintar() {
    pintarCarpetas();
    pintarLista();
    pintarTitulo();
    frase(elSub, esc(subtitulo()));
  }

  pintar();

  /* ── Elegir carpeta ──────────────────────────────────────────────────── */

  function abrir(cid) {
    if (cid === actual || cid === 'nueva') return;
    actual = cid;
    pintar();
    document.getElementById('m-scroll').scrollTop = 0;
  }

  elAside.addEventListener('click', (e) => {
    if (e.target.closest('button, input')) return;
    const f = e.target.closest('[data-carpeta]');
    if (f) abrir(f.dataset.carpeta);
  });
  elAside.addEventListener('dblclick', (e) => {
    const f = e.target.closest('.rx-carpeta--propia');
    if (f && e.target.closest('.rx-carpeta__nombre') && !f.classList.contains('is-editando')) {
      renombrar(f, carpetaDe(f.dataset.carpeta));
    }
  });
  elAside.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || e.target.matches('input, button')) return;
    const f = e.target.closest('[data-carpeta]');
    if (!f) return;
    e.preventDefault();
    abrir(f.dataset.carpeta);
  });

  /* ── Crear, renombrar, borrar y reordenar carpetas ───────────────────── */

  /** El nombre se edita en la fila misma. `c` null es una carpeta nueva: la
      fila ya está en la lista, con la clave 'nueva', y al guardar pasa a ser
      la de verdad sin salir y volver a entrar. */
  function renombrar(el, c) {
    if (el.classList.contains('is-editando')) return;
    el.classList.add('is-editando');
    const elNombre = el.querySelector('.rx-carpeta__nombre');
    const input = document.createElement('input');
    input.className = 'rx-carpeta__input';
    input.spellcheck = false;
    input.placeholder = 'Folder name';
    input.value = c?.nombre || '';
    input.setAttribute('aria-label', 'Folder name');
    elNombre.after(input);
    input.focus();
    input.select();

    let listo = false;
    const terminar = () => {
      listo = true;
      input.remove();
      el.classList.remove('is-editando');
    };
    const cancelar = () => {
      if (listo) return;
      terminar();
      if (!c) { V.nueva = false; pintarCarpetas(); }
    };
    const guardar = async () => {
      if (listo) return;
      const nombre = input.value.trim();
      if (!nombre || nombre === c?.nombre) { cancelar(); return; }
      listo = true;
      const r = await attempt(() => rx.carpetas.save({ id: c?.id, nombre }),
        { errorTitle: c ? 'Could not rename the folder' : 'Could not create the folder' });
      if (!r) {
        // Sigue editando: el nombre que se tipeó no se pierde por un repetido.
        listo = false;
        input.focus();
        return;
      }
      terminar();
      if (c) {
        Object.assign(c, r);
      } else {
        V.nueva = false;
        V.carpetas.push(r);
        el.dataset.key = r.id;
        actual = r.id;
      }
      pintar();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();   // Alt+flechas y Enter son del campo, no de la fila
      if (e.key === 'Enter') { e.preventDefault(); guardar(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelar(); }
    });
    input.addEventListener('blur', () => { if (!listo) guardar(); });
  }

  document.getElementById('m-carpeta-nueva').onclick = () => {
    if (V.nueva) {
      elCarpetas.querySelector('[data-key="nueva"] input')?.focus();
      return;
    }
    V.nueva = true;
    pintarCarpetas();
    elCarpetas.querySelector('[data-key="nueva"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  elCarpetas.addEventListener('click', async (e) => {
    const f = e.target.closest('.rx-carpeta--propia');
    if (!f) return;
    const c = carpetaDe(f.dataset.carpeta);
    if (e.target.closest('[data-renombrar]') && c) renombrar(f, c);
    if (e.target.closest('[data-borrar-carpeta]') && c) {
      const n = cuantos(c.id);
      const ok = await Modal.confirm({
        title: 'Delete folder',
        sub: n
          ? `"${c.nombre}" is deleted. Its ${plural(n, 'medication')} stay in the catalog, with no folder.`
          : `"${c.nombre}" is empty: nothing else changes.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      const r = await attempt(() => rx.carpetas.remove(c.id), { errorTitle: 'Could not delete the folder' });
      if (r == null) return;
      V.carpetas = V.carpetas.filter((x) => x !== c);
      for (const m of V.meds) if (m.carpeta_id === c.id) m.carpeta_id = null;
      if (actual === c.id) actual = TODAS;
      pintar();
      Toast.show({ title: 'Folder deleted', text: c.nombre, icon: 'trash' });
    }
  });

  reordenable(elCarpetas, {
    fila: '.rx-carpeta--propia:not(.is-nueva)',
    scroller: document.getElementById('m-carpetas-scroll'),
    onMove(desde, hasta) {
      const [c] = V.carpetas.splice(desde, 1);
      V.carpetas.splice(hasta, 0, c);
      attempt(() => rx.carpetas.ordenar(V.carpetas.map((x) => x.id)),
        { errorTitle: 'Could not save the order' });
    },
  });

  /* ── Guardar un medicamento en una carpeta ───────────────────────────── */

  async function mover(m, cid) {
    if ((m.carpeta_id || null) === (cid || null)) return;
    const r = await attempt(() => rx.medicamentos.mover(m.id, cid), { errorTitle: 'Could not move it' });
    if (!r) { pintar(); return; }
    m.carpeta_id = r.carpeta_id;
    pintar();
  }

  llevarACarpetas(elLista, elAside, {
    medDe: (id) => V.meds.find((m) => m.id === id),
    destinoValido: (m, cid) => cid !== 'nueva' && (cid === SIN ? !!m.carpeta_id : m.carpeta_id !== cid),
    alSoltar: (m, cid) => mover(m, cid === SIN ? null : cid),
  });

  /* ── El catálogo ─────────────────────────────────────────────────────── */

  const buscar = document.getElementById('m-buscar');
  let reloj = null;
  buscar.addEventListener('input', () => {
    clearTimeout(reloj);
    reloj = setTimeout(() => { V.busqueda = buscar.value; pintarLista(); }, 120);
  });
  Router.onLeave(() => clearTimeout(reloj));

  async function recargar() {
    await cargar();
    pintar();
  }

  document.getElementById('m-nuevo').onclick = async () => {
    if (await editar({}, carpetaDe(actual))) recargar();
  };

  elLista.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-editar], [data-borrar], [data-mover]');
    if (!b) return;
    const m = V.meds.find((x) => x.id === (b.dataset.editar || b.dataset.borrar || b.dataset.mover));
    if (!m) return;

    if (b.dataset.editar) {
      if (await editar(m)) recargar();
    } else if (b.dataset.mover) {
      if (!V.carpetas.length) {
        Toast.show({ title: 'There are no folders yet', text: 'Create one with New folder, on the left.', icon: 'folder' });
        return;
      }
      Menu.show(b, [
        ...V.carpetas.map((c) => ({
          label: c.nombre, icon: 'folder', selected: m.carpeta_id === c.id, onSelect: () => mover(m, c.id),
        })),
        { sep: true },
        { label: 'No folder', icon: 'inbox', selected: !m.carpeta_id, onSelect: () => mover(m, null) },
      ], { align: 'end' });
    } else {
      const ok = await Modal.confirm({
        title: 'Remove from the catalog',
        sub: `"${m.nombre}" is taken off the list. Prescriptions already issued are not touched.`,
        confirmLabel: 'Remove',
        danger: true,
      });
      if (!ok) return;
      const r = await attempt(() => rx.medicamentos.remove(m.id), { errorTitle: 'Could not remove' });
      if (r == null) return;
      Toast.show({ title: 'Removed', text: m.nombre, icon: 'trash' });
      recargar();
    }
  });
}

/* ══ Llevar un medicamento a una carpeta ══════════════════════════════════
   La fila se agarra de su manija y lo que viaja con el mouse es una ficha
   sólida con el nombre (como todo lo que flota), no el fantasma nativo de
   Chromium, que no se puede estilar. La fila queda en su lugar a media luz.
   Las carpetas que la pueden recibir se encienden al pasar por encima; la que
   ya la tiene no cuenta. Al soltar sobre una, la ficha se mete en ella; en
   cualquier otro lado (o con Esc), vuelve a la fila y se apaga. */
function llevarACarpetas(lista, aside, { medDe, destinoValido, alSoltar }) {
  const UMBRAL = 4;       // px antes de que un clic en la manija pase a ser arrastre
  let d = null;

  const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tiempo = () => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--op-t-3').trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? (/ms$/.test(v) ? n : n * 1000) : 280;
  };
  const curva = () => getComputedStyle(document.documentElement).getPropertyValue('--op-ease').trim()
    || 'cubic-bezier(.16, 1, .3, 1)';

  function empezar() {
    const { fila, m } = d;
    const ficha = document.createElement('div');
    ficha.className = 'rx-ficha';
    ficha.innerHTML = `<i data-icon="pill"></i><span>${esc(m.nombre)}</span>`;
    Icons.mount(ficha);
    document.body.append(ficha);
    d.ficha = ficha;
    d.tip = d.asa.dataset.tip;
    delete d.asa.dataset.tip;
    Tooltip.hide(true);
    fila.classList.add('is-llevada');
    aside.classList.add('is-recibiendo');
    document.documentElement.classList.add('rx-agarrando');
    ficha.animate([{ opacity: 0, transform: `${pos()} scale(.96)` }, { opacity: 1, transform: `${pos()} scale(1)` }],
      { duration: 160, easing: curva() });
    seguir();
  }

  const pos = () => `translate(${d.x + 12}px, ${d.y + 10}px)`;

  function seguir() {
    d.ficha.style.transform = pos();
    const bajo = document.elementFromPoint(d.x, d.y);
    const f = bajo?.closest('[data-destino]');
    const cid = f && aside.contains(f) ? f.dataset.destino : '';
    const destino = cid && destinoValido(d.m, cid) ? f : null;
    if (destino !== d.destino) {
      d.destino?.classList.remove('is-destino');
      destino?.classList.add('is-destino');
      d.destino = destino;
    }
  }

  function soltar(cancelar) {
    if (!d) return;
    const { ficha, fila, asa, destino, m, id } = d;
    if (d.tip) asa.dataset.tip = d.tip;
    try { asa.releasePointerCapture(id); } catch { /* ya se había soltado */ }
    document.removeEventListener('keydown', alEsc, true);
    removeEventListener('pointermove', alMover, true);
    removeEventListener('pointerup', alSoltarMouse, true);
    removeEventListener('pointercancel', alCancelar, true);
    d = null;
    if (!ficha) return;   // fue un clic, no un arrastre

    document.documentElement.classList.remove('rx-agarrando');
    aside.classList.remove('is-recibiendo');
    destino?.classList.remove('is-destino');
    const desde = ficha.style.transform;
    const fin = () => ficha.remove();

    if (destino && !cancelar) {
      /* Entra en la carpeta: viaja a su centro, se achica y se apaga. La fila
         la saca (o la deja, en All) la vista al ponerse al día. */
      const r = destino.getBoundingClientRect();
      const fr = ficha.getBoundingClientRect();
      const x = r.left + r.width / 2 - fr.width / 2;
      const y = r.top + r.height / 2 - fr.height / 2;
      /* La fila sigue a media luz hasta que la vista se pone al día: si se va
         de la carpeta abierta, sale desde ahí; si se queda (en All), se enciende. */
      Promise.resolve(alSoltar(m, destino.dataset.destino)).finally(() => fila.classList.remove('is-llevada'));
      if (reducido()) { fin(); return; }
      ficha.animate([
        { transform: desde, opacity: 1 },
        { transform: `translate(${x}px, ${y}px) scale(.55)`, opacity: 0 },
      ], { duration: tiempo(), easing: curva(), fill: 'forwards' }).finished.then(fin, fin);
    } else {
      // De vuelta a la fila, de donde salió.
      const r = fila.getBoundingClientRect();
      fila.classList.remove('is-llevada');
      if (reducido()) { fin(); return; }
      ficha.animate([
        { transform: desde, opacity: 1 },
        { transform: `translate(${r.left + 40}px, ${r.top + 8}px) scale(.96)`, opacity: 0 },
      ], { duration: tiempo(), easing: curva(), fill: 'forwards' }).finished.then(fin, fin);
    }
  }

  function alEsc(e) {
    if (e.key !== 'Escape' || !d) return;
    e.preventDefault();
    e.stopPropagation();   // que no cierre nada más: el Esc era para el arrastre
    soltar(true);
  }

  lista.addEventListener('pointerdown', (e) => {
    const asa = e.target.closest('[data-llevar]');
    if (!asa || e.button !== 0 || d) return;
    const fila = asa.closest('[data-med]');
    const m = fila && medDe(fila.dataset.med);
    if (!m) return;
    e.preventDefault();
    /* El arrastre se sigue desde window y no desde la lista: el viaje termina
       en la otra columna, y la captura del puntero sobre la manija no siempre
       se sostiene (con el mouse del humo se perdía en el primer movimiento y
       la ficha quedaba colgada). La captura queda solo para cuando el mouse
       sale de la ventana. */
    try { asa.setPointerCapture(e.pointerId); } catch { /* sin captura igual anda */ }
    d = { asa, fila, m, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, ficha: null, destino: null };
    document.addEventListener('keydown', alEsc, true);
    addEventListener('pointermove', alMover, true);
    addEventListener('pointerup', alSoltarMouse, true);
    addEventListener('pointercancel', alCancelar, true);
  });

  function alMover(e) {
    if (!d || e.pointerId !== d.id) return;
    d.x = e.clientX;
    d.y = e.clientY;
    if (!d.ficha) {
      if (Math.hypot(d.x - d.x0, d.y - d.y0) < UMBRAL) return;
      empezar();
      return;
    }
    seguir();
  }
  function alSoltarMouse(e) { if (d && e.pointerId === d.id) soltar(false); }
  function alCancelar(e) { if (d && e.pointerId === d.id) soltar(true); }
  Router.onLeave(() => soltar(true));
}
