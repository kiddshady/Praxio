/* Órdenes de estudios: emitir una nueva (con la hoja en vivo al lado) y el
   historial. Es la vista de recetas con otro cuerpo — mismo circuito, mismo
   congelado por instantánea, misma salida a papel o PDF. Lo único distinto es
   qué se pide y que sale en UNA hoja: la orden se la queda el laboratorio. */

import { Modal, Toast, Menu } from '../overlays.js';
import { Icons } from '../icons.js';
import Router from '../router.js';
import { paint, head, esc, empty, attempt } from '../ui.js';
import { exit, bindSwitcher, reconcile, swap } from '../motion.js';
import { campoFecha, cablearFechas } from '../campo-fecha.js';
import { S, fecha, hoyISO, edad } from '../tienda.js';
import { plural } from '../format.js';
import { hoja, PLANTILLAS_ORDEN, ENCABEZADO_ORDEN } from '../hoja.js';
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

/* ══ Nueva orden ═════════════════════════════════════════════════════════════ */

function itemVacio() {
  return { nombre: '', aclaracion: '', desde: null };
}

function filaItem(it, i) {
  return `<div class="rx-item rx-item--fila" data-item="${i}">
    ${ASA}
    <div class="rx-item__campos">
      <div class="rx-item__grid">
        <input class="op-input" data-campo="nombre" data-i="${i}" spellcheck="false"
               placeholder="Test or procedure" value="${esc(it.nombre)}">
        <input class="op-input" data-campo="aclaracion" data-i="${i}" spellcheck="false"
               placeholder="Note (side, region, fasting…)" value="${esc(it.aclaracion)}">
      </div>
    </div>
    <div class="rx-item__acciones">
      <button class="op-iconbtn op-iconbtn--sm" data-catalogo="${i}"
              data-tip="Load from the catalog"><i data-icon="estudio"></i></button>
      <button class="op-iconbtn op-iconbtn--sm" data-quitar="${i}"
              data-tip="Remove"><i data-icon="trash"></i></button>
    </div>
  </div>`;
}

