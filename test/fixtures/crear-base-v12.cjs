'use strict';

/* Crea test/fixtures/base-v12: una base cifrada hecha con la librería de
   cifrado que Quirotech usó hasta la 0.2.0 (better-sqlite3-multiple-ciphers
   12.11.1, en Electron 40). Se corrió UNA vez, con esas versiones instaladas,
   y el resultado está commiteado: no se vuelve a generar, porque su valor es
   justamente que la hizo la versión vieja.

     npx electron test/fixtures/crear-base-v12.cjs

   La prueba que la usa es test/compat.test.cjs: cada versión nueva de la
   librería tiene que abrirla con la contraseña y leer lo mismo. Son los
   pacientes reales de alguien: un cambio de librería que no abre la base de
   antes no se publica. */

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DESTINO = path.join(__dirname, 'base-v12');
const CLAVE = 'quirotech-compat';

fs.rmSync(DESTINO, { recursive: true, force: true });
fs.mkdirSync(DESTINO, { recursive: true });
process.env.RX_DATA = DESTINO;

const llave = require('../../src/llave.cjs');
const db = require('../../src/db.cjs');

app.whenReady().then(async () => {
  const version = require('better-sqlite3-multiple-ciphers/package.json').version;
  const clave = await llave.configurar(CLAVE);
  db.abrir(clave);

  db.medico.save({ apellido_nombre: 'DRA. PRUEBA, ANA', matricula: '11111', especialidad: 'Clínica médica' });
  const p = db.pacientes.save({
    apellido_nombre: 'COMPATIBLE, PACIENTE DE', dni: '30111222', sexo: 'Femenino',
    nacimiento: '1985-03-09', cobertura: 'OSEP', alergias: 'Penicilina',
    antecedentes: 'Ñandú, acentos y ü para ver que el texto vuelve igual.',
  });
  db.evoluciones.save({ paciente_id: p.id, fecha: '2026-10-01', motivo: 'Control', notas: 'Sin novedades.', presion: '120/80' });
  db.recetas.emitir({
    paciente_id: p.id, fecha: '2026-10-02', plantilla: 'retro',
    items: [{ nombre: 'Levotiroxina 75 mcg', dosis: '1 comprimido en ayunas', envases: 2 }],
  });
  db.ordenes.emitir({
    paciente_id: p.id, fecha: '2026-10-03', diagnostico: 'Control anual',
    items: [{ nombre: 'Hemograma completo' }, { nombre: 'TSH y T4 libre' }],
  });
  db.cerrar();

  // Sin los archivos del WAL: el fixture es un solo .db consistente.
  for (const f of fs.readdirSync(DESTINO)) {
    if (f.endsWith('-wal') || f.endsWith('-shm')) fs.rmSync(path.join(DESTINO, f));
  }
  fs.writeFileSync(path.join(DESTINO, 'LEEME.txt'),
    `Base de prueba hecha con better-sqlite3-multiple-ciphers ${version} en Electron ${process.versions.electron}.\n`
    + `Contraseña: ${CLAVE}\nLa genera test/fixtures/crear-base-v12.cjs y la usa test/compat.test.cjs. No regenerar.\n`);
  console.log(`base-v12 creada con la ${version} en Electron ${process.versions.electron}: ${fs.readdirSync(DESTINO).join(', ')}`);
  app.exit(0);
}).catch((err) => { console.error(err); app.exit(1); });
