/* Recetas: emitir una nueva (con la hoja en vivo al lado) y el historial. */

import { Modal, Toast, Menu } from '../overlays.js';
import { Icons } from '../icons.js';
import Router from '../router.js';
import { paint, head, esc, empty, attempt } from '../ui.js';
import { exit, bindSwitcher, reconcile, swap } from '../motion.js';
import { campoFecha, cablearFechas } from '../campo-fecha.js';
import { S, fecha, hoyISO, edad } from '../tienda.js';
import { plural } from '../format.js';
import { hoja, PLANTILLAS, CON_NUMERO } from '../hoja.js';
import { reordenable, ASA } from '../reordenar.js';

/* Una fila que solo vale en la retro (rx.css, .rx-solo-retro): en las otras
   plantillas queda en su lugar, apagada y sin tomar clicks ni foco. */
function soloRetro(fila, on) {
  fila.classList.toggle('is-apagada', !on);
  const sw = fila.querySelector('.op-switch');
  if (sw) sw.disabled = !on;
}

const rx = window.rx;
const opal = window.opal;

/* ══ Nueva receta ════════════════════════════════════════════════════════════ */

function itemVacio() {
  return { nombre: '', marca: '', dosis: '', envases: 1, diagnostico: '', indicaciones: '', desde: null };
}

function filaItem(it, i) {
  return `<div class="rx-item" data-item="${i}">
    ${ASA}
    <div class="rx-item__campos">
      <input class="op-input" data-campo="nombre" data-i="${i}" spellcheck="false"
             placeholder="Medication and presentation" value="${esc(it.nombre)}">
      <div class="rx-item__grid">
        <input class="op-input" data-campo="marca" data-i="${i}" spellcheck="false"
               placeholder="Suggested brand" value="${esc(it.marca)}">
        <input class="op-input" data-campo="dosis" data-i="${i}" spellcheck="false"
               placeholder="Dose" value="${esc(it.dosis)}">
        <input class="op-input" data-campo="diagnostico" data-i="${i}" spellcheck="false"
               placeholder="Diagnosis" value="${esc(it.diagnostico)}">
      </div>
      <!-- Indicaciones va sola y a lo ancho: es la línea más larga de una
           receta ("1 comprimido por la mañana, con el desayuno") y metida en
           una columna de la grilla se lee cortada justo cuando importa. -->
      <input class="op-input" data-campo="indicaciones" data-i="${i}" spellcheck="false"
             placeholder="Instructions" value="${esc(it.indicaciones)}">
    </div>
    <div class="rx-item__acciones">
      <div class="op-field" style="width:78px">
        <label class="op-field__label">Packs</label>
        <input class="op-input op-input--mono" data-campo="envases" data-i="${i}"
               type="number" min="1" value="${esc(it.envases)}">
      </div>
      <button class="op-iconbtn op-iconbtn--sm" data-catalogo="${i}"
              data-tip="Load from the catalog"><i data-icon="pill"></i></button>
      <button class="op-iconbtn op-iconbtn--sm" data-quitar="${i}"
              data-tip="Remove"><i data-icon="trash"></i></button>
    </div>
  </div>`;
}

export async function vistaReceta(pacienteId = null) {
  return editor(pacienteId, null);
}

/** Corrige una receta ya emitida: el mismo editor, con lo que se emitió
    cargado. Guardar la vuelve a congelar en el mismo registro (db.cjs,
    «Corregir lo emitido»). */
export async function vistaCorregirReceta(recetaId) {
  const original = recetaId ? await rx.recetas.get(recetaId) : null;
  if (!original) {
    Toast.error('Not found', 'That prescription no longer exists.');
    return Router.go('recetas');
  }
  return editor(original.paciente_id, original);
}

