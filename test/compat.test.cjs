'use strict';

/* Compatibilidad hacia atrás de la base cifrada.

     npm run test:compat

   test/fixtures/base-v12 la hizo la librería de cifrado vieja (ver su
   LEEME.txt). Esta prueba la copia a una carpeta temporal, la abre con la
   librería que esté instalada AHORA y comprueba que se lee entera y bien. Si
   alguna vez falla después de actualizar Electron o SQLCipher, la versión
   nueva no se publica: del otro lado hay historias clínicas reales que tienen
   que seguir abriendo. */

const { app } = require('electron');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FIXTURE = path.join(__dirname, 'fixtures', 'base-v12');
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'quirotech-compat-'));
for (const f of ['rx.db', 'llave.json']) fs.copyFileSync(path.join(FIXTURE, f), path.join(carpeta, f));
process.env.RX_DATA = carpeta;

const llave = require('../src/llave.cjs');
const db = require('../src/db.cjs');

let pasaron = 0, fallaron = 0;
async function prueba(nombre, fn) {
  try { await fn(); pasaron++; console.log('  OK    ' + nombre); }
  catch (err) { fallaron++; console.log('  FALLA ' + nombre + '\n        ' + (err.message || err)); }
}

app.whenReady().then(async () => {
  const version = require('better-sqlite3-multiple-ciphers/package.json').version;
  console.log(`\ncompat — la base de la v12 contra la ${version} en Electron ${process.versions.electron}\n`);

  await prueba('una contraseña equivocada no la abre', async () => {
    const mala = await llave.derivarGuardada('no-es-esta');
    assert.throws(() => db.abrir(mala));
  });

  await prueba('la contraseña correcta la abre', async () => {
    db.abrir(await llave.derivarGuardada('quirotech-compat'));
    assert.ok(db.abierta());
  });

  await prueba('el profesional está y dice lo mismo', () => {
    const m = db.medico.get();
    assert.equal(m.apellido_nombre, 'DRA. PRUEBA, ANA');
    assert.equal(m.matricula, '11111');
  });

  let paciente = null;
  await prueba('el paciente está, con los acentos intactos', () => {
    const lista = db.pacientes.list({});
    assert.equal(lista.length, 1);
    paciente = db.pacientes.get(lista[0].id);
    assert.equal(paciente.apellido_nombre, 'COMPATIBLE, PACIENTE DE');
    assert.equal(paciente.antecedentes, 'Ñandú, acentos y ü para ver que el texto vuelve igual.');
    assert.equal(paciente.alergias, 'Penicilina');
  });

  await prueba('la evolución, la receta y la orden siguen ahí', () => {
    const evo = db.evoluciones.list(paciente.id);
    assert.equal(evo.length, 1);
    assert.equal(evo[0].presion, '120/80');
    const recetas = db.recetas.list({ pacienteId: paciente.id, limite: 10 });
    assert.equal(recetas.length, 1);
    const receta = db.recetas.get(recetas[0].id);
    assert.equal(receta.plantilla, 'retro');
    assert.ok(JSON.stringify(receta).includes('Levotiroxina 75 mcg'));
    const ordenes = db.ordenes.list({ pacienteId: paciente.id, limite: 10 });
    assert.equal(ordenes.length, 1);
    assert.ok(JSON.stringify(db.ordenes.get(ordenes[0].id)).includes('TSH y T4 libre'));
  });

  await prueba('se puede seguir escribiendo y la base queda íntegra', () => {
    db.evoluciones.save({ paciente_id: paciente.id, fecha: '2026-10-13', motivo: 'Después de actualizar' });
    assert.equal(db.evoluciones.list(paciente.id).length, 2);
    assert.deepEqual(db.integridad(), ['ok']);
  });

  try { db.cerrar(); } catch { /* ya cerrada */ }
  try { fs.rmSync(carpeta, { recursive: true, force: true }); } catch { /* Windows */ }
  console.log(`\n${pasaron} bien, ${fallaron} mal\n`);
  app.exit(fallaron ? 1 : 0);
});
