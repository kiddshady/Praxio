/* ═══════════════════════════════════════════════════════════════════════════
   Rx — la plantilla de la hoja

   Un solo módulo, dos consumidores: la vista previa dentro de la app y la
   ventana oculta que imprime. Si esto se duplicara, tarde o temprano la previa
   mostraría algo que el papel no dice — que en una receta no es un detalle
   cosmético.

   Recibe siempre la MISMA forma de dato, que es la que queda congelada en
   `receta.snapshot`. Así reimprimir una receta de marzo pinta exactamente lo
   que salió en marzo.

   Son cinco hojas: la receta clásica, la RPE y la retro, y la orden de
   estudios en RPE o en retro. La retro es la RPE con otra ropa (ver más
   abajo). Cada orden usa la plantilla de su receta y cambia solamente el
   cuerpo: estudios en vez de medicamentos y sin envases. Encabezado,
   cobertura y pie son literalmente las mismas funciones, no una copia
   parecida.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Las plantillas de receta, en el orden en que se ofrecen, con el nombre que
    ve el usuario. La misma lista vive en db.cjs (PLANTILLAS), que es la que
    decide qué se guarda. */
export const PLANTILLAS = [
  ['clasica', 'Clásica'],
  ['rpe', 'RPE'],
  ['retro', 'Retro'],
];

/** Las que llevan número de receta en el formulario. La RPE lo pide aunque su
    hoja no lo imprima: así quedaba, y se sigue guardando con la receta. */
export const CON_NUMERO = ['rpe', 'retro'];

/** Las plantillas de la orden de estudios. La misma lista vive en db.cjs
    (PLANTILLAS_ORDEN). Una orden sin plantilla (las de antes de la 0.3.0) es
    RPE. */
export const PLANTILLAS_ORDEN = [
  ['rpe', 'RPE'],
  ['retro', 'Retro'],
];

/** Lo que encabeza el pedido si no se escribió otra cosa. Una orden vieja, sin
    el campo, sale con esto; uno vaciado a propósito sale vacío. */
export const ENCABEZADO_ORDEN = 'Solicito:';

function encabezadoOrden(o) {
  return o.encabezado == null ? ENCABEZADO_ORDEN : String(o.encabezado);
}

export function nombrePlantilla(p) {
  return (PLANTILLAS.find(([v]) => v === p) || PLANTILLAS[0])[1];
}

const CRUDO = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => CRUDO[c]);
}

/** ISO (2026-08-07) → 07/08/2026. Lo que no sea ISO se devuelve como vino. */
export function fechaLarga(f) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(f || '');
}

/** Los años cumplidos a la fecha de la receta, para el encabezado. */
export function edad(nacimiento, hasta) {
  const n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(nacimiento || ''));
  if (!n) return null;
  const ref = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(hasta || '')) || null;
  const hoy = ref
    ? new Date(Number(ref[1]), Number(ref[2]) - 1, Number(ref[3]))
    : new Date();
  const nac = new Date(Number(n[1]), Number(n[2]) - 1, Number(n[3]));
  let a = hoy.getFullYear() - nac.getFullYear();
  const antes = hoy.getMonth() < nac.getMonth()
    || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate());
  if (antes) a -= 1;
  return a >= 0 && a < 130 ? a : null;
}

function fila(rotulo, valor) {
  return valor ? `<dt>${esc(rotulo)}</dt><dd>${esc(valor)}</dd>` : '';
}

/* ── Piezas que comparten la clásica y la orden ──────────────────────────── */

/** El encabezado con la filiación del paciente. La edad se calcula A LA FECHA
    del documento, no a hoy: una orden de marzo dice los años que tenía en
    marzo. */
