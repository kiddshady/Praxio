/* Pacientes: la lista, y la ficha clínica de cada uno. */

import { Modal, Toast, Menu } from '../overlays.js';
import Router from '../router.js';
import { paint, head, esc, empty, attempt } from '../ui.js';
import { bindSwitcher } from '../motion.js';
import { Shell } from '../shell.js';
import { Icons } from '../icons.js';
import { campoFecha, cablearFechas, isoDe } from '../campo-fecha.js';
import { S, fecha, edad, hoyISO, validarDNI, validarCUIL } from '../tienda.js';
import { plural } from '../format.js';
import { nombrePlantilla } from '../hoja.js';

const rx = window.rx;

/* ══ Formulario de datos personales ══════════════════════════════════════════ */

function campo(id, rotulo, valor, extra = '') {
  return `<div class="op-field">
    <label class="op-field__label" for="${id}">${esc(rotulo)}</label>
    <input class="op-input" id="${id}" spellcheck="false" value="${esc(valor || '')}" ${extra}>
  </div>`;
}

/* Los tres que admite el DNI. Se guarda el valor en castellano, que es el que
   imprime la hoja; la interfaz muestra el rótulo. */
const SEXOS = [['Femenino', 'Female'], ['Masculino', 'Male'], ['X', 'X']];
const rotuloSexo = (v) => (SEXOS.find(([s]) => s === v) || [v, v])[1];

/* El sexo sale de una lista corta y cerrada, así que va en el select propio y
   no en un `<input list>`. El datalist abre el desplegable NATIVO de Chromium
   —su chevron, su lista, su tipografía—, que es lo único que quedaba sin
   dibujar en toda la app.

   El valor vive en el `value` del botón, que es una propiedad real de
   `<button>` y no un truco: así `leerFormulario` lo lee igual que a cualquier
   input, sin tener que saber que este campo es distinto. */
function campoSexo(valor) {
  return `<div class="op-field">
    <label class="op-field__label">Sex</label>
    <button class="op-select" id="p-sexo" type="button" value="${esc(valor || '')}">
      <span class="op-select__value" data-placeholder="Not specified">${esc(rotuloSexo(valor || ''))}</span>
      <i data-icon="chevronDown"></i>
    </button>
  </div>`;
}

function cablearSexo(caja) {
  const btn = caja.querySelector('#p-sexo');
  const val = btn.querySelector('.op-select__value');
  const poner = (v) => { btn.value = v; val.textContent = rotuloSexo(v); };

  btn.addEventListener('click', () => {
    Menu.show(btn, [
      ...SEXOS.map(([s, rotulo]) => ({ label: rotulo, selected: btn.value === s, onSelect: () => poner(s) })),
      { sep: true },
      /* Con el `<input>` el campo se vaciaba borrando el texto. Sin esta
         opción, un click equivocado no tendría vuelta atrás. */
      { label: 'Not specified', selected: !btn.value, onSelect: () => poner('') },
    ]);
  });
}

function formularioPaciente(p = {}) {
  const caja = document.createElement('div');
  caja.className = 'op-col';
  caja.style.gap = 'var(--op-3)';
  caja.innerHTML = `
    ${campo('p-nombre', 'Surname and first name', p.apellido_nombre, 'placeholder="GÓMEZ, MARÍA ELENA"')}
    <div class="rx-fila">
      ${campo('p-dni', 'DNI', p.dni, 'placeholder="28123456" inputmode="numeric"')}
      ${campo('p-cuil', 'CUIL', p.cuil, 'placeholder="27-28123456-4"')}
    </div>
    <div class="rx-fila">
      ${campoSexo(p.sexo)}
      ${campoFecha({ id: 'p-nac', label: 'Date of birth', valor: p.nacimiento })}
    </div>
    ${campo('p-domicilio', 'Address', p.domicilio)}
    <div class="rx-fila">
      ${campo('p-telefono', 'Phone', p.telefono, 'inputmode="tel"')}
      ${campo('p-email', 'Email', p.email, 'inputmode="email"')}
    </div>
    <div class="rx-fila">
      ${campo('p-cobertura', 'Health coverage', p.cobertura, 'placeholder="Particular / OSDE / PAMI"')}
      ${campo('p-afiliado', 'Member no.', p.afiliado)}
    </div>
    <div class="rx-cerradura__error" id="p-error"></div>`;
  cablearFechas(caja);
  cablearSexo(caja);
  return caja;
}