export async function vistaOrden(pacienteId = null) {
  const [pacientes, catalogo] = await Promise.all([
    rx.pacientes.list(), rx.estudios.list(),
  ]);

  const E = {
    paciente: null,
    fecha: hoyISO(),
    diagnostico: '',
    /* La plantilla queda como se usó la última vez, igual que el membrete
       (que es el mismo ajuste que el de la receta retro). */
    plantilla: PLANTILLAS_ORDEN.some(([v]) => v === S.ajustes?.plantillaOrden)
      ? S.ajustes.plantillaOrden : 'rpe',
    encabezado: ENCABEZADO_ORDEN,
    membrete: S.ajustes?.membreteRetro !== false,
    numerar: S.ajustes?.numerarOrden !== false,
    items: [itemVacio()],
  };
  if (pacienteId) E.paciente = await rx.pacientes.get(pacienteId);

  paint(head({
    title: 'New test order',
    sub: 'The sheet on the right is exactly what will be printed',
    crumbs: [{ label: 'Test orders', view: 'ordenes' }],
    actions: `<button class="op-btn op-btn--primary op-flashable" id="o-emitir">
                <i data-icon="check"></i> Issue</button>`,
  }) + `
    <div class="rx-receta">
      <div class="op-scroll rx-receta__form op-scroll--line-bottom">

        <div class="op-field">
          <label class="op-field__label">Patient</label>
          <button class="op-select" id="o-paciente" type="button">
            <span id="o-paciente-txt">${E.paciente
      ? esc(E.paciente.apellido_nombre) : 'Choose a patient…'}</span>
            <i data-icon="chevronDown"></i>
          </button>
          <span class="op-field__hint" id="o-paciente-hint"></span>
        </div>

        <div id="o-alergias"></div>

        <div class="rx-fila">
          ${campoFecha({ id: 'o-fecha', label: 'Date', valor: E.fecha })}
          <div class="op-field">
            <label class="op-field__label" for="o-diagnostico">Diagnosis or indication</label>
            <input class="op-input" id="o-diagnostico" spellcheck="false"
                   placeholder="What prompts the request">
          </div>
        </div>

        <div class="rx-fila">
          <div class="op-field">
            <label class="op-field__label">Template</label>
            <div class="op-segmented" id="o-plantilla">
              ${PLANTILLAS_ORDEN.map(([v, n]) => `<button class="op-segmented__opt${E.plantilla === v ? ' is-active' : ''}"
                      data-value="${v}">${n}</button>`).join('')}
            </div>
          </div>
          <div class="op-field">
            <label class="op-field__label" for="o-encabezado">Request heading</label>
            <input class="op-input" id="o-encabezado" spellcheck="false" maxlength="80"
                   value="${esc(E.encabezado)}" placeholder="Empty, the sheet leaves it out">
          </div>
        </div>

        <div class="op-row rx-solo-retro${E.plantilla === 'retro' ? '' : ' is-apagada'}" id="o-membrete-campo"
             style="gap:var(--op-3);align-items:center">
          <div class="op-grow">
            <div>Professional letterhead</div>
            <div class="op-meta">Retro template only. Name, specialty, license number and address at the top of the sheet.</div>
          </div>
          <button type="button" class="op-switch${E.membrete ? ' is-on' : ''}" id="o-membrete"
                  role="switch" aria-checked="${E.membrete}" aria-label="Professional letterhead"
                  ${E.plantilla === 'retro' ? '' : 'disabled'}><span></span></button>
        </div>

        <div class="op-row rx-solo-retro${E.plantilla === 'retro' ? '' : ' is-apagada'}" id="o-numerar-campo"
             style="gap:var(--op-3);align-items:center">
          <div class="op-grow">
            <div>Number the tests</div>
            <div class="op-meta">Retro template only. 1., 2., 3. in the margin of each test.</div>
          </div>
          <button type="button" class="op-switch${E.numerar ? ' is-on' : ''}" id="o-numerar"
                  role="switch" aria-checked="${E.numerar}" aria-label="Number the tests"
                  ${E.plantilla === 'retro' ? '' : 'disabled'}><span></span></button>
        </div>

        <div class="op-section">
          <div class="op-section__head">
            <div class="op-section__title">Tests</div>
            <button class="op-btn op-btn--secondary op-btn--sm op-flashable" id="o-agregar">
              <i data-icon="plus"></i> Add</button>
          </div>
          <div class="op-col" id="o-items" style="gap:var(--op-3)"></div>
        </div>

      </div>

      <div class="rx-receta__previa">
        <div class="rx-previa op-grow">
          <div class="rx-previa__head">
            <i data-icon="printer"></i> Preview
            <span class="op-spacer"></span>
            <span class="op-meta" id="o-hojas">one sheet</span>
          </div>
          <div class="rx-previa__scroll" id="o-previa"></div>
        </div>
      </div>
    </div>`);

  const elItems = document.getElementById('o-items');
  const elPrevia = document.getElementById('o-previa');
  const elAlergias = document.getElementById('o-alergias');
  const elHint = document.getElementById('o-paciente-hint');
  const elHojas = document.getElementById('o-hojas');

  /* ── Pintar ─────────────────────────────────────────────────────────────── */

  function datosHoja() {
    return {
      tipo: 'orden',
      paciente: E.paciente,
      medico: S.medico,
      items: E.items.filter((i) => i.nombre.trim()),
      fecha: E.fecha,
      diagnostico: E.diagnostico,
      plantilla: E.plantilla,
      encabezado: E.encabezado,
      membrete: E.membrete,
      numerar: E.numerar,
    };
  }

  /* Un pedido largo no entra en la A5 y sigue en una segunda página. Eso no se
     nota mirando la previa —el papel simplemente se dibuja más alto— y sí se
     nota cuando ya salió por la impresora, que es tarde. Se mide y se avisa.

     El alto de una A5 se deduce del ancho del MISMO elemento (132 × 194 mm):
     así el zoom de la previa se cancela solo y no hay que compensarlo a mano,
     que es de donde salen los avisos que mienten en una ventana chica. */
  function medirHoja() {
    const papel = elPrevia.querySelector('.rx-hoja');
    if (!papel) return;
    const caja = papel.getBoundingClientRect();
    const sePasa = caja.height > caja.width * (194 / 132) + 1;
    elHojas.textContent = sePasa ? 'does not fit: it runs onto a second sheet' : 'one sheet';
    elHojas.classList.toggle('rx-previa__alerta', sePasa);
  }

  function pintarPrevia() {
    // swap() en vez de innerHTML: con la misma hoja de la última vez no hace nada.
    swap(elPrevia, `<div class="rx-previa__papel">${hoja(datosHoja())}</div>`);
    medirHoja();
  }

  function pintarAlergias() {
    const a = E.paciente?.alergias;
    /* Por swap(): el aviso aparece y se va fundiéndose al cambiar de paciente,
       en vez de saltar de un cuadro al otro. */
    if (!a) { swap(elAlergias, ''); return; }
    /* También acá: un contraste yodado o el látex se piden en una orden igual
       que un fármaco en una receta. Es el otro rojo de la app que no significa
       que algo falló. */
    swap(elAlergias, `<div class="rx-alergias">
      <i data-icon="cruz"></i>
      <div><div class="rx-alergias__rotulo">Allergies</div>
      <div>${esc(a)}</div></div></div>`);
    /* `paint()` monta los íconos una sola vez, al pintar la vista. Todo lo que
       se inyecte después tiene que montar los suyos o queda un hueco. */
    Icons.mount(elAlergias);
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
    pintarPrevia();
  }

  function pintarFiliacion() {
    const a = edad(E.paciente.nacimiento);
    elHint.textContent = [
      E.paciente.dni && `DNI ${E.paciente.dni}`,
      a != null && `${a} years`,
      E.paciente.cobertura,
    ].filter(Boolean).join(' · ');
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
        it[inp.dataset.campo] = inp.value;
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
        Toast.show({ title: 'The catalog is empty', text: 'Fill it in from Tests.', icon: 'estudio' });
        return;
      }
      Menu.show(ev.currentTarget, catalogo.slice(0, 40).map((e) => ({
        label: e.nombre,
        icon: 'estudio',
        onSelect: () => {
          const it = itemDe(el);
          if (!it) return;
          // Sobre el mismo objeto: la fila sigue siendo la misma y cambian sus valores.
          Object.assign(it, { nombre: e.nombre, aclaracion: e.aclaracion, desde: e.id });
          pintarItems();
        },
      })), { align: 'end' });
    };
  }

  document.getElementById('o-paciente').onclick = (ev) => {
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
        document.getElementById('o-paciente-txt').textContent = E.paciente.apellido_nombre;
        pintarFiliacion();
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

  document.getElementById('o-diagnostico').addEventListener('input', (e) => {
    E.diagnostico = e.target.value;
    pintarPrevia();
  });

  const campoMembrete = document.getElementById('o-membrete-campo');
  const campoNumerar = document.getElementById('o-numerar-campo');
  bindSwitcher(document.getElementById('o-plantilla'), (valor) => {
    E.plantilla = valor;
    soloRetro(campoMembrete, valor === 'retro');
    soloRetro(campoNumerar, valor === 'retro');
    pintarPrevia();
    opal.settings.save({ plantillaOrden: valor })
      .then((a) => { S.ajustes = a; })
      .catch(() => { /* preferencia, no dato */ });
  });

  /* Lo que encabeza el pedido es texto libre: «Solicito:», «Se solicita:»,
     «Pedido de estudios»… Vacío, la hoja no imprime nada en ese lugar. */
  document.getElementById('o-encabezado').addEventListener('input', (e) => {
    E.encabezado = e.target.value;
    pintarPrevia();
  });

  /* El mismo ajuste que el membrete de la receta retro: quien no lo quiere lo
     apaga una vez. */
  const elMembrete = document.getElementById('o-membrete');
  elMembrete.onclick = async () => {
    E.membrete = !E.membrete;
    elMembrete.classList.toggle('is-on', E.membrete);
    elMembrete.setAttribute('aria-checked', String(E.membrete));
    pintarPrevia();
    S.ajustes = await opal.settings.save({ membreteRetro: E.membrete });
  };

  /* Los números en el margen son opcionales: quien no los quiere los apaga
     una vez, como el membrete. */
  const elNumerar = document.getElementById('o-numerar');
  elNumerar.onclick = async () => {
    E.numerar = !E.numerar;
    elNumerar.classList.toggle('is-on', E.numerar);
    elNumerar.setAttribute('aria-checked', String(E.numerar));
    pintarPrevia();
    S.ajustes = await opal.settings.save({ numerarOrden: E.numerar });
  };

  document.getElementById('o-agregar').onclick = () => {
    const nuevo = itemVacio();
    E.items.push(nuevo);
    pintarItems();
    // Por su clave: la última fila del DOM puede ser una que todavía se está yendo.
    elItems.querySelector(`[data-key="${clave(nuevo)}"] input`)?.focus();
  };

  document.getElementById('o-emitir').onclick = async () => {
    if (!E.paciente) return Toast.error('The patient is missing', 'Choose who the test order is for.');
    const items = E.items.filter((i) => i.nombre.trim());
    if (items.length === 0) return Toast.error('The test is missing', 'The test order needs at least one.');

    const orden = await attempt(() => rx.ordenes.emitir({
      paciente_id: E.paciente.id,
      fecha: E.fecha,
      diagnostico: E.diagnostico,
      plantilla: E.plantilla,
      encabezado: E.encabezado,
      membrete: E.membrete,
      numerar: E.numerar,
      items,
      desdeCatalogo: items.map((i) => i.desde).filter(Boolean),
    }), { errorTitle: 'Could not issue the test order' });
    if (!orden) return;

    await ofrecerSalida(orden.id, 'Test order issued');
    Router.go('ordenes');
  };

  pintarItems();
  pintarAlergias();
  if (E.paciente) pintarFiliacion();

  /* Las métricas de la Source Sans cambian el alto de la hoja, así que la
     primera medición se repite cuando la tipografía terminó de cargar. Sin
     esto, abrir la vista en frío puede avisar de una segunda hoja que no
     existe — o callarse una que sí. */
  document.fonts.ready.then(medirHoja);
}