function bloquePaciente(p, fechaRef) {
  const años = edad(p.nacimiento, fechaRef);
  let h = `<div class="paciente"><dl>`;
  if (p.apellido_nombre) {
    h += fila('Paciente:', p.apellido_nombre);
    h += fila('DNI:', p.dni || '—');
    h += fila('CUIL:', p.cuil);
    h += fila('Sexo:', p.sexo);
    h += fila('F. nacimiento:', p.nacimiento
      ? `${fechaLarga(p.nacimiento)}${años != null ? ` (${años} años)` : ''}` : '');
    h += fila('Domicilio:', p.domicilio);
    h += fila('Cobertura:', p.cobertura);
    h += fila('Afiliado:', p.afiliado);
  } else {
    h += `<dt>Paciente:</dt><dd class="sin-datos">— sin paciente —</dd>`;
  }
  h += `</dl></div>`;
  return h;
}

/** El pie: fecha a la izquierda y el espacio de firma manuscrita a la derecha,
    con el nombre y los sellos debajo de la línea. */
function pieFirmado(m, fechaDoc) {
  let h = `<div class="pie">`;
  h += `<div class="fecha">Fecha: ${esc(fechaLarga(fechaDoc) || '—')}</div>`;
  h += `<div class="firma"><div class="hueco"></div>`;
  h += `<div class="linea">${esc(m.apellido_nombre || 'Firma y sello')}</div>`;
  if (m.matricula) h += `<div class="sello">Mat. ${esc(m.matricula)}</div>`;
  if (m.especialidad) h += `<div class="sello">${esc(m.especialidad)}</div>`;
  h += `</div></div>`;
  return h;
}

/* ── Clásica ─────────────────────────────────────────────────────────────── */

function clasica(r, duplicado) {
  const p = r.paciente || {};
  const m = r.medico || {};
  const items = r.items || [];

  let h = `<section class="rx-hoja rx-hoja--clasica">`;
  h += duplicado
    ? `<span class="marca-dup">Duplicado</span>`
    : `<span class="marca-dup marca-dup--vacia">Duplicado</span>`;

  h += `<div class="cuerpo">` + bloquePaciente(p, r.fecha);

  h += `<div class="rp">Rp/</div>`;
  for (const it of items) {
    h += `<div class="item"><div class="nombre">${esc(it.nombre || '—')}</div><div class="detalle">`;
    if (it.dosis) h += `<span>${esc(it.dosis)}</span>`;
    h += `<div class="fila">`;
    if (it.marca) h += `<span>Marca sugerida: ${esc(it.marca)}</span>`;
    h += `<span>Envases: ${esc(it.envases || 1)}</span>`;
    h += `</div>`;
    if (it.diagnostico) h += `<span>Diagnóstico: ${esc(it.diagnostico)}</span>`;
    if (it.indicaciones) h += `<span>Indicaciones: ${esc(it.indicaciones)}</span>`;
    h += `</div></div>`;
  }
  h += `</div>`;

  h += pieFirmado(m, r.fecha);
  h += `</section>`;
  return h;
}

/* ── RPE ─────────────────────────────────────────────────────────────────── */

function cabeceraRpe(p) {
  let h = '';
  h += `<div class="caja-paciente">`;
  if (p.apellido_nombre) {
    h += `<div class="nombre">Paciente: ${esc(p.apellido_nombre)}</div>`;
    h += `<div class="fila"><span>CUIL: ${esc(p.cuil || '—')}</span><span>DNI: ${esc(p.dni || '—')}</span></div>`;
    if (p.sexo || p.nacimiento) {
      h += `<div class="fila">`;
      if (p.sexo) h += `<span>Sexo: ${esc(p.sexo)}</span>`;
      if (p.nacimiento) h += `<span>F.Nacimiento: ${esc(fechaLarga(p.nacimiento))}</span>`;
      h += `</div>`;
    }
    if (p.domicilio) h += `<div class="fila"><span>Domicilio: ${esc(p.domicilio)}</span></div>`;
  } else {
    h += `<div class="nombre sin-datos">— sin paciente —</div>`;
  }
  h += `</div>`;

  /* La cobertura va en su propia caja, aparte de la del paciente, como en el
     formulario oficial. Si no está cargada no se dibuja: una caja vacía ocupa
     lugar en la hoja y no dice nada. */
  if (p.cobertura) {
    h += `<div class="caja-cobertura"><span>Cobertura: ${esc(p.cobertura)}</span>`;
    if (p.afiliado) h += `<span>Afiliado: ${esc(p.afiliado)}</span>`;
    h += `</div>`;
  }

  return h;
}

