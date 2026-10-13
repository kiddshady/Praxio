/* Ajustes — los datos que salen impresos al pie de la receta, y la seguridad. */

import { Modal, Toast } from '../overlays.js';
import { paint, head, esc, attempt } from '../ui.js';
import { bindSwitcher, frase } from '../motion.js';
import { campoFecha, cablearFechas, isoDe } from '../campo-fecha.js';
import { S } from '../tienda.js';
import { PLANTILLAS } from '../hoja.js';
import Router from '../router.js';
import {
  estadoActualizacion, describirEstado, buscarActualizacion,
  instalarActualizacion, onActualizacion,
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
      <div>Se vuelve a cifrar la base entera con la contraseña nueva. Puede tardar unos
      segundos. <strong>La contraseña vieja deja de servir</strong>, también para los
      respaldos que hagas de ahora en más.</div>
    </div>
    <div class="op-field">
      <label class="op-field__label" for="c-actual">Contraseña actual</label>
      <input class="op-input" type="password" id="c-actual" autocomplete="current-password">
    </div>
    <div class="op-field">
      <label class="op-field__label" for="c-nueva">Contraseña nueva</label>
      <input class="op-input" type="password" id="c-nueva" minlength="8" autocomplete="new-password">
      <span class="op-field__hint">Mínimo 8 caracteres.</span>
    </div>
    <div class="op-field">
      <label class="op-field__label" for="c-nueva2">Repetila</label>
      <input class="op-input" type="password" id="c-nueva2" autocomplete="new-password">
    </div>
    <div class="rx-cerradura__error" id="c-error"></div>`;

  /* El modal se cierra con el valor del botón, así que la validación va acá
     adentro: si algo no cierra, se avisa y NO se deja cerrar el diálogo. */
  const val = await Modal.show({
    title: 'Cambiar la contraseña',
    body: caja,
    width: 480,
    actions: [
      { label: 'Cancelar', value: null },
      { label: 'Cambiar', value: 'ok', variant: 'primary' },
    ],
  });
  if (val !== 'ok') return;

  const actual = caja.querySelector('#c-actual').value;
  const nueva = caja.querySelector('#c-nueva').value;
  const nueva2 = caja.querySelector('#c-nueva2').value;

  if (nueva.length < 8) return Toast.error('Contraseña muy corta', 'Necesita al menos 8 caracteres.');
  if (nueva !== nueva2) return Toast.error('No coinciden', 'Las dos contraseñas nuevas tienen que ser iguales.');

  await attempt(async () => {
    await rx.sesion.cambiarClave(actual, nueva);
    Toast.show({ title: 'Contraseña cambiada', text: 'La base quedó recifrada.', icon: 'key' });
  }, { errorTitle: 'No se pudo cambiar la contraseña' });
}

export async function vistaAjustes() {
  const [medico, ajustes, sesion] = await Promise.all([
    rx.medico.get(), opal.settings.get(), rx.sesion.estado(),
  ]);
  S.medico = medico;
  S.ajustes = ajustes;

  paint(head({
    title: 'Ajustes',
    sub: 'Tus datos profesionales salen impresos al pie de cada receta',
  }) + `
    <div class="op-scroll op-grow op-scroll--line-bottom">

      <div class="op-section">
        <div class="op-section__head"><div class="op-section__title">Profesional</div></div>
        <div class="op-card"><div class="op-card__body op-col" style="gap:var(--op-3)">
          ${campo('a-nombre', 'Apellido y nombre', medico.apellido_nombre, { placeholder: 'DRA. LÓPEZ, ANA' })}
          <div class="rx-fila">
            ${campo('a-matricula', 'Matrícula', medico.matricula, { placeholder: '12345' })}
            ${campo('a-especialidad', 'Especialidad', medico.especialidad, { placeholder: 'Psiquiatría' })}
          </div>
          ${campo('a-colegio', 'Colegio / Circunscripción', medico.colegio,
    { placeholder: 'Colegio de Médicos de Santa Fe, 1ra. Circ.' })}
          <div class="rx-fila">
            ${campo('a-licencia', 'Licencia Sanitaria Federal', medico.licencia_sanitaria)}
            ${campoFecha({ id: 'a-vigencia', label: 'Vigencia', valor: medico.fecha_vigencia })}
          </div>
          <div class="rx-fila">
            ${campo('a-domicilio', 'Domicilio del consultorio', medico.domicilio)}
            ${campo('a-telefono', 'Teléfono', medico.telefono)}
          </div>
          <div class="op-row" style="justify-content:flex-end;gap:var(--op-2)">
            <span class="op-meta" id="a-estado"></span>
            <button class="op-btn op-btn--primary op-flashable" id="a-guardar">Guardar</button>
          </div>
        </div></div>
      </div>

      <div class="op-section">
        <div class="op-section__head"><div class="op-section__title">Recetas</div></div>
        <div class="op-card"><div class="op-card__body">
          <div class="op-field" style="max-width:320px">
            <label class="op-field__label">Plantilla por defecto</label>
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
        <div class="op-section__head"><div class="op-section__title">Actualizaciones</div></div>
        <div class="op-card"><div class="op-card__body">
          <div class="op-kv">
            <span class="op-kv__k">Versión</span>
            <span class="op-kv__v op-mono">${esc(S.info?.version || '—')}</span>
            <span class="op-kv__k">Estado</span>
            <span class="op-kv__v op-kv__v--wrap" id="upd-estado">${esc(describirEstado())}</span>
          </div>
          <div class="op-row" style="gap:var(--op-2);--op-plegable-gap:var(--op-2);margin-top:var(--op-4);flex-wrap:wrap">
            <button class="op-btn op-btn--secondary op-flashable" id="btn-buscar-upd">
              <i data-icon="retry"></i> Buscar actualizaciones</button>
            <button class="op-btn op-btn--primary op-flashable op-plegable--ancho" id="btn-instalar-upd" hidden>
              <i data-icon="download"></i> Reiniciar y actualizar</button>
            <button class="op-btn op-btn--ghost op-flashable" id="btn-releases">
              <i data-icon="external"></i> Ver versiones en GitHub</button>
          </div>
          <p class="op-meta" style="margin-top:var(--op-4);line-height:1.65">
            La app instalada busca una versión nueva al abrirse y la descarga en segundo plano.
            Nunca se reinicia sola: cuando esté lista, elegís cuándo aplicarla.
          </p>
        </div></div>
      </div>

      <div class="op-section">
        <div class="op-section__head"><div class="op-section__title">Seguridad</div></div>
        <div class="op-card"><div class="op-card__body op-col" style="gap:var(--op-4)">

          <div class="op-row" style="gap:var(--op-3);align-items:flex-start">
            <div class="op-grow">
              <div>Bloquear sola por inactividad</div>
              <div class="op-meta">Cierra la base y pide la contraseña después de un rato sin uso.</div>
            </div>
            <div class="op-field" style="max-width:120px">
              <input class="op-input op-input--mono" id="a-inactividad" type="number" min="0" max="240"
                     value="${esc(ajustes.bloqueoInactividad ?? 15)}">
              <span class="op-field__hint">minutos · 0 = nunca</span>
            </div>
          </div>

          <div class="op-row" style="gap:var(--op-3);align-items:center">
            <div class="op-grow">
              <div>Recordar la contraseña en esta computadora</div>
              <div class="op-meta">${sesion.recordada
      ? 'Está recordada: la app abre sin pedirla. Apagalo si la PC es compartida.'
      : 'Ahora pide la contraseña en cada arranque.'}</div>
            </div>
            ${interruptor('a-recordar', sesion.recordada)}
          </div>

          <div class="op-row" style="gap:var(--op-2);flex-wrap:wrap">
            <button class="op-btn op-btn--secondary op-flashable" id="a-clave">
              <i data-icon="key"></i> Cambiar la contraseña</button>
            <button class="op-btn op-btn--secondary op-flashable" id="a-respaldo">
              <i data-icon="save"></i> Guardar un respaldo cifrado</button>
            <button class="op-btn op-btn--ghost op-flashable" id="a-carpeta">
              <i data-icon="folder"></i> Abrir la carpeta de datos</button>
          </div>
        </div></div>
      </div>

      <div class="op-section">
        <div class="op-section__head"><div class="op-section__title">Importar</div></div>
        <div class="op-card"><div class="op-card__body op-row" style="gap:var(--op-3);align-items:center">
          <div class="op-grow">
            <div>Traer los datos del prototipo viejo</div>
            <div class="op-meta">Lee el <span class="op-mono">store.json</span> de la app anterior
              y suma pacientes, medicamentos y tus datos. No pisa nada de lo que ya haya.</div>
          </div>
          <button class="op-btn op-btn--secondary op-flashable" id="a-importar">
            <i data-icon="upload"></i> Elegir archivo</button>
        </div></div>
      </div>

      <div class="op-meta" style="padding:var(--op-4) 0">
        Quirotech v${esc(S.info?.version || '')} · Electron ${esc(S.info?.electron || '')} ·
        esquema ${esc(S.info?.esquema || '')}<br>
        Datos en <span class="op-mono op-copyable">${esc(sesion.carpeta || '')}</span>
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
      estado.textContent = 'Guardado';
      setTimeout(() => { estado.textContent = ''; }, 2400);
    }, { errorTitle: 'No se pudo guardar' });
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
    const texto = document.getElementById('upd-estado');
    // frase(): si cambia solo el porcentaje destella; si cambia la frase, relevo.
    if (texto) frase(texto, esc(describirEstado(e)));
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
        title: 'Se pide al desbloquear',
        text: 'Marcá "Recordar en esta computadora" la próxima vez que la app te pida la contraseña.',
        icon: 'info',
      });
      return;
    }
    await attempt(async () => {
      await rx.sesion.olvidarPC();
      recordar.classList.remove('is-on');
      recordar.setAttribute('aria-checked', 'false');
      Toast.show({ title: 'Listo', text: 'A partir del próximo arranque va a pedir la contraseña.', icon: 'lock' });
      vistaAjustes();
    }, { errorTitle: 'No se pudo olvidar la contraseña' });
  };

  document.getElementById('a-clave').onclick = cambiarClave;

  document.getElementById('a-respaldo').onclick = () => attempt(async () => {
    const r = await rx.respaldo.exportar();
    if (!r.cancelado) Toast.show({ title: 'Respaldo guardado', text: r.ruta, icon: 'save' });
  }, { errorTitle: 'No se pudo guardar el respaldo' });

  document.getElementById('a-carpeta').onclick = () => rx.respaldo.carpeta();

  document.getElementById('a-importar').onclick = () => attempt(async () => {
    const r = await rx.respaldo.importarPrototipo();
    if (r.cancelado) return;
    Toast.show({
      title: 'Importado',
      text: `${r.pacientes} pacientes y ${r.medicamentos} medicamentos.`,
      icon: 'upload',
    });
    vistaAjustes();
  }, { errorTitle: 'No se pudo importar' });
}