/* ══ Imprimir / PDF ══════════════════════════════════════════════════════════ */

async function ofrecerSalida(ordenId, titulo) {
  const val = await Modal.show({
    title: titulo,
    sub: 'A single sheet is printed. The signature space is left blank to sign by hand.',
    width: 460,
    actions: [
      { label: 'Later', value: null },
      { label: 'Save PDF', value: 'pdf' },
      { label: 'Print', value: 'imprimir', variant: 'primary', autofocus: true },
    ],
  });
  if (val === 'pdf') {
    await attempt(async () => {
      const r = await rx.ordenes.pdf(ordenId);
      if (!r.cancelado) Toast.show({ title: 'PDF saved', text: r.ruta, icon: 'save' });
    }, { errorTitle: 'Could not create the PDF' });
  } else if (val === 'imprimir') {
    await attempt(async () => {
      const r = await rx.ordenes.imprimir(ordenId);
      if (!r.cancelado && !r.ok) throw new Error(r.motivo || 'The printer rejected the job.');
    }, { errorTitle: 'Could not print' });
  }
}

/* ══ Historial ═══════════════════════════════════════════════════════════════ */

export async function vistaOrdenes(ordenId = null) {
  const lista = await rx.ordenes.list({ limite: 300 });

  paint(head({
    title: 'Test orders',
    /* `plural()` ya trae el número adelante, así que no se le antepone otro. */
    sub: lista.length
      ? `${plural(lista.length, 'test order')} issued`
      : 'You have not issued any yet',
    /* Igual que en recetas: el de borrar todo solo existe cuando hay algo que
       borrar, y va en fantasma. El rojo aparece recién en la confirmación. */
    actions: `${lista.length ? `
              <button class="op-btn op-btn--ghost op-flashable" id="ho-vaciar">
                <i data-icon="trash"></i> Clear history</button>` : ''}
              <button class="op-btn op-btn--primary op-flashable" id="ho-nueva">
                <i data-icon="plus"></i> New test order</button>`,
  }) + `
    <div class="op-scroll op-grow op-scroll--line-bottom">
      ${lista.length === 0
      ? empty({ icon: 'orden', title: 'No test orders', text: 'The first one starts with the button above.' })
      : `<div class="op-list">${lista.map((o) => `
        <div class="op-listitem" data-abrir="${esc(o.id)}" role="button" tabindex="0">
          <div class="op-iconcell"><i data-icon="orden"></i></div>
          <div class="op-listitem__main">
            <div class="op-listitem__title">${esc(o.paciente || '— deleted patient —')}</div>
            <div class="op-listitem__sub op-truncate">${esc(o.detalle || '')}</div>
          </div>
          <div class="op-listitem__aside op-num">${esc(fecha(o.fecha))}</div>
          <div class="op-rowactions">
            <button class="op-iconbtn op-iconbtn--sm" data-imprimir="${esc(o.id)}"
                    data-tip="Print"><i data-icon="printer"></i></button>
            <button class="op-iconbtn op-iconbtn--sm" data-pdf="${esc(o.id)}"
                    data-tip="Save PDF"><i data-icon="download"></i></button>
            <button class="op-iconbtn op-iconbtn--sm" data-borrar="${esc(o.id)}"
                    data-tip="Delete"><i data-icon="trash"></i></button>
          </div>
        </div>`).join('')}</div>`}
    </div>`);

  document.getElementById('ho-nueva').onclick = () => Router.go('orden');

  const elVaciar = document.getElementById('ho-vaciar');
  if (elVaciar) elVaciar.onclick = () => vaciarHistorial(lista.length);

  for (const el of document.querySelectorAll('[data-abrir]')) {
    const ver = () => verOrden(el.dataset.abrir);
    el.addEventListener('click', (e) => {
      if (e.target.closest('.op-rowactions')) return;   // los botones tienen lo suyo
      ver();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ver(); }
    });
  }

  for (const b of document.querySelectorAll('[data-imprimir]')) {
    b.onclick = () => attempt(async () => {
      const r = await rx.ordenes.imprimir(b.dataset.imprimir);
      if (!r.cancelado && !r.ok) throw new Error(r.motivo || 'The printer rejected the job.');
    }, { errorTitle: 'Could not print' });
  }

  for (const b of document.querySelectorAll('[data-pdf]')) {
    b.onclick = () => attempt(async () => {
      const r = await rx.ordenes.pdf(b.dataset.pdf);
      if (!r.cancelado) Toast.show({ title: 'PDF saved', text: r.ruta, icon: 'save' });
    }, { errorTitle: 'Could not create the PDF' });
  }

  for (const b of document.querySelectorAll('[data-borrar]')) {
    /* La fila sale animada y recién después se repinta la lista. */
    b.onclick = () => borrarOrden(b.dataset.borrar, {
      antesDeRepintar: (listo) => exit(b.closest('.op-listitem'), { onDone: listo }),
    });
  }

  if (ordenId) verOrden(ordenId);
}

