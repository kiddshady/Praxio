/* Ajustes — los datos que salen impresos al pie de la receta, y la seguridad. */

import { Modal, Toast } from '../overlays.js';
import { paint, head, esc, attempt } from '../ui.js';
import { bindSwitcher } from '../motion.js';
import { campoFecha, cablearFechas, isoDe } from '../campo-fecha.js';
import { S } from '../tienda.js';
import { PLANTILLAS } from '../hoja.js';
import Router from '../router.js';
import {
  estadoActualizacion, describirEstado, buscarActualizacion,
  instalarActualizacion, onActualizacion, pintarEstado,
} from '../actualizacion.js';

const rx = window.rx;
const opal = window.opal;

function campo(id, rotulo, valor, { placeholder = '', ancho = '' } = {}) {
  return `<div class="op-field" ${ancho ? `style="max-width:${ancho}"` : ''}>
    <label class="op-field__label" for="${id}">${esc(rotulo)}</label>
    <input class="op-input" id="${id}" spellcheck="false"
           placeholder="${esc(placeholder)}" value="${esc(valor || '')}">
  </div>`;
}

function interruptor(id, encendido) {
  return `<button type="button" class="op-switch${encendido ? ' is-on' : ''}" id="${id}"
            role="switch" aria-checked="${encendido}"><span></span></button>`;
}

async function cambiarClave() {
  const caja = document.createElement('div');
  caja.className = 'op-col';
  caja.style.gap = 'var(--op-3)';
  caja.innerHTML = `
    <div class="rx-aviso">
      <i data-icon="key"></i>
      <div>The whole database is encrypted again with the new password. It may take a few
      seconds. <strong>The old password stops working</strong>, also for the backups
      you make from now on.</div>
    </div>
    <div class="op-field">
      <label class="op-field__label" for="c-actual">Current password</label>
      <input class="op-input" type="password" id="c-actual" autocomplete="current-password">
    </div>
    <div class="op-field">
      <label class="op-field__label" for="c-nueva">New password</label>
      <input class="op-input" type="password" id="c-nueva" minlength="8" autocomplete="new-password">
      <span class="op-field__hint">At least 8 characters.</span>
    </div>
    <div class="op-field">
      <label class="op-field__label" for="c-nueva2">Repeat it</label>
      <input class="op-input" type="password" id="c-nueva2" autocomplete="new-password">
    </div>
    <div class="rx-cerradura__error" id="c-error"></div>`;

  /* El modal se cierra con el valor del botón, así que la validación va acá
     adentro: si algo no cierra, se avisa y NO se deja cerrar el diálogo. */
  const val = await Modal.show({
    title: 'Change the password',
    body: caja,
    width: 480,
    actions: [
      { label: 'Cancel', value: null },
      { label: 'Change', value: 'ok', variant: 'primary' },
    ],
  });
  if (val !== 'ok') return;

  const actual = caja.querySelector('#c-actual').value;
  const nueva = caja.querySelector('#c-nueva').value;
  const nueva2 = caja.querySelector('#c-nueva2').value;

  if (nueva.length < 8) return Toast.error('Password too short', 'It needs at least 8 characters.');
  if (nueva !== nueva2) return Toast.error('They do not match', 'The two new passwords must be the same.');

  await attempt(async () => {
    await rx.sesion.cambiarClave(actual, nueva);
    Toast.show({ title: 'Password changed', text: 'The database was re-encrypted.', icon: 'key' });
  }, { errorTitle: 'Could not change the password' });
}