function leerFormulario(caja, p) {
  const v = (sel) => caja.querySelector(sel).value;
  return {
    id: p?.id,
    apellido_nombre: v('#p-nombre'),
    dni: v('#p-dni'),
    cuil: v('#p-cuil'),
    sexo: v('#p-sexo'),
    nacimiento: isoDe(caja.querySelector('#p-nac')),
    domicilio: v('#p-domicilio'),
    telefono: v('#p-telefono'),
    email: v('#p-email'),
    cobertura: v('#p-cobertura'),
    afiliado: v('#p-afiliado'),
    /* La ficha clínica no se toca acá: este diálogo es solo la filiación. Si
       mandara los campos vacíos, editar un teléfono borraría las alergias. */
    antecedentes: p?.antecedentes ?? '',
    alergias: p?.alergias ?? '',
    medicacion_habitual: p?.medicacion_habitual ?? '',
    notas: p?.notas ?? '',
  };
}

/**
 * Abre el diálogo y devuelve el paciente guardado, o null si se canceló.
 *
 * Si algo no valida, el diálogo se vuelve a abrir CON LO QUE YA SE HABÍA
 * ESCRITO. Validar después de cerrarlo y mostrar un aviso deja a la doctora
 * tipeando doce campos de nuevo por un dígito verificador mal puesto — que es
 * justo el error más fácil de cometer.
 */
async function editarPaciente(p) {
  let datos = { ...p };

  for (;;) {
    const caja = formularioPaciente(datos);
    const val = await Modal.show({
      title: p?.id ? 'Edit patient' : 'New patient',
      body: caja,
      width: 620,
      actions: [
        { label: 'Cancel', value: null },
        { label: 'Save', value: 'ok', variant: 'primary' },
      ],
    });
    if (val !== 'ok') return null;

    datos = leerFormulario(caja, p);
    const error = !datos.apellido_nombre.trim()
      ? 'The surname and first name are missing.'
      : (validarDNI(datos.dni) || validarCUIL(datos.cuil));

    if (!error) {
      return attempt(() => rx.pacientes.save(datos),
        { errorTitle: 'Could not save the patient' });
    }
    Toast.error('Check the details', error);
  }
}

/* ══ Lista ═══════════════════════════════════════════════════════════════════ */

export async function vistaPacientes(busqueda = '') {
  const q = typeof busqueda === 'string' ? busqueda : '';
  const lista = await rx.pacientes.list({ busqueda: q });

  paint(head({
    title: 'Patients',
    /* `plural()` ya trae el número adelante: no se le antepone otro. */
    sub: lista.length
      ? plural(lista.length, 'patient')
      : 'No patients added yet',
    actions: `<button class="op-btn op-btn--primary op-flashable" id="p-nuevo">
                <i data-icon="plus"></i> New patient</button>`,
  }) + `
    <div class="op-scroll op-grow op-scroll--line-bottom">
      <div class="op-inputwrap rx-buscador" style="margin-bottom:var(--op-4)">
        <i data-icon="search"></i>
        <input class="op-input" id="p-buscar" placeholder="Search by surname, DNI or coverage…"
               spellcheck="false" value="${esc(q)}">
      </div>
      ${lista.length === 0
      ? empty({
        icon: 'users',
        title: q ? 'No one matches that search' : 'No patients yet',
        text: q ? 'Try the surname or the DNI.' : 'Add the first one with the button above.',
      })
      : `<div class="op-list">${lista.map((p) => {
        const a = edad(p.nacimiento);
        return `<div class="op-listitem" data-ficha="${esc(p.id)}" role="button" tabindex="0">
            <div class="op-iconcell"><i data-icon="user"></i></div>
            <div class="op-listitem__main">
              <div class="op-listitem__title">${esc(p.apellido_nombre)}</div>
              <div class="op-listitem__sub op-truncate">${[
          p.dni && `DNI ${p.dni}`,
          a != null && `${a} years`,
          p.cobertura,
        ].filter(Boolean).map(esc).join(' · ') || '—'}</div>
            </div>
            ${p.alergias ? `<div class="op-listitem__aside">
              <span class="op-chip op-chip--danger" data-tip="${esc(p.alergias)}">Allergies</span></div>` : ''}
          </div>`;
      }).join('')}</div>`}
    </div>`);

  const buscar = document.getElementById('p-buscar');
  let reloj = null;
  buscar.addEventListener('input', () => {
    clearTimeout(reloj);
    reloj = setTimeout(() => vistaPacientes(buscar.value), 160);
  });
  Router.onLeave(() => clearTimeout(reloj));

  document.getElementById('p-nuevo').onclick = async () => {
    const nuevo = await editarPaciente({});
    if (nuevo) Router.go('ficha', nuevo.id);
  };

  for (const el of document.querySelectorAll('[data-ficha]')) {
    const ir = () => Router.go('ficha', el.dataset.ficha);
    el.addEventListener('click', ir);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); }
    });
  }
}