async function editor(pacienteId, original) {
  const [pacientes, catalogo] = await Promise.all([
    rx.pacientes.list(), rx.medicamentos.list(),
  ]);

  /* El tope viene de `app:info`, que lo lee de `db.cjs`: el número vive en un
     solo lugar, el mismo que rechaza la receta si igual se intenta emitir. Se
     resuelve acá adentro y no en el módulo porque `S.info` se carga en el
     arranque, después de que este archivo se importa. */
  const MAX = S.info?.maxMedicamentos || 2;

  const E = {
    paciente: null,
    fecha: hoyISO(),
    plantilla: PLANTILLAS.some(([v]) => v === S.ajustes?.plantillaPorDefecto)
      ? S.ajustes.plantillaPorDefecto : 'retro',
    numero: '',
    membrete: S.ajustes?.membreteRetro !== false,
    items: [itemVacio()],
  };
  /* Al corregir arranca de lo que se emitió. Los ítems no traen `desde`: ya
     sumaron su uso al catálogo cuando se emitieron, y solo suma lo que se
     cargue de nuevo del catálogo durante la corrección. */
  if (original) {
    Object.assign(E, {
      fecha: original.fecha,
      plantilla: original.plantilla,
      numero: original.numero || '',
      membrete: original.snapshot?.membrete !== false,
      items: original.items.map((it) => ({
        nombre: it.nombre, marca: it.marca, dosis: it.dosis, envases: it.envases,
        diagnostico: it.diagnostico, indicaciones: it.indicaciones, desde: null,
      })),
    });
    if (E.items.length === 0) E.items = [itemVacio()];
  }
  /* Si la paciente se borró después de emitir, al corregir hay que elegirla de
     nuevo: la receta corregida sale con los datos de una ficha que existe. */
  if (pacienteId) E.paciente = await rx.pacientes.get(pacienteId).catch(() => null);

  paint(head({
    title: original ? 'Correct prescription' : 'New prescription',
    sub: original
      ? `Issued on ${fecha(original.fecha)}. Saving replaces it: print the corrected one and discard the old paper.`
      : 'The sheet on the right is exactly what will be printed',
    crumbs: [{ label: 'Prescriptions', view: 'recetas' }],
    actions: `<button class="op-btn op-btn--primary op-flashable" id="r-emitir">
                <i data-icon="check"></i> ${original ? 'Save correction' : 'Issue'}</button>`,
  }) + `
    <div class="rx-receta">
      <div class="op-scroll rx-receta__form op-scroll--line-bottom">

        <div class="op-field">
          <label class="op-field__label">Patient</label>
          <button class="op-select" id="r-paciente" type="button">
            <span id="r-paciente-txt">${E.paciente
      ? esc(E.paciente.apellido_nombre) : 'Choose a patient…'}</span>
            <i data-icon="chevronDown"></i>
          </button>
          <span class="op-field__hint" id="r-paciente-hint"></span>
        </div>

        <div id="r-alergias"></div>

        <div class="rx-fila">
          ${campoFecha({ id: 'r-fecha', label: 'Date', valor: E.fecha })}
          <div class="op-field">
            <label class="op-field__label">Template</label>
            <div class="op-segmented" id="r-plantilla">
              ${PLANTILLAS.map(([v, n]) => `<button class="op-segmented__opt${E.plantilla === v ? ' is-active' : ''}"
                      data-value="${v}">${n}</button>`).join('')}
            </div>
          </div>
          <div class="op-field" id="r-numero-campo" ${CON_NUMERO.includes(E.plantilla) ? '' : 'hidden'}>
            <label class="op-field__label" for="r-numero">Prescription no.</label>
            <input class="op-input op-input--mono" id="r-numero" spellcheck="false" value="${esc(E.numero)}">
          </div>
        </div>

        <div class="op-row rx-solo-retro${E.plantilla === 'retro' ? '' : ' is-apagada'}" id="r-membrete-campo"
             style="gap:var(--op-3);align-items:center">
          <div class="op-grow">
            <div>Professional letterhead</div>
            <div class="op-meta">Retro template only. Name, specialty, license no. and address at the top; the number prints either way.</div>
          </div>
          <button type="button" class="op-switch${E.membrete ? ' is-on' : ''}" id="r-membrete"
                  role="switch" aria-checked="${E.membrete}" aria-label="Professional letterhead"
                  ${E.plantilla === 'retro' ? '' : 'disabled'}><span></span></button>
        </div>

        <div class="op-section">
          <div class="op-section__head">
            <div class="op-section__title">Medications</div>
            <button class="op-btn op-btn--secondary op-btn--sm op-flashable" id="r-agregar">
              <i data-icon="plus"></i> Add</button>
            <span class="rx-limite" id="r-limite">Up to ${MAX}: it is a legal limit</span>
          </div>
          <div class="op-col" id="r-items" style="gap:var(--op-3)"></div>
        </div>
      </div>

      <div class="rx-receta__previa">
        <div class="rx-previa op-grow">
          <div class="rx-previa__head">
            <i data-icon="printer"></i> Preview
            <span class="op-spacer"></span>
            <span class="op-meta">original + duplicate</span>
          </div>
          <div class="rx-previa__scroll" id="r-previa"></div>
        </div>
      </div>
    </div>`);

  const elItems = document.getElementById('r-items');
  const elAgregar = document.getElementById('r-agregar');
  const elLimite = document.getElementById('r-limite');
  const elPrevia = document.getElementById('r-previa');
  const elAlergias = document.getElementById('r-alergias');
  const elHint = document.getElementById('r-paciente-hint');

  /* ── Pintar ─────────────────────────────────────────────────────────────── */

  function datosHoja() {
    return {
      paciente: E.paciente,
      medico: S.medico,
      items: E.items.filter((i) => i.nombre.trim()),
      fecha: E.fecha,
      plantilla: E.plantilla,
      numero: E.numero,
      membrete: E.membrete,
    };
  }

  function pintarPrevia() {
    const d = datosHoja();
    // swap() en vez de innerHTML: con la misma hoja de la última vez no hace nada.
    swap(elPrevia,
      `<div class="rx-previa__papel">${hoja(d, { duplicado: false })}</div>` +
      `<div class="rx-previa__papel">${hoja(d, { duplicado: true })}</div>`);
  }

  function pintarAlergias() {
    const a = E.paciente?.alergias;
    /* Por swap(): el aviso aparece y se va fundiéndose al cambiar de paciente,
       en vez de saltar de un cuadro al otro. */
    if (!a) { swap(elAlergias, ''); return; }
    /* Antes de recetar, esto tiene que estar a la vista. Es el único lugar de
       la app donde el rojo no significa "falló algo". */
    swap(elAlergias, `<div class="rx-alergias">
      <i data-icon="cruz"></i>
      <div><div class="rx-alergias__rotulo">Allergies</div>
      <div>${esc(a)}</div></div></div>`);
    /* `paint()` monta los íconos una sola vez, al pintar la vista. Todo lo que
       se inyecte después tiene que montar los suyos o queda un hueco. */
    Icons.mount(elAlergias);
  }

  /* El botón apagado y el aviso encendido son la MISMA regla que hace cumplir
     `db.recetas.emitir()`. Están acá para que no se llegue a intentar, no para
     reemplazarla: si esto fallara, el pedido rebota igual del otro lado. */
  function pintarLimite() {
    const lleno = E.items.length >= MAX;
    elAgregar.disabled = lleno;
    elLimite.classList.toggle('is-visible', lleno);
  }

  /* Cada ítem lleva una clave propia mientras dura la edición, para que
     reconcile() sepa qué fila es cuál: al quitar una, las de abajo viajan a su
     lugar en vez de saltar, y la que se va sale desde donde estaba. Va en un
     WeakMap y no en el ítem porque los ítems se mandan tal cual a emitir() y
     la clave terminaría en la instantánea. */
  const claves = new WeakMap();
  let ultimaClave = 0;
  const clave = (it) => {
    if (!claves.has(it)) claves.set(it, `i${++ultimaClave}`);
    return claves.get(it);
  };
  /* Los manejadores buscan su ítem por la clave de la fila, no por un índice
     guardado al crearla: la fila sobrevive a que se quite la de arriba. */
  const itemDe = (el) => E.items.find((it) => clave(it) === el.closest('.rx-item')?.dataset.key);

  /* La estructura de una fila no cambia nunca: lo único que puede quedar
     desfasado son los valores (cargados del catálogo) y la posición. Se ponen
     en el lugar; reemplazar la fila le sacaría el foco a quien está escribiendo. */
  function ponerFila(el, { it, i }) {
    el.dataset.item = i;
    for (const inp of el.querySelectorAll('[data-campo]')) {
      inp.dataset.i = i;
      const v = String(it[inp.dataset.campo] ?? '');
      if (inp.value !== v) inp.value = v;
    }
  }

  function pintarItems() {
    reconcile(elItems, E.items.map((it, i) => ({ key: clave(it), html: filaItem(it, i), it, i })), {
      created: cablearFila,
      update: ponerFila,
    });
    pintarLimite();
    pintarPrevia();
  }

  /* ── Cableado ───────────────────────────────────────────────────────────── */

  /* Las filas se reordenan arrastrando su manija (o con Alt+flechas): el
     orden de la lista es el de la hoja. reordenable() ya dejó el DOM en el
     orden nuevo; acá se pone al día el arreglo y la previa. */
  reordenable(elItems, {
    onMove: (desde, hasta) => {
      const [it] = E.items.splice(desde, 1);
      E.items.splice(hasta, 0, it);
      pintarItems();
    },
  });

  function cablearFila(el) {
    Icons.mount(el);
    for (const inp of el.querySelectorAll('[data-campo]')) {
      inp.addEventListener('input', () => {
        const it = itemDe(inp);
        if (!it) return;
        const campo = inp.dataset.campo;
        it[campo] = campo === 'envases'
          ? Math.max(1, Number(inp.value) || 1)
          : inp.value;
        pintarPrevia();
      });
    }

    el.querySelector('[data-quitar]').onclick = () => {
      const it = itemDe(el);
      if (!it) return;
      /* La última no se va: en su lugar entra una vacía. Con un ítem nuevo
         (otra clave) la llena sale y la vacía entra, en vez de borrarse los
         campos de un cuadro al otro. */
      E.items = E.items.length === 1 ? [itemVacio()] : E.items.filter((x) => x !== it);
      pintarItems();
    };

    el.querySelector('[data-catalogo]').onclick = (ev) => {
      if (catalogo.length === 0) {
        Toast.show({ title: 'The catalog is empty', text: 'Fill it in from Medications.', icon: 'pill' });
        return;
      }
      Menu.show(ev.currentTarget, catalogo.slice(0, 40).map((m) => ({
        label: m.nombre,
        icon: 'pill',
        onSelect: () => {
          const it = itemDe(el);
          if (!it) return;
          // Sobre el mismo objeto: la fila sigue siendo la misma y cambian sus valores.
          Object.assign(it, {
            nombre: m.nombre, marca: m.marca, dosis: m.dosis,
            envases: m.envases || 1, diagnostico: m.diagnostico,
            indicaciones: m.indicaciones, desde: m.id,
          });
          pintarItems();
        },
      })), { align: 'end' });
    };
  }

  document.getElementById('r-paciente').onclick = (ev) => {
    if (pacientes.length === 0) {
      Toast.show({ title: 'There are no patients', text: 'Add one from Patients.', icon: 'users' });
      return;
    }
    Menu.show(ev.currentTarget, pacientes.slice(0, 60).map((p) => ({
      label: p.apellido_nombre,
      icon: 'user',
      selected: E.paciente?.id === p.id,
      onSelect: async () => {
        E.paciente = await rx.pacientes.get(p.id);
        document.getElementById('r-paciente-txt').textContent = E.paciente.apellido_nombre;
        const a = edad(E.paciente.nacimiento);
        elHint.textContent = [
          E.paciente.dni && `DNI ${E.paciente.dni}`,
          a != null && `${a} years`,
          E.paciente.cobertura,
        ].filter(Boolean).join(' · ');
        pintarAlergias();
        pintarPrevia();
      },
    })), { align: 'start' });
  };

  cablearFechas(document.getElementById('view'), (iso) => {
    // Vacía o a medio escribir se conserva la última válida: la hoja no puede
    // quedar sin fecha mientras se corrige un dígito.
    if (iso) { E.fecha = iso; pintarPrevia(); }
  });

  const campoNumero = document.getElementById('r-numero-campo');
  const campoMembrete = document.getElementById('r-membrete-campo');
  bindSwitcher(document.getElementById('r-plantilla'), (valor) => {
    E.plantilla = valor;
    campoNumero.hidden = !CON_NUMERO.includes(valor);
    soloRetro(campoMembrete, valor === 'retro');
    pintarPrevia();
  });
  /* Queda como estaba para la próxima receta: quien no lo quiere lo apaga una
     vez y no en cada receta. */
  const elMembrete = document.getElementById('r-membrete');
  elMembrete.onclick = async () => {
    E.membrete = !E.membrete;
    elMembrete.classList.toggle('is-on', E.membrete);
    elMembrete.setAttribute('aria-checked', String(E.membrete));
    pintarPrevia();
    // Una corrección no cambia lo que viene por defecto en las recetas nuevas.
    if (!original) S.ajustes = await opal.settings.save({ membreteRetro: E.membrete });
  };
  /* La retro imprime el número en el membrete, así que la previa lo sigue. */
  document.getElementById('r-numero').addEventListener('input', (e) => {
    E.numero = e.target.value;
    pintarPrevia();
  });

  elAgregar.onclick = () => {
    if (E.items.length >= MAX) return;   // el botón ya está apagado; por las dudas
    const nuevo = itemVacio();
    E.items.push(nuevo);
    pintarItems();
    // Por su clave: la última fila del DOM puede ser una que todavía se está yendo.
    elItems.querySelector(`[data-key="${clave(nuevo)}"] input`)?.focus();
  };

  document.getElementById('r-emitir').onclick = async () => {
    if (!E.paciente) return Toast.error('The patient is missing', 'Choose who the prescription is for.');
    const items = E.items.filter((i) => i.nombre.trim());
    if (items.length === 0) return Toast.error('The medication is missing', 'The prescription needs at least one.');

    const datos = {
      paciente_id: E.paciente.id,
      fecha: E.fecha,
      plantilla: E.plantilla,
      numero: E.numero,
      membrete: E.membrete,
      items,
      desdeCatalogo: items.map((i) => i.desde).filter(Boolean),
    };
    const receta = await attempt(
      () => (original ? rx.recetas.corregir(original.id, datos) : rx.recetas.emitir(datos)),
      { errorTitle: original ? 'Could not save the correction' : 'Could not issue the prescription' });
    if (!receta) return;

    await ofrecerSalida(receta.id, original ? 'Prescription corrected' : 'Prescription issued');
    Router.go('recetas');
  };

  pintarItems();
  pintarAlergias();
  if (E.paciente) {
    const a = edad(E.paciente.nacimiento);
    elHint.textContent = [
      E.paciente.dni && `DNI ${E.paciente.dni}`,
      a != null && `${a} years`,
      E.paciente.cobertura,
    ].filter(Boolean).join(' · ');
  }
}