export async function vistaAjustes() {
  const [medico, ajustes, sesion] = await Promise.all([
    rx.medico.get(), opal.settings.get(), rx.sesion.estado(),
  ]);
  S.medico = medico;
  S.ajustes = ajustes;

  paint(head({
    title: 'Settings',
    sub: 'Your professional details are printed at the foot of every prescription',
  }) + `
    <div class="op-scroll op-grow op-scroll--line-bottom">

      <div class="op-section">
        <div class="op-section__head"><div class="op-section__title">Professional</div></div>
        <div class="op-card"><div class="op-card__body op-col" style="gap:var(--op-3)">
          ${campo('a-nombre', 'Surname and first name', medico.apellido_nombre, { placeholder: 'DRA. LÓPEZ, ANA' })}
          <div class="rx-fila">
            ${campo('a-matricula', 'License number', medico.matricula, { placeholder: '12345' })}
            ${campo('a-especialidad', 'Specialty', medico.especialidad, { placeholder: 'Psiquiatría' })}
          </div>
          ${campo('a-colegio', 'Medical board / District', medico.colegio,
    { placeholder: 'Colegio de Médicos de Santa Fe, 1ra. Circ.' })}
          <div class="rx-fila">
            ${campo('a-licencia', 'Federal Health License', medico.licencia_sanitaria)}
            ${campoFecha({ id: 'a-vigencia', label: 'Valid until', valor: medico.fecha_vigencia })}
          </div>
          <div class="rx-fila">
            ${campo('a-domicilio', 'Practice address', medico.domicilio)}
            ${campo('a-telefono', 'Phone', medico.telefono)}
          </div>
          <div class="op-row" style="justify-content:flex-end;gap:var(--op-2)">
            <span class="op-meta" id="a-estado"></span>
            <button class="op-btn op-btn--primary op-flashable" id="a-guardar">Save</button>
          </div>
        </div></div>
      </div>

      <div class="op-section">
        <div class="op-section__head"><div class="op-section__title">Prescriptions</div></div>
        <div class="op-card"><div class="op-card__body">
          <div class="op-field" style="max-width:320px">
            <label class="op-field__label">Default template</label>
            <div class="op-segmented" id="a-plantilla">
              ${PLANTILLAS.map(([v, n], i) => {
                const activa = PLANTILLAS.some(([x]) => x === ajustes.plantillaPorDefecto)
                  ? ajustes.plantillaPorDefecto === v : i === 0;
                return `<button class="op-segmented__opt${activa ? ' is-active' : ''}"
                      data-value="${v}">${n}</button>`;
              }).join('')}
            </div>
          </div>
        </div></div>
      </div>

      <div class="op-section">
        <div class="op-section__head"><div class="op-section__title">Updates</div></div>
        <div class="op-card"><div class="op-card__body">
          <div class="op-kv">
            <span class="op-kv__k">Version</span>
            <span class="op-kv__v op-mono">${esc(S.info?.version || '—')}</span>
            <span class="op-kv__k">Status</span>
            <span class="op-kv__v op-kv__v--wrap" id="upd-estado">${esc(describirEstado())}</span>
          </div>
          <div class="op-row" style="gap:var(--op-2);margin-top:var(--op-4);flex-wrap:wrap">
            <button class="op-btn op-btn--secondary op-flashable" id="btn-buscar-upd">
              <i data-icon="retry"></i> Check for updates</button>
            <button class="op-btn op-btn--ghost op-flashable" id="btn-releases">
              <i data-icon="external"></i> See releases on GitHub</button>
            <!-- Último: apagado guarda su hueco, y al final de la fila no se nota. -->
            <button class="op-btn op-btn--primary op-flashable op-plegable--ancho" id="btn-instalar-upd" hidden>
              <i data-icon="download"></i> Restart and update</button>
          </div>
          <p class="op-meta" style="margin-top:var(--op-4);line-height:1.65">
            The installed app looks for a new version when it opens and downloads it in the background.
            It never restarts by itself: when it is ready, you choose when to apply it.
          </p>
        </div></div>
      </div>

      <div class="op-section">
        <div class="op-section__head"><div class="op-section__title">Security</div></div>
        <div class="op-card"><div class="op-card__body op-col" style="gap:var(--op-4)">

          <div class="op-row" style="gap:var(--op-3);align-items:flex-start">
            <div class="op-grow">
              <div>Lock automatically when idle</div>
              <div class="op-meta">Closes the database and asks for the password after a while without use.</div>
            </div>
            <div class="op-field" style="max-width:120px">
              <input class="op-input op-input--mono" id="a-inactividad" type="number" min="0" max="240"
                     value="${esc(ajustes.bloqueoInactividad ?? 15)}">
              <span class="op-field__hint">minutes · 0 = never</span>
            </div>
          </div>

          <div class="op-row" style="gap:var(--op-3);align-items:center">
            <div class="op-grow">
              <div>Remember the password on this computer</div>
              <div class="op-meta">${sesion.recordada
      ? 'It is remembered: the app opens without asking for it. Turn it off if the PC is shared.'
      : 'Right now it asks for the password on every start.'}</div>
            </div>
            ${interruptor('a-recordar', sesion.recordada)}
          </div>

          <div class="op-row" style="gap:var(--op-2);flex-wrap:wrap">
            <button class="op-btn op-btn--secondary op-flashable" id="a-clave">
              <i data-icon="key"></i> Change the password</button>
            <button class="op-btn op-btn--secondary op-flashable" id="a-respaldo">
              <i data-icon="save"></i> Save an encrypted backup</button>
            <button class="op-btn op-btn--ghost op-flashable" id="a-carpeta">
              <i data-icon="folder"></i> Open the data folder</button>
          </div>
        </div></div>
      </div>

      <div class="op-section">
        <div class="op-section__head"><div class="op-section__title">Import</div></div>
        <div class="op-card"><div class="op-card__body op-row" style="gap:var(--op-3);align-items:center">
          <div class="op-grow">
            <div>Bring in the data from the old prototype</div>
            <div class="op-meta">Reads the <span class="op-mono">store.json</span> of the previous app
              and adds patients, medications and your details. It does not overwrite anything already here.</div>
          </div>
          <button class="op-btn op-btn--secondary op-flashable" id="a-importar">
            <i data-icon="upload"></i> Choose file</button>
        </div></div>
      </div>

      <div class="op-meta" style="padding:var(--op-4) 0">
        Praxio v${esc(S.info?.version || '')} · Electron ${esc(S.info?.electron || '')} ·
        schema ${esc(S.info?.esquema || '')}<br>
        Data in <span class="op-mono op-copyable">${esc(sesion.carpeta || '')}</span>
      </div>
    </div>`);

  /* ── Profesional ── */
  const estado = document.getElementById('a-estado');
  document.getElementById('a-guardar').onclick = async () => {
    await attempt(async () => {
      S.medico = await rx.medico.save({
        apellido_nombre: document.getElementById('a-nombre').value,
        matricula: document.getElementById('a-matricula').value,
        especialidad: document.getElementById('a-especialidad').value,
        colegio: document.getElementById('a-colegio').value,
        licencia_sanitaria: document.getElementById('a-licencia').value,
        fecha_vigencia: isoDe(document.getElementById('a-vigencia')),
        domicilio: document.getElementById('a-domicilio').value,
        telefono: document.getElementById('a-telefono').value,
      });
      estado.textContent = 'Saved';
      setTimeout(() => { estado.textContent = ''; }, 2400);
    }, { errorTitle: 'Could not save' });
  };

  /* ── Plantilla ──
     El segmentado se cablea con bindSwitcher y no a mano: es lo que mide la
     cápsula y la hace viajar. Sin él, `syncSegmented` no encuentra ningún
     `.op-segmented__opt`, sale sin setear el ancho, y la cápsula queda encima
     de las dos opciones tapándoles el texto. */
  bindSwitcher(document.getElementById('a-plantilla'), async (valor) => {
    S.ajustes = await opal.settings.save({ plantillaPorDefecto: valor });
  });

  /* ── Actualizaciones ── */
  const pintarActualizacion = (e) => {
    // Cada fase nueva, relevo; bajando, el porcentaje corre sin destello.
    pintarEstado(document.getElementById('upd-estado'), e);
    const instalar = document.getElementById('btn-instalar-upd');
    if (instalar) instalar.hidden = e.fase !== 'listo';
    const buscar = document.getElementById('btn-buscar-upd');
    if (buscar) buscar.disabled = e.fase === 'buscando' || e.fase === 'descargando';
  };
  pintarActualizacion(estadoActualizacion());
  Router.onLeave(onActualizacion(pintarActualizacion));
  document.getElementById('btn-buscar-upd').onclick = () => buscarActualizacion();
  document.getElementById('btn-instalar-upd').onclick = () => instalarActualizacion();
  document.getElementById('btn-releases').onclick = () => window.open(`${S.info.repo}/releases`);

  /* ── Fechas ── */
  cablearFechas(document.getElementById('view'));

  /* ── Seguridad ── */
  const inact = document.getElementById('a-inactividad');
  inact.addEventListener('change', async () => {
    const n = Math.max(0, Math.min(240, Number(inact.value) || 0));
    inact.value = n;
    S.ajustes = await opal.settings.save({ bloqueoInactividad: n });
  });

  const recordar = document.getElementById('a-recordar');
  recordar.onclick = async () => {
    const encender = !recordar.classList.contains('is-on');
    if (encender) {
      /* Para recordarla hay que tenerla: la clave derivada no está en el
         renderer, y volver a pedirla es más honesto que guardar algo a medias. */
      Toast.show({
        title: 'It is set when you unlock',
        text: 'Tick "Remember on this computer" the next time the app asks for your password.',
        icon: 'info',
      });
      return;
    }
    await attempt(async () => {
      await rx.sesion.olvidarPC();
      recordar.classList.remove('is-on');
      recordar.setAttribute('aria-checked', 'false');
      Toast.show({ title: 'Done', text: 'From the next start on it will ask for the password.', icon: 'lock' });
      vistaAjustes();
    }, { errorTitle: 'Could not forget the password' });
  };

  document.getElementById('a-clave').onclick = cambiarClave;

  document.getElementById('a-respaldo').onclick = () => attempt(async () => {
    const r = await rx.respaldo.exportar();
    if (!r.cancelado) Toast.show({ title: 'Backup saved', text: r.ruta, icon: 'save' });
  }, { errorTitle: 'Could not save the backup' });

  document.getElementById('a-carpeta').onclick = () => rx.respaldo.carpeta();

  document.getElementById('a-importar').onclick = () => attempt(async () => {
    const r = await rx.respaldo.importarPrototipo();
    if (r.cancelado) return;
    Toast.show({
      title: 'Imported',
      text: `${r.pacientes} patients and ${r.medicamentos} medications.`,
      icon: 'upload',
    });
    vistaAjustes();
  }, { errorTitle: 'Could not import' });
}