/* ══ Evoluciones ═════════════════════════════════════════════════════════════ */

function formularioEvolucion(e = {}) {
  const caja = document.createElement('div');
  caja.className = 'op-col';
  caja.style.gap = 'var(--op-3)';
  caja.innerHTML = `
    <div class="rx-fila">
      ${campoFecha({ id: 'e-fecha', label: 'Date', valor: e.fecha || hoyISO() })}
      <div class="op-field">
        <label class="op-field__label" for="e-motivo">Reason for visit</label>
        <input class="op-input" id="e-motivo" spellcheck="false" value="${esc(e.motivo || '')}">
      </div>
    </div>
    <div class="op-field">
      <label class="op-field__label" for="e-notas">Progress note</label>
      <textarea class="op-textarea" id="e-notas" rows="7"
                placeholder="What was observed, what was decided, what was prescribed.">${esc(e.notas || '')}</textarea>
    </div>
    <div class="op-field">
      <label class="op-field__label" for="e-diag">Diagnosis</label>
      <input class="op-input" id="e-diag" spellcheck="false" value="${esc(e.diagnostico || '')}">
    </div>
    <div class="rx-fila">
      <div class="op-field">
        <label class="op-field__label" for="e-peso">Weight</label>
        <input class="op-input" id="e-peso" placeholder="72 kg" value="${esc(e.peso || '')}">
      </div>
      <div class="op-field">
        <label class="op-field__label" for="e-talla">Height</label>
        <input class="op-input" id="e-talla" placeholder="1.68 m" value="${esc(e.talla || '')}">
      </div>
      <div class="op-field">
        <label class="op-field__label" for="e-presion">Blood pressure</label>
        <input class="op-input" id="e-presion" placeholder="120/80" value="${esc(e.presion || '')}">
      </div>
    </div>`;
  cablearFechas(caja);
  return caja;
}

async function editarEvolucion(pacienteId, e) {
  const caja = formularioEvolucion(e);
  const val = await Modal.show({
    title: e?.id ? 'Edit progress note' : 'New progress note',
    body: caja,
    width: 640,
    actions: [
      { label: 'Cancel', value: null },
      { label: 'Save', value: 'ok', variant: 'primary' },
    ],
  });
  if (val !== 'ok') return false;

  const r = await attempt(() => rx.evoluciones.save({
    id: e?.id,
    paciente_id: pacienteId,
    fecha: isoDe(caja.querySelector('#e-fecha')),
    motivo: caja.querySelector('#e-motivo').value,
    notas: caja.querySelector('#e-notas').value,
    diagnostico: caja.querySelector('#e-diag').value,
    peso: caja.querySelector('#e-peso').value,
    talla: caja.querySelector('#e-talla').value,
    presion: caja.querySelector('#e-presion').value,
  }), { errorTitle: 'Could not save the progress note' });
  return !!r;
}

/* ══ Ficha ═══════════════════════════════════════════════════════════════════ */

/** Un bloque clínico que se edita en el lugar y se guarda al salir del campo.

    `alerta` tiñe el campo de ámbar cuando tiene contenido. Es para alergias, y
    reemplaza al cartel separado que había antes arriba: mostrar el mismo texto
    dos veces a diez centímetros no lo hace más visible, lo hace ruido. Acá el
    dato salta a la vista Y se edita en el mismo lugar. Es ÁMBAR y no rojo:
    en Praxio el rojo dice que algo falló, y una alergia no es una falla,
    es lo que tiene que verse antes de recetar. */
