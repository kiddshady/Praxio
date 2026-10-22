/* Catálogo de estudios frecuentes. No es un nomenclador: es la lista corta de
   lo que esta doctora pide seguido, para no tipearlo cada vez. Se ordena por
   uso, así los de todos los días flotan arriba solos. Mismo criterio que el
   catálogo de medicamentos, que es el hermano de esta vista. */

import { Modal, Toast } from '../overlays.js';
import Router from '../router.js';
import { paint, head, esc, empty, attempt } from '../ui.js';
import { plural } from '../format.js';

const rx = window.rx;

function formulario(e = {}) {
  const caja = document.createElement('div');
  caja.className = 'op-col';
  caja.style.gap = 'var(--op-3)';
  caja.innerHTML = `
    <div class="op-field">
      <label class="op-field__label" for="e-nombre">Test or procedure</label>
      <input class="op-input" id="e-nombre" spellcheck="false"
             placeholder="Hemograma completo" value="${esc(e.nombre || '')}">
    </div>
    <div class="op-field">
      <label class="op-field__label" for="e-aclaracion">Usual note</label>
      <input class="op-input" id="e-aclaracion" spellcheck="false"
             placeholder="En ayunas de 8 horas" value="${esc(e.aclaracion || '')}">
      <span class="op-field__hint">Filled in automatically when you order it, and it can be changed on the order.</span>
    </div>`;
  return caja;
}

async function editar(e) {
  const cuerpo = formulario(e);
  const val = await Modal.show({
    title: e?.id ? 'Edit test' : 'New test',
    body: cuerpo,
    width: 520,
    actions: [
      { label: 'Cancel', value: null },
      { label: 'Save', value: 'ok', variant: 'primary' },
    ],
  });
  if (val !== 'ok') return false;

  const datos = {
    id: e?.id,
    nombre: cuerpo.querySelector('#e-nombre').value,
    aclaracion: cuerpo.querySelector('#e-aclaracion').value,
  };
  const ok = await attempt(() => rx.estudios.save(datos), { errorTitle: 'Could not save' });
  return ok !== undefined;
}

export async function vistaEstudios(busqueda = '') {
  const lista = await rx.estudios.list({ busqueda });

  paint(head({
    title: 'Tests',
    /* `plural()` ya trae el número adelante: no se le antepone otro. */
    sub: lista.length
      ? `${plural(lista.length, 'test')} in the catalog`
      : 'The ones you order often, so you never type them again',
    actions: `<button class="op-btn op-btn--primary op-flashable" id="e-nuevo">
                <i data-icon="plus"></i> New</button>`,
  }) + `
    <div class="op-scroll op-grow op-scroll--line-bottom">
      <div class="op-inputwrap rx-buscador" style="margin-bottom:var(--op-4)">
        <i data-icon="search"></i>
        <input class="op-input" id="e-buscar" placeholder="Search…" spellcheck="false"
               value="${esc(busqueda)}">
      </div>
      ${lista.length === 0
      ? empty({
        icon: 'estudio',
        title: busqueda ? 'Nothing matches that search' : 'The catalog is empty',
        text: busqueda ? '' : 'Add the ones you order often and they will show up here.',
      })
      : `<div class="op-list">${lista.map((e) => `
          <div class="op-listitem">
            <div class="op-iconcell"><i data-icon="estudio"></i></div>
            <div class="op-listitem__main">
              <div class="op-listitem__title">${esc(e.nombre)}</div>
              <div class="op-listitem__sub op-truncate">${esc(e.aclaracion || '—')}</div>
            </div>
            <div class="op-listitem__aside">
              ${e.usos > 0 ? `<span class="op-chip op-chip--mono" data-tip="Times you ordered it">${e.usos}</span>` : ''}
            </div>
            <div class="op-rowactions">
              <button class="op-iconbtn op-iconbtn--sm" data-editar="${esc(e.id)}"
                      data-tip="Edit"><i data-icon="edit"></i></button>
              <button class="op-iconbtn op-iconbtn--sm" data-borrar="${esc(e.id)}"
                      data-tip="Delete"><i data-icon="trash"></i></button>
            </div>
          </div>`).join('')}</div>`}
    </div>`);

  const buscar = document.getElementById('e-buscar');
  let reloj = null;
  buscar.addEventListener('input', () => {
    clearTimeout(reloj);
    // Se espera a que deje de tipear: repintar por tecla hace parpadear la lista.
    reloj = setTimeout(() => vistaEstudios(buscar.value), 160);
  });
  Router.onLeave(() => clearTimeout(reloj));

  document.getElementById('e-nuevo').onclick = async () => {
    if (await editar({})) vistaEstudios(busqueda);
  };

  for (const b of document.querySelectorAll('[data-editar]')) {
    b.onclick = async () => {
      const e = lista.find((x) => x.id === b.dataset.editar);
      if (e && await editar(e)) vistaEstudios(busqueda);
    };
  }

  for (const b of document.querySelectorAll('[data-borrar]')) {
    b.onclick = async () => {
      const e = lista.find((x) => x.id === b.dataset.borrar);
      const ok = await Modal.confirm({
        title: 'Remove from the catalog',
        sub: `"${e.nombre}" is taken off the list. Test orders already issued are not touched.`,
        confirmLabel: 'Remove',
        danger: true,
      });
      if (!ok) return;
      await attempt(() => rx.estudios.remove(e.id), { errorTitle: 'Could not remove' });
      Toast.show({ title: 'Removed', text: e.nombre, icon: 'trash' });
      vistaEstudios(busqueda);
    };
  }
}