function pieRpe(fechaDoc) {
  let h = `<div class="hueco-firma"></div>`;
  h += `<div class="pie"><div>Emitida: ${esc(fechaLarga(fechaDoc) || '—')}</div>`;
  h += `<div class="firma"><div class="linea"></div><div>Firma y sello</div></div>`;
  h += `</div>`;
  return h;
}

function rpe(r, duplicado) {
  const p = r.paciente || {};
  const items = r.items || [];

  let h = `<section class="rx-hoja rx-hoja--rpe">`;
  h += cabeceraRpe(p);

  h += `<div class="encabezado-rp"><div>Rp/</div>`;
  if (duplicado) h += `<div class="marca-dup">DUPLICADO</div>`;
  h += `<div>Envases</div></div>`;

  items.forEach((it, i) => {
    h += `<div class="item"><div class="principal">`;
    h += `<div class="nombre">${esc(it.nombre || '—')}</div>`;
    if (it.dosis) h += `<div class="dosis">${esc(it.dosis)}</div>`;
    if (it.marca) h += `<div class="marca">Marca sugerida: ${esc(it.marca)}</div>`;
    if (it.diagnostico) h += `<div class="diagnostico">Diagnóstico: ${esc(it.diagnostico)}</div>`;
    if (it.indicaciones) h += `<div class="indicaciones">Indicaciones: ${esc(it.indicaciones)}</div>`;
    h += `</div><div class="envases">${esc(it.envases || 1)}</div></div>`;
    if (i < items.length - 1) h += `<hr class="separador">`;
  });

  h += pieRpe(r.fecha);
  h += `</section>`;
  return h;
}

/* ── Retro ───────────────────────────────────────────────────────────────── */

/* La estructura de la RPE —caja del paciente, caja de cobertura, Rp/ con
   envases, hueco de firma— vestida de recetario de imprenta: lo que vendría
   impreso en el talonario (rótulos, Rp/, membrete) va en tinta verde, y lo que
   se completa en negro, todo en Source Sans 3. Salió de la maqueta de octubre
   de 2026; los valores están en hoja.css.

   Los medicamentos van numerados, y los envases no tienen columna: van pegados
   a la presentación («Comprimidos x 21 x 1 env.»), o al nombre si no hay
   presentación. Lejos a la derecha, el número se leía suelto.

   Es la única que lleva membrete y número de receta: el resto no los imprime.
   Los dos son opcionales, porque un profesional sin cargar o una receta sin
   número tienen que seguir saliendo. Además el membrete se apaga a mano
   (`membrete: false`, congelado en la instantánea); el número sale igual,
   solo en su renglón. Apagado NO reserva lugar arriba: no sirve para
   imprimir sobre una hoja con el membrete ya impreso. */

/** Un dato vacío conserva su renglón: en la retro el punteado ES el campo. */
function campoRetro(rotulo, valor, clase = '') {
  const v = valor ? esc(valor) : '&nbsp;';
  return `<div class="campo ${clase}"><span class="rot">${esc(rotulo)}</span><span class="dato">${v}</span></div>`;
}

function membreteRetro(m, numero) {
  const sello = [m.especialidad, m.matricula ? `Mat. ${m.matricula}` : ''].filter(Boolean).join(' · ');
  const dir = [m.domicilio, m.telefono].filter(Boolean).join(' · ');
  if (!m.apellido_nombre && !numero) return '';
  /* Sin profesional el número no se viste de membrete: la raya doble debajo
     de un renglón con solo el número parece un encabezado vacío. */
  if (!m.apellido_nombre) {
    return `<header class="membrete membrete--solo-numero"><div class="numero">`
      + `<span class="rot">Receta Nº</span><span class="dato">${esc(numero)}</span></div></header>`;
  }
  let h = `<header class="membrete"><div class="prof">`;
  if (m.apellido_nombre) h += `<div class="prof-nombre">${esc(m.apellido_nombre)}</div>`;
  if (sello) h += `<div class="prof-sello rot">${esc(sello)}</div>`;
  if (dir) h += `<div class="prof-dir">${esc(dir)}</div>`;
  h += `</div>`;
  if (numero) h += `<div class="numero"><span class="rot">Receta Nº</span><span class="dato">${esc(numero)}</span></div>`;
  h += `</header>`;
  return h;
}