function bloqueClinico(id, rotulo, valor, placeholder, alerta = false) {
  const encendido = alerta && !!String(valor || '').trim();
  return `<div class="op-field${encendido ? ' rx-campo-alerta' : ''}">
    <label class="op-field__label" for="${id}">${esc(rotulo)}</label>
    <textarea class="op-textarea" id="${id}" rows="3" data-clinico
              placeholder="${esc(placeholder)}">${esc(valor || '')}</textarea>
  </div>`;
}

/** "GÓMEZ, MARÍA ELENA" → "MG": la inicial del nombre y la del apellido. */
function iniciales(apellidoNombre = '') {
  const [ape = '', nom = ''] = String(apellidoNombre).split(',').map((x) => x.trim());
  const a = ape[0] || '', n = nom[0] || ape[1] || '';
  return (n + a).toUpperCase() || '··';
}

/** La pestaña elegida de la ficha. Vive lo que vive la sesión: guardar algo
    repinta la ficha, y volver a "Clinical record" cada vez sería un castigo. */
let pestana = 'clinica';

export async function vistaFicha(id) {
  if (!id) return Router.go('pacientes');

  const p = await rx.pacientes.get(id);
  if (!p) {
    paint(head({ title: 'Patient', crumbs: [{ label: 'Patients', view: 'pacientes' }] })
      + empty({ icon: 'users', title: 'That patient no longer exists' }));
    return;
  }

  const [evoluciones, recetas, ordenes] = await Promise.all([
    rx.evoluciones.list(id),
    rx.recetas.list({ pacienteId: id, limite: 50 }),
    rx.ordenes.list({ pacienteId: id, limite: 50 }),
  ]);

  const años = edad(p.nacimiento);
  const filiacion = [
    p.dni && `DNI ${p.dni}`,
    p.cuil && `CUIL ${p.cuil}`,
    p.nacimiento && `${fecha(p.nacimiento)}${años != null ? ` (${años} years)` : ''}`,
    rotuloSexo(p.sexo),
    p.cobertura && (p.afiliado ? `${p.cobertura} · ${p.afiliado}` : p.cobertura),
    p.telefono,
    p.domicilio,
  ].filter(Boolean);

  const alergia = String(p.alergias || '').trim();
  /* La ficha trae hasta 50 recetas y 50 órdenes: con más, la pestaña dice
     "50+" en vez de un 50 que parecería el total. */
  const tab = (v, rotulo, n) => `<button class="op-tab${pestana === v ? ' is-active' : ''}" data-value="${v}">
    ${esc(rotulo)}${n != null ? `<span class="op-tab__count op-num">${n}</span>` : ''}</button>`;

  paint(`
    <div class="rx-pac">
      <div class="rx-pac__avatar" aria-hidden="true">
        <svg viewBox="0 0 56 56"><path d="M28 2.6 49.9 15.3v25.4L28 53.4 6.1 40.7V15.3Z"/></svg>
        <span>${esc(iniciales(p.apellido_nombre))}</span>
      </div>
      <div class="rx-pac__txt">
        <nav class="op-crumbs"><span class="op-crumbs__item" data-goto="pacientes">Patients</span></nav>
        <div class="rx-pac__nombre">${esc(p.apellido_nombre)}</div>
        <div class="rx-pac__meta op-num">
          ${p.dni ? `<span><i>DNI</i> ${esc(p.dni)}</span>` : ''}
          ${años != null ? `<span><i>Age</i> ${años}</span>` : ''}
          ${p.cobertura ? `<span><i>${esc(p.cobertura)}</i>${p.afiliado ? ' ' + esc(p.afiliado) : ''}</span>` : ''}
        </div>
        ${alergia || p.archivado ? `<div class="rx-pac__chips">
          ${alergia ? `<span class="rx-chip-alerta" data-tip="${esc(alergia)}">
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 .8 9.2 5 5 9.2.8 5Z"/></svg>
            <span class="op-truncate">Allergy: ${esc(alergia.split(/[.;\n]/)[0])}</span></span>` : ''}
          ${p.archivado ? '<span class="op-chip">Archived</span>' : ''}
        </div>` : ''}
      </div>
      <!-- Dos emisiones y un solo primario: la receta es lo que más se hace
           desde una ficha, y la orden va al lado en secundario. -->
      <div class="op-viewhead__actions rx-pac__acciones">
        <button class="op-btn op-btn--secondary op-flashable" id="f-orden">
          <i data-icon="orden"></i> New test order</button>
        <button class="op-btn op-btn--primary op-flashable" id="f-receta">
          <i data-icon="plus"></i> New prescription</button>
        <button class="op-iconbtn" id="f-mas" data-tip="More actions"><i data-icon="more"></i></button>
      </div>
    </div>

    <div class="op-tabs rx-tabs" id="f-tabs">
      ${tab('clinica', 'Clinical record')}
      ${tab('evoluciones', 'Progress notes', evoluciones.length)}
      ${tab('recetas', 'Prescriptions', recetas.length >= 50 ? '50+' : recetas.length)}
      ${tab('ordenes', 'Test orders', ordenes.length >= 50 ? '50+' : ordenes.length)}
    </div>

    <div class="op-scroll op-grow op-scroll--line-top op-scroll--line-bottom rx-panes">

      <div class="rx-pane" data-pane="clinica"${pestana === 'clinica' ? '' : ' hidden'}>
        <div class="op-section__head">
          <div class="op-section__title">Saved when you leave each field</div>
          <span class="op-meta" id="f-estado"></span>
        </div>
        <div class="op-card"><div class="op-card__body op-col" style="gap:var(--op-3)">
          ${bloqueClinico('f-alergias', 'Allergies', p.alergias, 'Penicillin, NSAIDs…', true)}
          ${bloqueClinico('f-antecedentes', 'Medical history', p.antecedentes, 'Personal, family, surgical.')}
          ${bloqueClinico('f-medicacion', 'Current medication', p.medicacion_habitual, 'What they already take, with doses.')}
          ${bloqueClinico('f-notas', 'Notes', p.notas, '')}
        </div></div>
      </div>

      <div class="rx-pane" data-pane="evoluciones"${pestana === 'evoluciones' ? '' : ' hidden'}>
        <div class="op-section__head">
          <div class="op-section__title">${evoluciones.length ? 'Newest first' : 'Every visit is written down here'}</div>
          <button class="op-btn op-btn--secondary op-btn--sm op-flashable" id="f-evo-nueva">
            <i data-icon="plus"></i> Add</button>
        </div>
        ${evoluciones.length === 0
    ? empty({ icon: 'ficha', title: 'No progress notes', text: 'The first one starts with the button above.' })
    : `<div class="rx-linea">${evoluciones.map((e) => `
          <div class="rx-evolucion" data-evo="${esc(e.id)}">
            <div class="rx-evolucion__fecha op-num">${esc(fecha(e.fecha))}</div>
            <div class="rx-evolucion__punto"><i></i></div>
            <div class="rx-evolucion__caja">
              <div class="rx-evolucion__cuerpo">
                ${e.motivo ? `<div class="rx-evolucion__motivo">${esc(e.motivo)}</div>` : ''}
                ${e.notas ? `<div class="rx-evolucion__notas op-copyable">${esc(e.notas)}</div>` : ''}
                ${e.diagnostico ? `<div class="op-meta">Diagnosis: ${esc(e.diagnostico)}</div>` : ''}
                ${(e.peso || e.talla || e.presion) ? `<div class="rx-evolucion__signos">
                  ${e.presion ? `<span class="op-chip op-chip--mono">BP ${esc(e.presion)}</span>` : ''}
                  ${e.peso ? `<span class="op-chip op-chip--mono">${esc(e.peso)}</span>` : ''}
                  ${e.talla ? `<span class="op-chip op-chip--mono">${esc(e.talla)}</span>` : ''}
                </div>` : ''}
              </div>
              <div class="op-rowactions">
                <button class="op-iconbtn op-iconbtn--sm" data-evo-editar="${esc(e.id)}"
                        data-tip="Edit"><i data-icon="edit"></i></button>
                <button class="op-iconbtn op-iconbtn--sm" data-evo-borrar="${esc(e.id)}"
                        data-tip="Delete"><i data-icon="trash"></i></button>
              </div>
            </div>
          </div>`).join('')}</div>`}
      </div>

      <div class="rx-pane" data-pane="recetas"${pestana === 'recetas' ? '' : ' hidden'}>
        ${recetas.length === 0
    ? empty({ icon: 'file', title: 'No prescriptions issued' })
    : `<div class="op-list">${recetas.map((r) => `
          <div class="op-listitem" data-receta="${esc(r.id)}" role="button" tabindex="0">
            <div class="op-iconcell"><i data-icon="file"></i></div>
            <div class="op-listitem__main">
              <div class="op-listitem__title op-truncate">${esc(r.detalle || '—')}</div>
              <div class="op-listitem__sub">${plural(r.items, 'medication')} ·
                ${esc(nombrePlantilla(r.plantilla))} template</div>
            </div>
            <div class="op-listitem__aside op-num">${esc(fecha(r.fecha))}</div>
          </div>`).join('')}</div>`}
      </div>

      <div class="rx-pane" data-pane="ordenes"${pestana === 'ordenes' ? '' : ' hidden'}>
        ${ordenes.length === 0
    ? empty({ icon: 'orden', title: 'No test orders issued' })
    : `<div class="op-list">${ordenes.map((o) => `
          <div class="op-listitem" data-orden="${esc(o.id)}" role="button" tabindex="0">
            <div class="op-iconcell"><i data-icon="orden"></i></div>
            <div class="op-listitem__main">
              <div class="op-listitem__title op-truncate">${esc(o.detalle || '—')}</div>
              <div class="op-listitem__sub">${plural(o.items, 'test')}${
      o.diagnostico ? ` · ${esc(o.diagnostico)}` : ''}</div>
            </div>
            <div class="op-listitem__aside op-num">${esc(fecha(o.fecha))}</div>
          </div>`).join('')}</div>`}
      </div>
    </div>`);

  /* ── Pestañas ──────────────────────────────────────────────────────────────
     Lo de antes se va al instante y lo nuevo AFLORA (la firma de Opal): con
     una salida animada, el cambio de pestaña se sentiría lento. La elegida se
     recuerda mientras dure la sesión, así guardar algo no te devuelve arriba. */
  bindSwitcher(document.getElementById('f-tabs'), (valor) => {
    pestana = valor;
    for (const el of document.querySelectorAll('.rx-pane')) {
      const on = el.dataset.pane === valor;
      el.hidden = !on;
      if (on) { el.classList.remove('is-entrando'); void el.offsetWidth; el.classList.add('is-entrando'); }
    }
    document.querySelector('.rx-panes')?.scrollTo({ top: 0 });
  });
  document.querySelector('.rx-pac [data-goto]').onclick = () => Router.go('pacientes');

  /* ── El panel derecho: la filiación ────────────────────────────────────────
     Lo que identifica al paciente, a la vista mientras se trabaja en su ficha.
     Se vacía al salir de la ficha y al bloquear (app.js): un dato de paciente
     no se queda en el DOM de una pantalla que ya no lo muestra. */
  const fila = (k, v) => (v ? `<span class="op-kv__k">${esc(k)}</span><span class="op-kv__v op-kv__v--wrap">${esc(v)}</span>` : '');
  const conDatos = [p.dni, p.cuil, p.nacimiento, p.sexo, p.cobertura, p.telefono, p.domicilio].some(Boolean);
  const panel = document.getElementById('panel');
  panel.innerHTML = `<div class="op-panel__swap">
    <div class="op-panel__head"><div class="op-panel__title">Personal details</div></div>
    <div class="op-panel__body op-scroll">
      ${conDatos ? `<div class="op-kv rx-kv">
        ${fila('DNI', p.dni)}
        ${fila('CUIL', p.cuil)}
        ${fila('Born', p.nacimiento && `${fecha(p.nacimiento)}${años != null ? ` · ${años} years` : ''}`)}
        ${fila('Sex', rotuloSexo(p.sexo))}
        ${fila('Coverage', p.cobertura)}
        ${fila('Member no.', p.afiliado)}
        ${fila('Phone', p.telefono)}
        ${fila('Address', p.domicilio)}
      </div>` : '<div class="op-meta">No personal details.</div>'}
    </div>
    <div class="op-panel__foot">
      <button class="op-btn op-btn--secondary op-flashable" id="f-editar"><i data-icon="edit"></i> Edit details</button>
    </div>
  </div>`;
  Icons.mount(panel);
  document.getElementById('f-editar').onclick = async () => {
    if (await editarPaciente(p)) vistaFicha(id);
  };
  Shell.set({ panel: true });

  /* ── Ficha clínica: se guarda al salir del campo, no con un botón ──────────
     Es lo que se espera de un cuaderno. Solo escribe si algo cambió de verdad:
     un blur sin edición no tiene por qué tocar el disco. */
  const estado = document.getElementById('f-estado');
  const campos = {
    alergias: document.getElementById('f-alergias'),
    antecedentes: document.getElementById('f-antecedentes'),
    medicacion_habitual: document.getElementById('f-medicacion'),
    notas: document.getElementById('f-notas'),
  };
  const original = Object.fromEntries(
    Object.entries(campos).map(([k, el]) => [k, el.value]));

  for (const [clave, el] of Object.entries(campos)) {
    el.addEventListener('blur', async () => {
      if (el.value === original[clave]) return;
      await attempt(async () => {
        await rx.pacientes.save({ ...p, ...Object.fromEntries(
          Object.entries(campos).map(([k, e2]) => [k, e2.value])) });
        original[clave] = el.value;
        estado.textContent = 'Saved';
        setTimeout(() => { if (estado.textContent === 'Saved') estado.textContent = ''; }, 2200);
        /* Si tocó las alergias, el chip ámbar de arriba tiene que reflejarlo. */
        if (clave === 'alergias') vistaFicha(id);
      }, { errorTitle: 'Could not save the record' });
    });
  }

  /* ── Acciones ── */
  document.getElementById('f-receta').onclick = () => Router.go('receta', id);
  document.getElementById('f-orden').onclick = () => Router.go('orden', id);

  document.getElementById('f-mas').onclick = (ev) => {
    Menu.show(ev.currentTarget, [
      { label: 'Edit personal details', icon: 'edit', onSelect: async () => {
        if (await editarPaciente(p)) vistaFicha(id);
      } },
      { sep: true },
      { label: p.archivado ? 'Unarchive' : 'Archive', icon: 'archivar', onSelect: async () => {
        await attempt(() => rx.pacientes.archivar(id, !p.archivado));
        Toast.show({ title: p.archivado ? 'Unarchived' : 'Archived', icon: 'archivar' });
        Router.go('pacientes');
      } },
      { label: 'Delete patient', icon: 'trash', danger: true, onSelect: async () => {
        const emitidos = [
          recetas.length && plural(recetas.length, 'prescription'),
          ordenes.length && plural(ordenes.length, 'test order'),
        ].filter(Boolean).join(', ');

        const ok = await Modal.confirm({
          title: 'Delete the patient',
          /* Cada cosa se nombra solo si existe: "0 órdenes se conservan" no
             dice nada y encima suena a que algo falló. Y la frase no concuerda
             con el número —"Lo ya emitido"— porque acá pueden quedar una sola
             receta, tres órdenes, o las dos cosas. */
          sub: (evoluciones.length
               ? `Their ${plural(evoluciones.length, 'progress note')} will be deleted too. `
               : '')
             + (emitidos
               ? `What was already issued is kept (${emitidos}), because those are documents `
                 + 'that have already been printed. '
               : '')
             + 'This cannot be undone.',
          confirmLabel: 'Delete',
          danger: true,
        });
        if (!ok) return;
        await attempt(() => rx.pacientes.remove(id));
        Toast.show({ title: 'Patient deleted', icon: 'trash' });
        Router.go('pacientes');
      } },
    ], { align: 'end' });
  };

  document.getElementById('f-evo-nueva').onclick = async () => {
    if (await editarEvolucion(id, {})) vistaFicha(id);
  };

  for (const b of document.querySelectorAll('[data-evo-editar]')) {
    b.onclick = async () => {
      const e = evoluciones.find((x) => x.id === b.dataset.evoEditar);
      if (e && await editarEvolucion(id, e)) vistaFicha(id);
    };
  }

  for (const b of document.querySelectorAll('[data-evo-borrar]')) {
    b.onclick = async () => {
      const e = evoluciones.find((x) => x.id === b.dataset.evoBorrar);
      const ok = await Modal.confirm({
        title: 'Delete the progress note',
        sub: `The one from ${fecha(e.fecha)}. This cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      await attempt(() => rx.evoluciones.remove(e.id));
      vistaFicha(id);
    };
  }

  for (const el of document.querySelectorAll('[data-receta]')) {
    const ir = () => Router.go('recetas', el.dataset.receta);
    el.addEventListener('click', ir);
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ir(); }
    });
  }

  for (const el of document.querySelectorAll('[data-orden]')) {
    const ir = () => Router.go('ordenes', el.dataset.orden);
    el.addEventListener('click', ir);
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ir(); }
    });
  }
}