/* ══ Borrar ══════════════════════════════════════════════════════════════════ */

/** Confirma y borra UNA orden. Lo comparten el tacho de la fila y el botón
    del modal de la orden. Devuelve si se borró. */
async function borrarOrden(id, { antesDeRepintar = (listo) => listo() } = {}) {
  const ok = await Modal.confirm({
    title: 'Delete the test order',
    sub: 'It is removed from the history. If it was already printed, the paper still exists. This cannot be undone.',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return false;
  const hecho = await attempt(() => rx.ordenes.remove(id), { errorTitle: 'Could not delete' });
  if (!hecho) return false;
  Toast.show({ title: 'Test order deleted', icon: 'trash' });
  antesDeRepintar(() => Router.refresh());
  return true;
}

/** Borra el historial de órdenes ENTERO, escribiendo la palabra. */
async function vaciarHistorial(cuantas) {
  const ok = await Modal.confirmTyped({
    title: 'Clear the whole history',
    sub: `${plural(cuantas, 'issued test order')} will be deleted. `
      + 'Patients, the test catalog and prescriptions stay. If you want to keep them, save a '
      + 'backup from Settings first. This cannot be undone.',
    word: 'delete',
    confirmLabel: 'Clear history',
  });
  if (!ok) return;
  const n = await attempt(() => rx.ordenes.vaciar(), { errorTitle: 'Could not clear the history' });
  if (n == null) return;
  Toast.show({
    title: 'History cleared',
    text: `${plural(n, 'test order')} deleted.`,
    icon: 'trash',
  });
  Router.refresh();
}

/** Muestra la hoja tal como se emitió, desde la instantánea. */
async function verOrden(id) {
  const o = await rx.ordenes.get(id);
  if (!o) return Toast.error('Not found', 'That test order no longer exists.');

  const datos = {
    tipo: 'orden',
    paciente: o.snapshot?.paciente || null,
    medico: o.snapshot?.medico || null,
    items: o.items,
    fecha: o.fecha,
    diagnostico: o.diagnostico,
    plantilla: o.snapshot?.plantilla,
    encabezado: o.snapshot?.encabezado,
    membrete: o.snapshot?.membrete,
    numerar: o.snapshot?.numerar,
  };

  const caja = document.createElement('div');
  caja.innerHTML = `<div class="rx-previa__papel" style="--rx-zoom:.62;margin:0 auto">
    ${hoja(datos)}</div>`;

  const val = await Modal.show({
    title: `Test order of ${fecha(o.fecha)}`,
    sub: 'Exactly as it was issued. The details are the ones from that day, not the current ones.',
    body: caja,
    width: 520,
    actions: [
      { label: 'Close', value: null },
      { label: 'Delete', value: 'borrar', variant: 'danger' },
      { label: 'Save PDF', value: 'pdf' },
      { label: 'Print', value: 'imprimir', variant: 'primary' },
    ],
  });

  if (val === 'borrar') {
    await borrarOrden(id);
  } else if (val === 'pdf') {
    await attempt(async () => {
      const res = await rx.ordenes.pdf(id);
      if (!res.cancelado) Toast.show({ title: 'PDF saved', text: res.ruta, icon: 'save' });
    }, { errorTitle: 'Could not create the PDF' });
  } else if (val === 'imprimir') {
    await attempt(async () => {
      const res = await rx.ordenes.imprimir(id);
      if (!res.cancelado && !res.ok) throw new Error(res.motivo || 'The printer rejected the job.');
    }, { errorTitle: 'Could not print' });
  }
}