/** Las cajas del paciente y de la cobertura. Las comparten la receta retro y
    la orden retro. */
function cajasRetro(p) {
  let h = `<div class="caja caja-paciente"><div class="campos">`;
  if (p.apellido_nombre) {
    h += campoRetro('Paciente', p.apellido_nombre, 'campo--ancho campo--nombre');
    h += campoRetro('CUIL', p.cuil) + campoRetro('DNI', p.dni)
       + campoRetro('F. nacimiento', fechaLarga(p.nacimiento));
    h += campoRetro('Sexo', p.sexo) + campoRetro('Domicilio', p.domicilio, 'campo--doble');
  } else {
    h += `<div class="campo campo--ancho"><span class="rot">Paciente</span>`
       + `<span class="dato sin-datos">— sin paciente —</span></div>`;
  }
  h += `</div></div>`;

  if (p.cobertura) {
    h += `<div class="caja caja-cobertura"><div class="campos campos--dos">`;
    h += campoRetro('Cobertura', p.cobertura) + campoRetro('Afiliado Nº', p.afiliado);
    h += `</div></div>`;
  }
  return h;
}

/** El hueco de la firma y el pie con la fecha. Los comparten las dos retro. */
function pieRetro(fechaDoc) {
  let h = `<div class="hueco-firma"></div>`;
  h += `<div class="pie"><div class="emitida"><span class="rot">Emitida:</span>`
     + `<span class="dato">${esc(fechaLarga(fechaDoc) || '—')}</span></div>`;
  h += `<div class="firma"><div class="linea"></div><div class="rot">Firma y sello</div></div></div>`;
  return h;
}

function retro(r, duplicado) {
  const p = r.paciente || {};
  const m = r.medico || {};
  const items = r.items || [];

  let h = `<section class="rx-hoja rx-hoja--retro">`;
  h += membreteRetro(r.membrete === false ? {} : m, String(r.numero || '').trim());
  h += cajasRetro(p);

  h += `<div class="encabezado-rp"><div class="rp">Rp/</div>`;
  if (duplicado) h += `<div class="sello">DUPLICADO</div>`;
  h += `</div>`;

  items.forEach((it, i) => {
    if (i) h += `<div class="separador"></div>`;
    const env = ` <span class="env">x ${esc(it.envases || 1)} env.</span>`;
    h += `<div class="item"><div class="num">${i + 1}.</div><div class="principal">`;
    h += `<div class="dato t1">${esc(it.nombre || '—')}${it.dosis ? '' : env}</div>`;
    if (it.dosis) h += `<div class="dato t1">${esc(it.dosis)}${env}</div>`;
    if (it.marca) h += `<div class="det"><span class="rot">Marca sugerida:</span> <span class="dato t1">${esc(it.marca)}</span></div>`;
    if (it.diagnostico) h += `<div class="det"><span class="rot">Diagnóstico:</span> <span class="dato">${esc(it.diagnostico)}</span></div>`;
    if (it.indicaciones) h += `<div class="det"><span class="rot">Indicaciones:</span> <span class="dato">${esc(it.indicaciones)}</span></div>`;
    h += `</div></div>`;
  });

  h += pieRetro(r.fecha);
  h += `</section>`;
  return h;
}

/* ── Orden de estudios ───────────────────────────────────────────────────── */

/* Es la plantilla RPE, con estudios en vez de medicamentos. Cada estudio ocupa
   un renglón propio y no lleva número: el orden visual alcanza para separar el
   pedido sin convertirlo en una lista numerada. El diagnóstico va UNA vez
   porque corresponde a la orden entera. */