/* ══ Imprimir / PDF ══════════════════════════════════════════════════════════ */

async function ofrecerSalida(recetaId, titulo) {
  const val = await Modal.show({
    title: titulo,
    sub: 'Two sheets are printed: the original and the duplicate. The signature space is left blank to sign by hand.',
    width: 460,
    actions: [
      { label: 'Later', value: null },
      { label: 'Save PDF', value: 'pdf' },
      { label: 'Print', value: 'imprimir', variant: 'primary', autofocus: true },
    ],
  });
  if (val === 'pdf') {
    await attempt(async () => {
      const r = await rx.recetas.pdf(recetaId);
      if (!r.cancelado) Toast.show({ title: 'PDF saved', text: r.ruta, icon: 'save' });
    }, { errorTitle: 'Could not create the PDF' });
  } else if (val === 'imprimir') {
    await attempt(async () => {
      const r = await rx.recetas.imprimir(recetaId);
      if (!r.cancelado && !r.ok) throw new Error(r.motivo || 'The printer rejected the job.');
    }, { errorTitle: 'Could not print' });
  }
}

/* ══ Historial ═══════════════════════════════════════════════════════════════ */

export async function vistaRecetas(recetaId = null) {
  const lista = await rx.recetas.list({ limite: 300 });

  paint(head({
    title: 'Prescriptions',
    /* `plural()` ya trae el número adelante, así que no se le antepone otro. */
    sub: lista.length
      ? `${plural(lista.length, 'prescription')} issued`
      : 'You have not issued any yet',
    /* El de borrar todo solo existe cuando hay algo que borrar. Va en fantasma
       y sin rojo: el rojo aparece recién en la confirmación, que es donde algo
       se rompe de verdad. */
    actions: `${lista.length ? `
              <button class="op-btn op-btn--ghost op-flashable" id="h-vaciar">
                <i data-icon="trash"></i> Clear history</button>` : ''}
              <button class="op-btn op-btn--primary op-flashable" id="h-nueva">
                <i data-icon="plus"></i> New prescription</button>`,
  }) + `
    <div class="op-scroll op-grow op-scroll--line-bottom">
      ${lista.length === 0
      ? empty({ icon: 'file', title: 'No prescriptions', text: 'The first one starts with the button above.' })
      : `<div class="op-list">${lista.map((r) => `
        <div class="op-listitem" data-abrir="${esc(r.id)}" role="button" tabindex="0">
          <div class="op-iconcell"><i data-icon="file"></i></div>
          <div class="op-listitem__main">
            <div class="op-listitem__title">${esc(r.paciente || '— deleted patient —')}</div>
            <div class="op-listitem__sub op-truncate">${esc(r.detalle || '')}</div>
          </div>
          <div class="op-listitem__aside op-num">${esc(fecha(r.fecha))}</div>
          <div class="op-rowactions">
            <button class="op-iconbtn op-iconbtn--sm" data-corregir="${esc(r.id)}"
                    data-tip="Edit"><i data-icon="edit"></i></button>
            <button class="op-iconbtn op-iconbtn--sm" data-imprimir="${esc(r.id)}"
                    data-tip="Print"><i data-icon="printer"></i></button>
            <button class="op-iconbtn op-iconbtn--sm" data-pdf="${esc(r.id)}"
                    data-tip="Save PDF"><i data-icon="download"></i></button>
            <button class="op-iconbtn op-iconbtn--sm" data-borrar="${esc(r.id)}"
                    data-tip="Delete"><i data-icon="trash"></i></button>
          </div>
        </div>`).join('')}</div>`}
    </div>`);

  document.getElementById('h-nueva').onclick = () => Router.go('receta');

  const elVaciar = document.getElementById('h-vaciar');
  if (elVaciar) elVaciar.onclick = () => vaciarHistorial(lista.length);

  for (const el of document.querySelectorAll('[data-abrir]')) {
    const ver = () => verReceta(el.dataset.abrir);
    el.addEventListener('click', (e) => {
      if (e.target.closest('.op-rowactions')) return;   // los botones tienen lo suyo
      ver();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ver(); }
    });
  }

  for (const b of document.querySelectorAll('[data-corregir]')) {
    b.onclick = () => Router.go('receta-corregir', b.dataset.corregir);
  }

  for (const b of document.querySelectorAll('[data-imprimir]')) {
    b.onclick = () => attempt(async () => {
      const r = await rx.recetas.imprimir(b.dataset.imprimir);
      if (!r.cancelado && !r.ok) throw new Error(r.motivo || 'The printer rejected the job.');
    }, { errorTitle: 'Could not print' });
  }

  for (const b of document.querySelectorAll('[data-pdf]')) {
    b.onclick = () => attempt(async () => {
      const r = await rx.recetas.pdf(b.dataset.pdf);
      if (!r.cancelado) Toast.show({ title: 'PDF saved', text: r.ruta, icon: 'save' });
    }, { errorTitle: 'Could not create the PDF' });
  }

  for (const b of document.querySelectorAll('[data-borrar]')) {
    /* La fila sale animada y recién después se repinta la lista: si se
       repintara de una, la receta desaparecería de golpe. */
    b.onclick = () => borrarReceta(b.dataset.borrar, {
      antesDeRepintar: (listo) => exit(b.closest('.op-listitem'), { onDone: listo }),
    });
  }

  if (recetaId) verReceta(recetaId);
}