function orden(o) {
  const p = o.paciente || {};
  const items = o.items || [];

  let h = `<section class="rx-hoja rx-hoja--rpe rx-hoja--orden">`;
  h += cabeceraRpe(p);
  h += `<div class="encabezado-rp"><div>${esc(encabezadoOrden(o))}</div></div>`;

  items.forEach((it) => {
    h += `<div class="item estudio"><div class="principal">`;
    h += `<div class="nombre">${esc(it.nombre || '—')}</div>`;
    if (it.aclaracion) h += `<div class="aclaracion">${esc(it.aclaracion)}</div>`;
    h += `</div></div>`;
  });

  /* Solo se ve en la vista previa: emitir una orden sin estudios no se puede.
     Mientras se escribe el primero, evita que el cuerpo parezca roto. */
  if (items.length === 0) h += `<div class="sin-datos">— sin estudios —</div>`;

  if (o.diagnostico) {
    h += `<div class="datos-orden">`;
    h += `<div class="diagnostico"><span class="rotulo">Diagnóstico:</span> ${esc(o.diagnostico)}</div>`;
    h += `</div>`;
  }

  h += pieRpe(o.fecha);
  h += `</section>`;
  return h;
}

/* La orden con la ropa de la receta retro: el mismo membrete (sin número: la
   orden no lleva), las mismas cajas, el mismo pie. Donde la receta dice «Rp/»
   va el encabezado del pedido, en la misma tinta y el mismo cuerpo, y es texto
   libre («Solicito:» si no se escribió otro). Los estudios van numerados en el
   margen como los medicamentos, pero sin la raya doble entre uno y otro: un
   pedido de laboratorio puede tener diez renglones y la raya los separaría de
   más. El diagnóstico va una sola vez, al final, porque es de la orden entera. */
function ordenRetro(o) {
  const p = o.paciente || {};
  const m = o.medico || {};
  const items = o.items || [];

  let h = `<section class="rx-hoja rx-hoja--retro rx-hoja--orden">`;
  h += membreteRetro(o.membrete === false ? {} : m, '');
  h += cajasRetro(p);

  h += `<div class="encabezado-rp"><div class="rp">${esc(encabezadoOrden(o))}</div></div>`;

  items.forEach((it, i) => {
    h += `<div class="item estudio"><div class="num">${i + 1}.</div><div class="principal">`;
    h += `<div class="dato t1">${esc(it.nombre || '—')}</div>`;
    if (it.aclaracion) h += `<div class="det"><span class="dato">${esc(it.aclaracion)}</span></div>`;
    h += `</div></div>`;
  });

  if (items.length === 0) h += `<div class="sin-datos">— sin estudios —</div>`;

  if (o.diagnostico) {
    h += `<div class="det datos-orden"><span class="rot">Diagnóstico:</span> `
       + `<span class="dato">${esc(o.diagnostico)}</span></div>`;
  }

  h += pieRetro(o.fecha);
  h += `</section>`;
  return h;
}

/**
 * Arma UNA hoja.
 *
 * El tipo manda antes que la plantilla: una orden es RPE o retro, nunca la
 * clásica.
 * Sin `tipo`, es una receta — es lo que había antes de que existiera la orden
 * y lo que sigue llegando desde los snapshots viejos.
 *
 * @param {object} d  receta {paciente, medico, items, fecha, plantilla, numero,
 *                            membrete}
 *                    u orden {tipo:'orden', paciente, medico, items, fecha,
 *                             diagnostico, plantilla, encabezado, membrete}
 * @param {{duplicado?: boolean}} opts
 */
export function hoja(d, { duplicado = false } = {}) {
  if (d?.tipo === 'orden') return d.plantilla === 'retro' ? ordenRetro(d) : orden(d);
  const plantilla = { rpe, retro }[d?.plantilla] || clasica;
  return plantilla(d || {}, duplicado);
}

/**
 * El juego completo que se imprime.
 *
 * La receta van siempre las dos hojas — el duplicado es lo que se queda la
 * farmacia. La orden sale en UNA: se la queda el laboratorio y listo.
 */
export function juego(d) {
  if (d?.tipo === 'orden') return hoja(d);
  return hoja(d, { duplicado: false }) + hoja(d, { duplicado: true });
}