/* ══ Borrar ══════════════════════════════════════════════════════════════════ */

/** Confirma y borra UNA receta. Lo comparten el tacho de la fila y el botón
    del modal de la receta. Devuelve si se borró. */
async function borrarReceta(id, { antesDeRepintar = (listo) => listo() } = {}) {
  const ok = await Modal.confirm({
    title: 'Delete the prescription',
    sub: 'It is removed from the history. If it was already printed, the paper still exists. This cannot be undone.',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return false;
  const hecho = await attempt(() => rx.recetas.remove(id), { errorTitle: 'Could not delete' });
  if (!hecho) return false;
  Toast.show({ title: 'Prescription deleted', icon: 'trash' });
  antesDeRepintar(() => Router.refresh());
  return true;
}

/** Borra el historial ENTERO. Pide escribir la palabra: acá no se va una
    receta, se van todas, y un click de más no puede alcanzar. */
async function vaciarHistorial(cuantas) {
  const ok = await Modal.confirmTyped({
    title: 'Clear the whole history',
    sub: `${plural(cuantas, 'issued prescription')} will be deleted. `
      + 'Patients, the catalog and test orders stay. If you want to keep them, save a backup '
      + 'from Settings first. This cannot be undone.',
    word: 'delete',
    confirmLabel: 'Clear history',
  });
  if (!ok) return;
  const n = await attempt(() => rx.recetas.vaciar(), { errorTitle: 'Could not clear the history' });
  if (n == null) return;
  Toast.show({
    title: 'History cleared',
    text: `${plural(n, 'prescription')} deleted.`,
    icon: 'trash',
  });
  Router.refresh();
}

/** Muestra la hoja tal como se emitió, desde la instantánea. */
async function verReceta(id) {
  const r = await rx.recetas.get(id);
  if (!r) return Toast.error('Not found', 'That prescription no longer exists.');

  const datos = {
    paciente: r.snapshot?.paciente || null,
    medico: r.snapshot?.medico || null,
    items: r.items,
    fecha: r.fecha,
    plantilla: r.plantilla,
    numero: r.numero,
    membrete: r.snapshot?.membrete,
  };

  const caja = document.createElement('div');
  caja.innerHTML = `<div class="rx-previa__papel" style="--rx-zoom:.62;margin:0 auto">
    ${hoja(datos, { duplicado: false })}</div>`;

  const val = await Modal.show({
    title: `Prescription of ${fecha(r.fecha)}`,
    sub: r.snapshot?.corregida
      ? `As it was corrected on ${fecha(r.snapshot.corregida.slice(0, 10))}, with the details of that day.`
      : 'Exactly as it was issued. The details are the ones from that day, not the current ones.',
    body: caja,
    width: 520,
    actions: [
      { label: 'Close', value: null },
      { label: 'Delete', value: 'borrar', variant: 'danger' },
      { label: 'Edit', value: 'corregir' },
      { label: 'Save PDF', value: 'pdf' },
      { label: 'Print', value: 'imprimir', variant: 'primary' },
    ],
  });

  if (val === 'borrar') {
    await borrarReceta(id);
  } else if (val === 'corregir') {
    Router.go('receta-corregir', id);
  } else if (val === 'pdf') {
    await attempt(async () => {
      const res = await rx.recetas.pdf(id);
      if (!res.cancelado) Toast.show({ title: 'PDF saved', text: res.ruta, icon: 'save' });
    }, { errorTitle: 'Could not create the PDF' });
  } else if (val === 'imprimir') {
    await attempt(async () => {
      const res = await rx.recetas.imprimir(id);
      if (!res.cancelado && !res.ok) throw new Error(res.motivo || 'The printer rejected the job.');
    }, { errorTitle: 'Could not print' });
  }
}
